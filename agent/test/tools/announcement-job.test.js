/**
 * Tests for announcement job helpers (no API/Supabase calls).
 * Run from agent/: node test/announcement-job.test.js
 */
const assert = require('assert');
const {
    summariseRow,
    extractUserLine,
    buildMetadata,
    SYSTEM_PROMPT,
} = require('../../jobs/announcement-job');

// ─── extractUserLine ─────────────────────────────────────────────

const userTextSample = [
    'Online now (this server): Alice, Bob',
    '',
    'Recent messages above (newest first):',
    '[Bot]: Sure thing!',
    '[swim_one]: hello parrot',
    '',
    'User @swim_one in #general wrote: "set a timer for 5 min"',
].join('\n');

const extracted = extractUserLine(userTextSample);
assert(extracted === 'set a timer for 5 min', `extractUserLine got: "${extracted}"`);

const noMatch = extractUserLine('some random text without the pattern');
assert(typeof noMatch === 'string' && noMatch.length > 0, 'extractUserLine fallback returns non-empty');

const longContent = 'User @bob in #chat wrote: "' + 'x'.repeat(200) + '"';
const longExtracted = extractUserLine(longContent);
assert(longExtracted.length <= 125, `extractUserLine caps long content: ${longExtracted.length} chars`);

console.log('  extractUserLine: OK');

// ─── summariseRow ────────────────────────────────────────────────

const row = {
    created_at: '2026-02-15T18:30:00Z',
    channel_id: '123',
    user_text: userTextSample,
    response_text: 'Alrighty — timer set for 5 minutes.',
    tools_called: ['create_timer'],
};

const summary = summariseRow(row);
assert(typeof summary === 'string', 'summariseRow returns string');
assert(summary.includes('create_timer'), 'summariseRow includes tool name');
assert(summary.includes('Parrot:'), 'summariseRow includes "Parrot:" label');
assert(summary.includes('User:'), 'summariseRow includes "User:" label');

const noToolsRow = { ...row, tools_called: [] };
const summaryNoTools = summariseRow(noToolsRow);
assert(!summaryNoTools.includes('[tools:'), 'summariseRow omits tools block when empty');

console.log('  summariseRow: OK');

// ─── buildMetadata ───────────────────────────────────────────────

const rows = [
    { channel_id: 'ch1', tools_called: ['run_roast'] },
    { channel_id: 'ch1', tools_called: ['search_web'] },
    { channel_id: 'ch2', tools_called: ['run_roast', 'join_voice_and_squawk'] },
    { channel_id: 'ch2', tools_called: [] },
    { channel_id: null, tools_called: null },
];

const meta = buildMetadata(rows);
assert(meta.conversation_count === 5, `count=${meta.conversation_count}`);
assert(meta.tools_used.run_roast === 2, `roast=${meta.tools_used.run_roast}`);
assert(meta.tools_used.search_web === 1, `search=${meta.tools_used.search_web}`);
assert(meta.tools_used.join_voice_and_squawk === 1, `voice=${meta.tools_used.join_voice_and_squawk}`);
assert(meta.channel_ids.length === 2, `channels=${meta.channel_ids.length}`);
assert(meta.channel_ids.includes('ch1') && meta.channel_ids.includes('ch2'), 'correct channel ids');

console.log('  buildMetadata: OK');

// ─── SYSTEM_PROMPT ───────────────────────────────────────────────

assert(typeof SYSTEM_PROMPT === 'string' && SYSTEM_PROMPT.length > 0, 'SYSTEM_PROMPT is non-empty');
assert(SYSTEM_PROMPT.includes('3 sentences'), 'SYSTEM_PROMPT mentions 3-sentence limit');
assert(SYSTEM_PROMPT.includes('legible'), 'SYSTEM_PROMPT mentions legible');
assert(SYSTEM_PROMPT.includes('day of the week'), 'SYSTEM_PROMPT mentions day of the week');

console.log('  SYSTEM_PROMPT: OK');

// ─── Done ────────────────────────────────────────────────────────
console.log('\nAnnouncement job tests: ALL PASSED');
