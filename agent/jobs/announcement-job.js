/**
 * Announcement job: every 6 hours, fetch recent conversation history,
 * ask the parrot (LLM) for a short rundown, and insert it into parrot_announcements.
 *
 * No Discord dependency — only needs Supabase and OpenAI.
 * Run via agent/jobs/scheduler.js or call generateAndSaveAnnouncement() directly.
 */

const { generateText } = require('ai');
const { getModel, DEFAULT_MODEL } = require('../ai-sdk/model-provider');
const parrotConfig = require('../config/parrot');
const { getConversationsForPeriod } = require('../supabase/conversation-history');
const { insertAnnouncement } = require('../supabase/announcements');

const LOG = '[Announcement job]';
const WINDOW_HOURS = Number(process.env.ANNOUNCEMENT_WINDOW_HOURS) || 6;
const MAX_ROWS = 100;
const MAX_CONTEXT_CHARS = 6000;

const SYSTEM_PROMPT = [
    'You are a friendly parrot who writes short announcements for a Discord server.',
    'You will receive a summary of conversations from the last few hours, along with the day of the week.',
    'Write a rundown in exactly 1 to 3 sentences. Keep it clear, legible, and casual.',
    'Start by naturally mentioning the day of the week (e.g. "This Saturday night..." or "Quiet Monday...").',
    'Mention the types of conversations (chat, roasts, voice, research, timers, polls) and any notable activity.',
    'Do NOT use jargon, run-on sentences, or excessive slang. Write so any user can understand.',
    'If there were no conversations, say something short like "Quiet Monday — no chats to report."',
].join(' ');

/**
 * Summarise a conversation row into a short context line for the LLM.
 * Caps user_text and response_text to keep total context manageable.
 */
function summariseRow(row) {
    const time = row.created_at ? new Date(row.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '?';
    const tools = Array.isArray(row.tools_called) && row.tools_called.length > 0
        ? ` [tools: ${row.tools_called.join(', ')}]`
        : '';

    const userSnippet = (row.user_text || '').trim();
    const userLine = extractUserLine(userSnippet);
    const response = (row.response_text || '').trim().slice(0, 120);

    return `${time}${tools} — User: ${userLine} → Parrot: ${response}`;
}

/**
 * Extract the "User @X in #Y wrote: ..." line from user_text (last meaningful line).
 * Falls back to first 120 chars of the raw text.
 */
function extractUserLine(userText) {
    const match = userText.match(/User\s+@.+?\s+in\s+#.+?\s+wrote:\s*"(.+)"/s);
    if (match) {
        const content = match[1].trim();
        return content.length > 120 ? content.slice(0, 120) + '…' : content;
    }
    return userText.slice(0, 120) + (userText.length > 120 ? '…' : '');
}

/**
 * Build metadata (tool counts, conversation count, unique channels).
 */
function buildMetadata(rows) {
    const toolCounts = {};
    const channelIds = new Set();
    for (const row of rows) {
        if (row.channel_id) channelIds.add(row.channel_id);
        if (Array.isArray(row.tools_called)) {
            for (const t of row.tools_called) {
                toolCounts[t] = (toolCounts[t] || 0) + 1;
            }
        }
    }
    return {
        conversation_count: rows.length,
        tools_used: toolCounts,
        channel_ids: [...channelIds],
    };
}

/**
 * Main entry: generate and save an announcement for the last WINDOW_HOURS.
 *
 * @param {{ windowHours?: number, dryRun?: boolean }} [options]
 * @returns {Promise<{ ok: boolean; rundown_text?: string; error?: string }>}
 */
async function generateAndSaveAnnouncement(options = {}) {
    const windowHours = options.windowHours ?? WINDOW_HOURS;
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - windowHours * 60 * 60 * 1000);

    console.log(`${LOG} Generating announcement for ${periodStart.toISOString()} → ${periodEnd.toISOString()}`);

    // 1. Fetch conversation history for the period.
    const { data: rows, error: fetchError, count } = await getConversationsForPeriod(
        periodStart, periodEnd, { limit: MAX_ROWS }
    );

    if (fetchError) {
        console.error(`${LOG} Failed to fetch conversations:`, fetchError);
        return { ok: false, error: fetchError };
    }

    console.log(`${LOG} Found ${count} conversation(s) in period (fetched ${rows.length}).`);

    // 2. Build context for the LLM.
    let contextBlock = '';
    if (rows.length === 0) {
        contextBlock = 'No conversations in this period.';
    } else {
        const lines = [];
        let totalChars = 0;
        for (const row of rows) {
            const line = summariseRow(row);
            if (totalChars + line.length > MAX_CONTEXT_CHARS) break;
            lines.push(line);
            totalChars += line.length;
        }
        contextBlock = lines.join('\n');
    }

    const dayOfWeek = periodEnd.toLocaleDateString('en-US', { weekday: 'long' });

    const userMessage = [
        `Day: ${dayOfWeek}`,
        `Here are the parrot's conversations from the last ${windowHours} hours:`,
        '',
        contextBlock,
        '',
        `Total conversations: ${count}. Write your 1–3 sentence rundown now (mention the day of the week).`,
    ].join('\n');

    // 3. Call LLM (no tools, single completion). Uses same model as parrot config when set.
    const modelId = parrotConfig.model || DEFAULT_MODEL;
    console.log(`${LOG} Using model "${modelId}" for announcement rundown.`);
    let rundownText;
    try {
        const model = getModel(modelId);
        const result = await generateText({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
            ],
            maxTokens: 200,
        });
        rundownText = (result.text || '').trim();
    } catch (err) {
        console.error(`${LOG} LLM error:`, err.message || err);
        return { ok: false, error: err.message || 'LLM error' };
    }

    if (!rundownText) {
        console.warn(`${LOG} LLM returned empty text.`);
        rundownText = 'Quiet hours — nothing to report. Squawk!';
    }

    console.log(`${LOG} Rundown (${rundownText.length} chars): ${rundownText.slice(0, 100)}${rundownText.length > 100 ? '…' : ''}`);

    // 4. Insert into parrot_announcements.
    const metadata = buildMetadata(rows);

    if (options.dryRun) {
        console.log(`${LOG} Dry run — skipping insert.`);
        return { ok: true, rundown_text: rundownText, metadata };
    }

    const { ok, error: insertError } = await insertAnnouncement({
        period_start: periodStart,
        period_end: periodEnd,
        rundown_text: rundownText,
        metadata,
    });

    if (!ok) {
        console.error(`${LOG} Insert failed:`, insertError);
        return { ok: false, error: insertError };
    }

    console.log(`${LOG} Announcement saved.`);
    return { ok: true, rundown_text: rundownText, metadata };
}

module.exports = {
    generateAndSaveAnnouncement,
    // Exported for testing:
    summariseRow,
    extractUserLine,
    buildMetadata,
    SYSTEM_PROMPT,
};
