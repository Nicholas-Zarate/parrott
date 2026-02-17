/**
 * Parrot personality for @mention replies (and any future parrot-style features).
 * All personality data comes from Supabase only (parrot_tones, parrot_prompt_sections,
 * parrot_tool_descriptions, parrot_runtime_config, parrot_voice_dimensions). No in-code defaults.
 * When Supabase URL and key are set, refreshPromptConfig() at startup loads all caches from DB.
 */

const { getParrotTonesFromSupabase } = require('../supabase/parrot-tones');
const { getPromptSectionsFromSupabase } = require('../supabase/prompt-sections');
const { getToolDescriptionsFromSupabase } = require('../supabase/tool-descriptions');
const { getRuntimeConfigFromSupabase } = require('../supabase/runtime-config');
const { getVoiceDimensionsFromSupabase, buildWeightsLine } = require('../supabase/voice-dimensions');
const { getRoastConfigFromSupabase, DEFAULT_WEIGHTS: ROAST_DEFAULT_WEIGHTS } = require('../supabase/roast-config');

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

/** Cached roast config (type weights + game_streak_min_activities). Set by refreshPromptConfig(). */
let cachedRoastConfig = null;

/**
 * Return current tones from Supabase cache only. Populated at startup when Supabase is configured; otherwise null.
 * Sync; safe to call anytime.
 * @returns {{ text: { task, constraints, maxWords }, vc?: {...}, role?: {...}, voice?: {...}, [slug]: {...} } | null}
 */
function getTones() {
    if (cachedTones && typeof cachedTones === 'object' && Object.keys(cachedTones).length > 0) {
        return cachedTones;
    }
    return null;
}

/**
 * Fetch tones from Supabase and set cache. Call at startup when Supabase is configured.
 * On failure or empty, cache is cleared; getTones() then returns null.
 * @returns {Promise<void>}
 */
async function refreshTonesCache() {
    const tones = await getParrotTonesFromSupabase();
    if (tones && typeof tones === 'object' && Object.keys(tones).length > 0) {
        cachedTones = tones;
        console.log('[Parrot tones] Loaded from Supabase:', Object.keys(tones).join(', '));
    } else {
        cachedTones = null;
        if (!tones) {
            console.warn('[Parrot tones] No data from Supabase (client missing or query failed). Check SUPABASE_URL, keys, and parrot_tones table.');
        } else {
            console.warn('[Parrot tones] parrot_tones returned no rows or empty. Run migrations 001 and 016 so role, voice, text, vc exist.');
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
 * Refresh all prompt config from Supabase: dimensions, tones, prompt sections, tool descriptions, runtime config.
 * Call at startup when Supabase URL and key are set. All personality data is loaded from DB.
 * @returns {Promise<void>}
 */
async function refreshPromptConfig() {
    await refreshVoiceDimensionsCache();
    await refreshTonesCache();
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
        console.log('[Parrot prompt] Loaded runtime config from Supabase; model=', modelVal ?? '(none; model-provider default when model not set)');
    } else {
        cachedRuntimeConfig = null;
        console.log('[Parrot prompt] No runtime config from Supabase.');
    }

    const roastConfig = await getRoastConfigFromSupabase();
    if (roastConfig && typeof roastConfig === 'object') {
        cachedRoastConfig = roastConfig;
        console.log('[Parrot prompt] Loaded roast config from Supabase; weights messages=%s game_streak=%s custom=%s min_activities=%s', roastConfig.weight_messages, roastConfig.weight_game_streak, roastConfig.weight_custom, roastConfig.game_streak_min_activities);
    } else {
        cachedRoastConfig = null;
        console.log('[Parrot prompt] No roast config from Supabase; using in-code defaults.');
    }
}

/**
 * Return roast type weights and game_streak_min_activities. Uses Supabase cache when set; otherwise in-code defaults.
 * @returns {{ weight_messages: number, weight_game_streak: number, weight_custom: number, game_streak_min_activities: number }}
 */
function getRoastWeights() {
    if (cachedRoastConfig && typeof cachedRoastConfig === 'object') {
        return { ...cachedRoastConfig };
    }
    return { ...ROAST_DEFAULT_WEIGHTS };
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

/**
 * Get section text from a tone (DB only; no fallback).
 * @param {{ task?: string } | undefined} tone
 * @returns {string}
 */
function sectionFromTone(tone) {
    const t = tone?.task;
    return (t != null && String(t).trim()) ? String(t).trim() : '';
}

/**
 * Build system prompt sections from Supabase cache only (tones, prompt sections, voice dimensions).
 * When tones or sections are missing, returns empty strings so callers can still build a prompt or detect "not configured."
 * @param {{ inVoiceContext?: boolean }} [options] - inVoiceContext is currently ignored; text tone always used.
 * @returns {{ role: string, voice: string, voiceChatPersonality?: string, task: string, constraints: string, tools?: string }}
 */
function getSystemPromptSections(options = {}) {
    const tones = getTones();
    const text = tones?.text;
    const toolsFromDb = getPromptSection('tools');
    const voiceWeights = cachedVoiceDimensions?.global ? buildWeightsLine(cachedVoiceDimensions.global) : '';
    const toolVoiceWeights = cachedVoiceDimensions?.tools ? buildWeightsLine(cachedVoiceDimensions.tools) : '';
    return {
        role: sectionFromTone(tones?.role),
        voice: sectionFromTone(tones?.voice),
        voiceWeights: voiceWeights || undefined,
        voiceChatPersonality: undefined,
        task: (text?.task != null && String(text.task).trim()) ? String(text.task).trim() : '',
        constraints: (text?.constraints != null && String(text.constraints).trim()) ? String(text.constraints).trim() : '',
        tools: (toolsFromDb && toolsFromDb.trim()) ? toolsFromDb.trim() : '',
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

module.exports = {
    getRoastWeights,
    /** Model from Supabase only; null when not set (model-provider uses its default when passed null). */
    get model() {
        const fromDb = cachedRuntimeConfig?.model;
        if (fromDb != null && String(fromDb).trim()) return String(fromDb).trim();
        return null;
    },
    /** Max completion tokens from Supabase only; null when not set. */
    get max_completion_tokens() {
        const fromDb = cachedRuntimeConfig?.max_completion_tokens;
        if (fromDb != null && Number.isFinite(Number(fromDb)) && Number(fromDb) > 0) return Number(fromDb);
        return null;
    },
    /** Max prompt tokens from Supabase only; null when not set. */
    get max_prompt_tokens() {
        const fromDb = cachedRuntimeConfig?.max_prompt_tokens;
        if (fromDb != null && Number.isFinite(Number(fromDb)) && Number(fromDb) > 0) return Number(fromDb);
        return null;
    },
    /** Current tones from Supabase only; null when not configured. */
    get tones() {
        return getTones();
    },
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
