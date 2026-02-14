// Poll types
const POLL_TYPES = {
    SINGLE: 'single',
    MULTIPLE: 'multiple',
    RANKED: 'ranked',
    YES_NO: 'yes_no'
};

// Hearing poll: any user can add options via modal
const HEARING = {
    MAX_OPTIONS: 20,
    OPTION_LABEL_MAX: 80,
    MODAL_CUSTOM_ID_PREFIX: 'hearing_modal_'
};

// Minimal / ASCII theme - dark brown palette
const THEME = {
    color: {
        primary: 0x362925,
        ended: 0x2c2019
    },
    chars: {
        barFull: '#',
        barEmpty: '-',
        optionPrefix: (n) => `(${n})`
    },
    labels: {
        poll: '[POLL]',
        ended: '[ENDED]',
        votes: 'votes',
        winner: '[winner]',
        lock: '[role]',
        duration: '[time]',
        by: 'by',
        anonymous: 'anonymous',
        public: 'public'
    }
};

// Analysis defaults
const ANALYSIS = {
    DEFAULT_DAYS: 7,
    MAX_DAYS: 90,
    MIN_DAYS: 1,
    DEFAULT_MAX_MESSAGES_PER_CHANNEL: 500,
    TOP_N_MINIMAL: 5
};

module.exports = { POLL_TYPES, HEARING, THEME, ANALYSIS };
