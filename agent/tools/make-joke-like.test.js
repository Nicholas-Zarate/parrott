/**
 * make_joke_like tool and getJokeForSubject helper.
 * Run from agent/: node tools/make-joke-like.test.js
 */
const assert = require('assert');
const { buildTools } = require('../../ai-sdk/with-tools');
const { getJokeForSubject, JOKE_MAX_CHARS } = require('../../abilities/make-joke-like/get-joke');

async function run() {
    const tools = buildTools({});
    const hasMakeJokeLike = Boolean(tools.make_joke_like);

    if (hasMakeJokeLike) {
        // buildTools includes make_joke_like — run full tool assertions
        const makeJokeLike = tools.make_joke_like;
        assert(typeof makeJokeLike.execute === 'function', 'make_joke_like has execute');
        const noContext = await makeJokeLike.execute({ subject: 'dad jokes' });
        assert(noContext && noContext.success === false, 'execute with no context returns success: false');
        assert(typeof noContext.error === 'string' && noContext.error.length > 0, 'error message present');
        assert(
            noContext.error.includes('Discord context') || noContext.error.includes('Voice'),
            'error mentions context or voice'
        );
    }

    // getJokeForSubject with empty subject returns speakable fallback and isFallback flag
    const emptySubject = await getJokeForSubject('');
    assert(emptySubject.success === true && typeof emptySubject.joke === 'string', 'empty subject returns success with fallback joke');
    assert(emptySubject.joke.length > 0, 'fallback joke is non-empty');
    assert(emptySubject.isFallback === true, 'empty subject returns isFallback: true');

    // getJokeForSubject with no TAVILY_API_KEY returns speakable fallback and isFallback flag
    const savedKey = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;
    const noKey = await getJokeForSubject('Dave Chappelle');
    if (savedKey !== undefined) process.env.TAVILY_API_KEY = savedKey;
    else delete process.env.TAVILY_API_KEY;
    assert(noKey.success === true && typeof noKey.joke === 'string', 'no API key returns success with fallback joke');
    assert(noKey.joke.toLowerCase().includes('search') || noKey.joke.toLowerCase().includes('admin'), 'fallback mentions search or admin');
    assert(noKey.isFallback === true, 'no API key returns isFallback: true');

    // JOKE_MAX_CHARS is a safe cap for TTS
    assert(Number.isFinite(JOKE_MAX_CHARS) && JOKE_MAX_CHARS <= 1000, 'JOKE_MAX_CHARS is reasonable');

    console.log('make-joke-like.test.js: OK');
    if (hasMakeJokeLike) {
        console.log('  buildTools includes make_joke_like');
        console.log('  make_joke_like.execute with no context returns error');
    } else {
        console.log('  make_joke_like disabled (commented out); skipping tool assertions');
    }
    console.log('  getJokeForSubject empty subject and no API key return fallbacks');
}

run().catch((err) => {
    console.error('make-joke-like test failed:', err);
    process.exit(1);
});
