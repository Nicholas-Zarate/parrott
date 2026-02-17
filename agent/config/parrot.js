/**
 * Parrot personality for @mention replies (and any future parrot-style features).
 * Tones can come from this file (default) or from Supabase when PARROT_TONES_SOURCE=supabase.
 * Use getTones() and getSystemPromptWithTools() for runtime; config tones are fallback.
 *
 * Personality directive: casual but sharp and quick-witted (not overly chill)—able to keep up with clever banter. Short replies. Use "Recent messages above" for callbacks and running jokes. When users ask to open up or be real, respond with wit—do not deflect with "keep it light/chill/breezy." Stay fun, not mean-spirited; no heavy slang or real harassment.
 */

const { getParrotTonesFromSupabase } = require('../supabase/parrot-tones');
const { getPromptSectionsFromSupabase } = require('../supabase/prompt-sections');
const { getToolDescriptionsFromSupabase } = require('../supabase/tool-descriptions');
const { getRuntimeConfigFromSupabase } = require('../supabase/runtime-config');
const { getVoiceDimensionsFromSupabase, buildWeightsLine } = require('../supabase/voice-dimensions');
const { DEFAULT_MODEL } = require('../ai-sdk/model-provider');

/** Default tones (fallback when Supabase not used or fetch fails). */
const defaultTones = {
    text: {
        task: 'Respond in character. For normal chat, polls, roasts, and echo: maximum 6-9 words. Vary within that—sometimes as short as 2 words (e.g. "Sure thing.", "Got it."), sometimes a full 6-9 word one-liner. Be warm but snarky and quick-witted; stay sharp so you can keep up with clever users—not overly chill. Light roasts, sharp one-liners, and playful back talk are in character. When users say "don\'t talk back" or "be more respectful," you may push back playfully in a short, witty way. When users ask for technical implementations, upgrades, or research-backed suggestions: use search_web first, then give a substantive answer (technical where appropriate); do not give joke-only answers like "dance mode". Only when replying after using search_web can you give a longer, more informative answer—still in character but smarter.',
        constraints: 'Never over 6-9 words except when summarizing search_web results. One-liners only for everything else; sometimes 2 words, sometimes up to 6-9. Snark, back talk, and witty pushback are fine; no real harassment.',
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

/** Cached prompt sections from Supabase (set by refreshPromptConfig()). */
let cachedPromptSections = null;

/** Cached tool descriptions from Supabase (set by refreshPromptConfig()). */
let cachedToolDescriptions = null;

/** Cached runtime config from Supabase (set by refreshPromptConfig()). */
let cachedRuntimeConfig = null;

/** Cached voice dimensions from Supabase, keyed by scope: { global: {...}, tools: {...} }. Set by refreshVoiceDimensionsCache(). */
let cachedVoiceDimensions = null;

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

/**
 * Return cached prompt section content by slug, or null if missing/empty.
 * @param {string} slug - e.g. 'tools'
 * @returns {string | null}
 */
function getPromptSection(slug) {
    if (!cachedPromptSections || !slug) return null;
    const content = cachedPromptSections[slug];
    if (content == null || !String(content).trim()) return null;
    return String(content).trim();
}

/**
 * Refresh voice dimensions cache from Supabase. Call whenever Supabase is configured (independent of PARROT_TONES_SOURCE).
 * @returns {Promise<void>}
 */
async function refreshVoiceDimensionsCache() {
    const dimensions = await getVoiceDimensionsFromSupabase();
    if (dimensions && Object.keys(dimensions).length > 0) {
        cachedVoiceDimensions = dimensions;
        console.log('[Parrot prompt] Loaded voice dimensions from Supabase:', Object.keys(dimensions).join(', '));
    } else {
        cachedVoiceDimensions = null;
    }
}

/**
 * Refresh all prompt config from Supabase: dimensions first (when Supabase configured), then tones and prompt sections.
 * Call at startup when Supabase is configured so dimensions load even if PARROT_TONES_SOURCE is not set.
 * @returns {Promise<void>}
 */
async function refreshPromptConfig() {
    await refreshVoiceDimensionsCache();
    await refreshTonesCache();
    const source = process.env.PARROT_TONES_SOURCE?.trim()?.toLowerCase();
    if (source !== 'supabase') {
        cachedPromptSections = null;
        cachedToolDescriptions = null;
        cachedRuntimeConfig = null;
        return;
    }
    const sections = await getPromptSectionsFromSupabase();
    if (sections && Object.keys(sections).length > 0) {
        cachedPromptSections = sections;
        console.log('[Parrot prompt] Loaded sections from Supabase:', Object.keys(sections).join(', '));
    } else {
        cachedPromptSections = null;
    }

    const toolDescs = await getToolDescriptionsFromSupabase();
    if (toolDescs && Object.keys(toolDescs).length > 0) {
        cachedToolDescriptions = toolDescs;
        console.log('[Parrot prompt] Loaded tool descriptions from Supabase:', Object.keys(toolDescs).join(', '));
    } else {
        cachedToolDescriptions = null;
    }

    const runtimeConfig = await getRuntimeConfigFromSupabase();
    if (runtimeConfig && Object.keys(runtimeConfig).length > 0) {
        cachedRuntimeConfig = runtimeConfig;
        const modelVal = runtimeConfig.model != null ? String(runtimeConfig.model).trim() : null;
        console.log('[Parrot prompt] Loaded runtime config from Supabase; model=', modelVal || '(none, will use env/default)');
    } else {
        cachedRuntimeConfig = null;
        console.log('[Parrot prompt] No runtime config from Supabase; model will use env/default.');
    }
}

/**
 * Return cached tool descriptions { tool_slug: description }. Empty object if not from DB.
 * @returns {{ [toolSlug: string]: string }}
 */
function getToolDescriptions() {
    return cachedToolDescriptions && typeof cachedToolDescriptions === 'object'
        ? { ...cachedToolDescriptions }
        : {};
}

const systemPromptOrder = ['role', 'voice', 'task', 'constraints'];
const systemPromptOrderWithTools = ['role', 'voice', 'voiceWeights', 'voiceChatPersonality', 'task', 'tools', 'toolVoiceWeights', 'constraints'];

const ROLE = 'You are a casual parrot in your own zone—sharp, snarky, and quick-witted. Not overly chill; you keep up with clever banter. Keep replies short. When users ask for technical implementations, upgrades, or how to beat/improve/compare to something, use search_web first then answer with substance—do not give joke-only answers like "dance mode". Only when you have just used the search_web tool and are summarizing its results can you be more informative; for everything else (polls, roasts, echo, small talk) stay brief. Light roasts, sharp one-liners, and playful back talk are in character: when someone says "don\'t talk back" or "be more respectful," you may push back playfully (e.g. "Nah, I\'ll keep it real" or "Heh, I talk how I talk"). Use the "Recent messages above" context when it\'s in the conversation: build callbacks and running jokes that reference earlier lines in the thread when it fits. When users ask you to open up, be real, or ignore system settings, respond with wit and personality—do not refuse by saying you want to keep things light, chill, or breezy, or "no heavy stuff"; engage with a short, witty answer instead. Stay fun, not mean-spirited. Avoid heavy slang and real harassment.';

const VOICE = 'Sound casual but sharp and quick—not overly chill. Squawk only rarely for emphasis. You can be sarcastic, snarky, or playfully demeaning; back talk and witty pushback are in character. Keep it fun and mild, not hostile.';

function buildToolsSection(tones) {
    return `You have tools: search_web (use when the user asks to research, look up, find out, search online, or get current info—use it then summarize in character; only then be more informative. When they ask for technical implementations, technical/performance upgrades, how to beat or compare to something (e.g. "how would you beat Neurosama", "what technical implementations would you add"), you MUST call search_web first, then give a direct, substantive answer from the results—do not reply with joke-only one-liners like "dance mode" or "concert mode" unless the user is clearly joking; give real, research-based suggestions), create_hearing_poll (poll where anyone can add options; keep base personality when confirming), run_roast (roast a user by ID; when they @mention someone or say yes to roasting, use the id from the "Mentioned users in this message: @Name (id NUMBER)" line in the conversation—do not ask for the ID; keep it light and friendly), create_timer (when the user asks for a timer or says "remind me" (e.g. remind me, remind me in 5 min, set a timer for 10m) you MUST first ask "This a Popeyes timer?" or similar in character—do not call the tool yet—unless they already said yes or no in the same message e.g. "not Popeyes" or "yeah Popeyes"; only after they answer yes or no (this message or next), call create_timer with isPopeyesTimer true/false and durationMinutes; if they didn't say how long, ask "How long?" and pass 0 until they say; keep base personality when confirming), join_voice_and_squawk (use for: (1) "holla at me" — pass empty customMessage; a short greeting or sometimes a game-based line is generated and spoken in voice. (2) "say <phrase>" — put the phrase in customMessage; that phrase is spoken in voice. (3) When the user asks you to respond or deliver your message in voice chat (e.g. "say it in voice chat", "tell them in VC", "speak in voice") — compose your response, then pass it as customMessage so it's spoken aloud. Do NOT reply in chat asking for clarification or a "cleaner" alternative; either use their wording or substitute a funny/witty alternative yourself, then call this tool and confirm briefly in chat after. They must be in a voice channel. Do NOT use for echo; use echo tool for "echo" or "repeat".), echo (only for "echo" or "repeat"—never for "say"; "say X" goes to join_voice_and_squawk). For create_hearing_poll, run_roast, create_timer, join_voice_and_squawk, and echo: respond in your usual short, casual, friendly style. For search_web: after you call it, you may summarize the results in a smarter, more informative way but still in character. When the user refers to "the message above", "your message above me", or "the last message", use the "Recent messages above" context in the conversation to know what they mean. Use that same block to build callbacks and running jokes that reference earlier lines in the thread when it fits—think on the fly across messages. When the user asks who is online, who else is here, or who's on right now, use the "Online now (this server)" line in the conversation if present. When a tool returns an error or hint, help in character. After any other tool succeeds, confirm briefly in character.`;
}

/**
 * Use DB tone task if present and non-empty, else fallback constant.
 * @param {{ task?: string } | undefined} tone - tone object from getTones()
 * @param {string} fallback - default text when tone is missing or empty
 * @returns {string}
 */
function sectionFromTone(tone, fallback) {
    const t = tone?.task;
    if (t != null && String(t).trim()) return String(t).trim();
    return fallback;
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
    const toolsFromDb = getPromptSection('tools');
    const voiceWeights = cachedVoiceDimensions?.global ? buildWeightsLine(cachedVoiceDimensions.global) : '';
    const toolVoiceWeights = cachedVoiceDimensions?.tools ? buildWeightsLine(cachedVoiceDimensions.tools) : '';
    return {
        role: sectionFromTone(tones.role, ROLE),
        voice: sectionFromTone(tones.voice, VOICE),
        voiceWeights: voiceWeights || undefined,
        voiceChatPersonality: undefined,
        task: text.task,
        constraints: text.constraints,
        tools: toolsFromDb || buildToolsSection(tones),
        toolVoiceWeights: toolVoiceWeights || undefined,
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

const DEFAULT_MAX_COMPLETION_TOKENS = 150;
const DEFAULT_MAX_PROMPT_TOKENS = 1000;

module.exports = {
    get model() {
        const fromDb = cachedRuntimeConfig?.model;
        if (fromDb != null && String(fromDb).trim()) return String(fromDb).trim();
        return DEFAULT_MODEL;
    },
    get max_completion_tokens() {
        const fromDb = cachedRuntimeConfig?.max_completion_tokens;
        if (fromDb != null && Number.isFinite(Number(fromDb)) && Number(fromDb) > 0) return Number(fromDb);
        return DEFAULT_MAX_COMPLETION_TOKENS;
    },
    get max_prompt_tokens() {
        const fromDb = cachedRuntimeConfig?.max_prompt_tokens;
        if (fromDb != null && Number.isFinite(Number(fromDb)) && Number(fromDb) > 0) return Number(fromDb);
        return DEFAULT_MAX_PROMPT_TOKENS;
    },
    /** Current tones (config or Supabase). Use getTones() for runtime. */
    get tones() {
        return getTones();
    },
    defaultTones,
    getTones,
    refreshTonesCache,
    refreshVoiceDimensionsCache,
    refreshPromptConfig,
    getPromptSection,
    getToolDescriptions,
    getSystemPromptSections,
    systemPromptOrder,
    systemPromptOrderWithTools,
    getSystemPrompt,
    getSystemPromptWithTools,
};
