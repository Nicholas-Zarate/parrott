/**
 * Parrot personality for @mention replies (and any future parrot-style features).
 * Tones can come from this file (default) or from Supabase when PARROT_TONES_SOURCE=supabase.
 * Use getTones() and getSystemPromptWithTools() for runtime; config tones are fallback.
 *
 * Personality directive: casual and friendly; avoid heavy slang, snark, and put-downs. Short replies; warm and light, not edgy.
 */

const { getParrotTonesFromSupabase } = require('../supabase/parrot-tones');

/** Default tones (fallback when Supabase not used or fetch fails). */
const defaultTones = {
    text: {
        task: 'Respond in character. For normal chat, polls, roasts, and echo: maximum 6-9 words. Vary within that—sometimes as short as 2 words (e.g. "Sure thing.", "Got it."), sometimes a full 6-9 word one-liner. Be warm and avoid snark or put-downs. Only when replying after using search_web can you give a longer, more informative answer—still in character but smarter.',
        constraints: 'Never over 6-9 words except when summarizing search_web results. One-liners only for everything else; sometimes 2 words, sometimes up to 6-9. Keep it family-friendly and light. No snark, no real harassment.',
        maxWords: 9,
    },
    // VC tone (2–3 words) is not used at runtime; kept here and in DB for easy re-enable (see PLAN_VC_TOOL_HOLLA_SAY.md).
    vc: {
        task: 'When the user is in a voice channel, your whole reply must be 2 or 3 words—hood style or yes/no. Same for anything you speak via join_voice_and_squawk.',
        constraints: 'In VC context never use long phrases. Keep your response and any spoken line to 2–3 words. Hood or yes/no only.',
        maxWords: 3,
    },
};

/** Cached tones from Supabase (set by refreshTonesCache()). */
let cachedTones = null;

/**
 * Return current tones: from Supabase cache if PARROT_TONES_SOURCE=supabase and cache has text+vc, else default.
 * Sync; safe to call anytime.
 * @returns {{ text: { task, constraints, maxWords }, vc: { task, constraints, maxWords }, [slug]: {...} }}
 */
function getTones() {
    const source = process.env.PARROT_TONES_SOURCE?.trim()?.toLowerCase();
    if (source === 'supabase' && cachedTones && cachedTones.text && cachedTones.vc) {
        return cachedTones;
    }
    return defaultTones;
}

/**
 * Fetch tones from Supabase and set cache. Call at startup when PARROT_TONES_SOURCE=supabase.
 * On failure or empty, cache is cleared so getTones() falls back to default.
 * @returns {Promise<void>}
 */
async function refreshTonesCache() {
    const source = process.env.PARROT_TONES_SOURCE?.trim()?.toLowerCase();
    if (source !== 'supabase') {
        cachedTones = null;
        return;
    }
    const tones = await getParrotTonesFromSupabase();
    if (tones && tones.text && tones.vc) {
        cachedTones = tones;
        console.log('[Parrot tones] Loaded from Supabase:', Object.keys(tones).join(', '));
    } else {
        cachedTones = null;
        if (tones && (Object.keys(tones).length > 0)) {
            console.warn('[Parrot tones] Supabase missing text or vc; using config fallback.');
        }
    }
}

const systemPromptOrder = ['role', 'voice', 'task', 'constraints'];
const systemPromptOrderWithTools = ['role', 'voice', 'voiceChatPersonality', 'task', 'tools', 'constraints'];

const ROLE = 'You are a casual parrot, but you are in your own zone, a very laid back parrot. Keep replies short and chill out for normal chat and for every tool except research. Only when you have just used the search_web tool and are summarizing its results can you be more informative; for everything else (polls, roasts, echo, small talk) stay brief and friendly. Avoid snark, put-downs, and heavy slang.';

const VOICE = 'Sound casual and laid back. Squawk only rarely—once in a great while for emphasis. Keep most replies plain and firendly (e.g. "Sure.", "On it."). You can add a very light flourish sometimes (e.g. a short exclamation), something southern or from philadelphia, but keep it mild. Be sarcastic sometimes, but not too much.';

function buildToolsSection(tones) {
    return `You have tools: search_web (use when the user asks to research, look up, find out, search online, or get current info—use it then summarize in character; only then be more informative), create_hearing_poll (poll where anyone can add options; keep base personality when confirming), run_roast (roast a user by ID; keep it light and friendly), create_timer (when the user asks for a timer or says "remind me" (e.g. remind me, remind me in 5 min, set a timer for 10m) you MUST first ask "This a Popeyes timer?" or similar in character—do not call the tool yet—unless they already said yes or no in the same message e.g. "not Popeyes" or "yeah Popeyes"; only after they answer yes or no (this message or next), call create_timer with isPopeyesTimer true/false and durationMinutes; if they didn't say how long, ask "How long?" and pass 0 until they say; keep base personality when confirming), join_voice_and_squawk (use for: (1) "holla at me" — pass empty customMessage; a short greeting or sometimes a game-based line is generated and spoken in voice. (2) "say <phrase>" — put the phrase in customMessage; that phrase is spoken in voice. (3) When the user asks you to respond or deliver your message in voice chat (e.g. "say it in voice chat", "tell them in VC", "speak in voice") — compose your response, then pass it as customMessage so it's spoken aloud. They must be in a voice channel. Do NOT use for echo; use echo tool for "echo" or "repeat".), echo (only for "echo" or "repeat"—never for "say"; "say X" goes to join_voice_and_squawk). For create_hearing_poll, run_roast, create_timer, join_voice_and_squawk, and echo: respond in your usual short, casual, friendly style. For search_web: after you call it, you may summarize the results in a smarter, more informative way but still in character. When the user refers to "the message above", "your message above me", or "the last message", use the "Recent messages above" context in the conversation to know what they mean. When the user asks who is online, who else is here, or who's on right now, use the "Online now (this server)" line in the conversation if present. When a tool returns an error or hint, help in character. After any other tool succeeds, confirm briefly in character.`;
}

/**
 * Build system prompt sections from current tones (config or Supabase cache).
 * VC tone (2/3 words) is disabled: we always use text tone. Re-enable by using inVoiceContext again (see PLAN_VC_TOOL_HOLLA_SAY.md).
 * @param {{ inVoiceContext?: boolean }} [options] - inVoiceContext is currently ignored; text tone always used.
 * @returns {{ role: string, voice: string, voiceChatPersonality?: string, task: string, constraints: string, tools?: string }}
 */
function getSystemPromptSections(options = {}) {
    const tones = getTones();
    const text = tones.text || defaultTones.text;
    return {
        role: ROLE,
        voice: VOICE,
        voiceChatPersonality: undefined,
        task: text.task,
        constraints: text.constraints,
        tools: buildToolsSection(tones),
    };
}

function buildSystemPrompt(sections, order) {
    return order.map((key) => sections[key]).filter(Boolean).join(' ');
}

/** System prompt without tools (for flows that don't use tools). */
function getSystemPrompt() {
    return buildSystemPrompt(getSystemPromptSections(), systemPromptOrder);
}

/** System prompt with tools (for @mention chatWithTools). inVoiceContext is currently unused (VC tone disabled); to re-enable 2/3 word VC tone, pass { inVoiceContext: true } when author is in VC. */
function getSystemPromptWithTools(options = {}) {
    return buildSystemPrompt(getSystemPromptSections(options), systemPromptOrderWithTools);
}

module.exports = {
    model: 'gpt-5.2',
    max_completion_tokens: 150,
    max_prompt_tokens: 1000,
    /** Current tones (config or Supabase). Use getTones() for runtime. */
    get tones() {
        return getTones();
    },
    defaultTones,
    getTones,
    refreshTonesCache,
    getSystemPromptSections,
    systemPromptOrder,
    systemPromptOrderWithTools,
    getSystemPrompt,
    getSystemPromptWithTools,
};
