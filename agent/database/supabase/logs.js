/**
 * Supabase-backed logger: writes logs to the `logs` table (level, message, created_at, meta).
 * Use explicitly via log.info/warn/error/debug, or call patchConsole() once at startup to
 * send all console.log/warn/error (and info/debug) to Supabase as well as the terminal.
 *
 * - Logs are written fire-and-forget (non-blocking).
 * - If Supabase is not configured or insert fails, we only log to console (no throw).
 * - patchConsole() uses stored original console so logger internals never recurse.
 */

const util = require('util');
const { getClient } = require('./client');

const TABLE = 'logs';

/** @type {{ log: Function, warn: Function, error: Function, info?: Function, debug?: Function } | null} */
let originalConsole = null;

/**
 * Format console.* arguments into a single string (like Node's console).
 * @param {unknown[]} args
 * @returns {string}
 */
function formatArgs(args) {
    if (!args || args.length === 0) return '';
    return args.map((a) => (typeof a === 'string' ? a : util.inspect(a))).join(' ');
}

/**
 * Insert a log row into Supabase. Non-blocking; never throws.
 * On failure, writes to originalConsole.error if available.
 * @param {string} level - 'error' | 'warn' | 'info' | 'debug'
 * @param {string} message
 * @param {Record<string, unknown> | null} [meta]
 */
async function insertLog(level, message, meta = null) {
    const supabase = getClient();
    if (!supabase) return;

    const record = {
        level: String(level),
        message: String(message),
        meta: meta && typeof meta === 'object' ? meta : null,
    };

    try {
        const { error } = await supabase.from(TABLE).insert(record);
        if (error && originalConsole && originalConsole.error) {
            originalConsole.error('[Logs] Supabase insert failed:', error.message);
        }
    } catch (err) {
        if (originalConsole && originalConsole.error) {
            originalConsole.error('[Logs] Supabase write error:', err?.message || err);
        }
    }
}

/**
 * Fire-and-forget send to Supabase (does not await). Used by console wrappers.
 * @param {string} level
 * @param {string} message
 * @param {Record<string, unknown> | null} [meta]
 */
function sendToSupabase(level, message, meta = null) {
    insertLog(level, message, meta).catch(() => {
        // Already logged in insertLog; avoid unhandled rejection
    });
}

/**
 * Patch global console so that log/warn/error/info/debug also write to Supabase.
 * Call once at app startup (e.g. in discord-voting-bot.js after dotenv).
 * Original methods are preserved and used for terminal output and for logger error reporting.
 */
function patchConsole() {
    if (originalConsole) return; // already patched
    originalConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        info: console.info ? console.info.bind(console) : console.log.bind(console),
        debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
    };

    console.log = function (...args) {
        originalConsole.log.apply(console, args);
        sendToSupabase('info', formatArgs(args));
    };
    console.warn = function (...args) {
        originalConsole.warn.apply(console, args);
        sendToSupabase('warn', formatArgs(args));
    };
    console.error = function (...args) {
        originalConsole.error.apply(console, args);
        sendToSupabase('error', formatArgs(args));
    };
    console.info = function (...args) {
        originalConsole.info.apply(console, args);
        sendToSupabase('info', formatArgs(args));
    };
    console.debug = function (...args) {
        originalConsole.debug.apply(console, args);
        sendToSupabase('debug', formatArgs(args));
    };
}

/**
 * Explicit logger for code that wants to log with level and optional meta.
 * Still uses real console for output; also sends to Supabase.
 */
const log = {
    info(message, meta = null) {
        const msg = typeof message === 'string' ? message : util.inspect(message);
        if (originalConsole) originalConsole.log(msg); else console.log(msg);
        sendToSupabase('info', msg, meta);
    },
    warn(message, meta = null) {
        const msg = typeof message === 'string' ? message : util.inspect(message);
        if (originalConsole) originalConsole.warn(msg); else console.warn(msg);
        sendToSupabase('warn', msg, meta);
    },
    error(message, meta = null) {
        const msg = typeof message === 'string' ? message : util.inspect(message);
        if (originalConsole) originalConsole.error(msg); else console.error(msg);
        sendToSupabase('error', msg, meta);
    },
    debug(message, meta = null) {
        const msg = typeof message === 'string' ? message : util.inspect(message);
        if (originalConsole) originalConsole.debug(msg); else console.debug(msg);
        sendToSupabase('debug', msg, meta);
    },
};

/** @type {Map<string, { info: Function, warn: Function, error: Function, debug: Function }>} */
const loggerCache = new Map();

/**
 * Create a logger bound to a module name. Messages are prefixed with [moduleName] and meta includes module.
 * Uses same fire-and-forget Supabase and originalConsole as the global log; never throws.
 * @param {string} moduleName - e.g. 'mention', 'activity-deliver', 'audit'
 * @returns {{ info: Function, warn: Function, error: Function, debug: Function }}
 */
function createLogger(moduleName) {
    const prefix = typeof moduleName === 'string' && moduleName ? `[${moduleName}] ` : '';
    const out = {
        info(message, meta = null) {
            const msg = typeof message === 'string' ? message : util.inspect(message);
            const line = prefix + msg;
            if (originalConsole) originalConsole.log(line); else console.log(line);
            const merged = meta && typeof meta === 'object' ? { module: moduleName, ...meta } : { module: moduleName };
            sendToSupabase('info', line, merged);
        },
        warn(message, meta = null) {
            const msg = typeof message === 'string' ? message : util.inspect(message);
            const line = prefix + msg;
            if (originalConsole) originalConsole.warn(line); else console.warn(line);
            const merged = meta && typeof meta === 'object' ? { module: moduleName, ...meta } : { module: moduleName };
            sendToSupabase('warn', line, merged);
        },
        error(message, meta = null) {
            const msg = typeof message === 'string' ? message : util.inspect(message);
            const line = prefix + msg;
            if (originalConsole) originalConsole.error(line); else console.error(line);
            const merged = meta && typeof meta === 'object' ? { module: moduleName, ...meta } : { module: moduleName };
            sendToSupabase('error', line, merged);
        },
        debug(message, meta = null) {
            const msg = typeof message === 'string' ? message : util.inspect(message);
            const line = prefix + msg;
            if (originalConsole) originalConsole.debug(line); else console.debug(line);
            const merged = meta && typeof meta === 'object' ? { module: moduleName, ...meta } : { module: moduleName };
            sendToSupabase('debug', line, merged);
        },
    };
    return out;
}

/**
 * Return a cached logger for the given module name. Same API as createLogger.
 * @param {string} moduleName
 * @returns {{ info: Function, warn: Function, error: Function, debug: Function }}
 */
function getLogger(moduleName) {
    const key = typeof moduleName === 'string' ? moduleName : 'app';
    if (!loggerCache.has(key)) loggerCache.set(key, createLogger(key));
    return loggerCache.get(key);
}

module.exports = {
    insertLog,
    patchConsole,
    log,
    formatArgs,
    createLogger,
    getLogger,
};
