/**
 * make_joke_like tool and getJokeForSubject helper.
 * Run from agent/: node test/tools/make-joke-like.test.js
 */
const assert = require('assert');
const { buildTools } = require('../../ai-sdk/with-tools');
const { getJokeForSubject, JOKE_MAX_CHARS } = require('../../abilities/make-joke-like/get-joke');

async function run() {
    // buildTools includes make_joke_like
    const tools = buildTools({});
    assert(tools.make_joke_like, 'buildTools() includes make_joke_like');
    const makeJokeLike = tools.make_joke_like;
    assert(typeof makeJokeLike.execute === 'function', 'make_joke_like has execute');

    // execute with no Discord context returns error
    const noContext = await makeJokeLike.execute({ subject: 'dad jokes' });
    assert(noContext && noContext.success === false, 'execute with no context returns success: false');
    assert(typeof noContext.error === 'string' && noContext.error.length > 0, 'error message present');
    assert(
        noContext.error.includes('Discord context') || noContext.error.includes('Voice'),
        'error mentions context or voice'
    );

    // getJokeForSubject with empty subject
    const emptySubject = await getJokeForSubject('');
    assert(emptySubject.success === false && emptySubject.error, 'empty subject returns error');

    // getJokeForSubject with no TAVILY_API_KEY (save/restore so we don't break other tests)
    const savedKey = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;
    const noKey = await getJokeForSubject('Dave Chappelle');
    if (savedKey !== undefined) process.env.TAVILY_API_KEY = savedKey;
    else delete process.env.TAVILY_API_KEY;
    assert(noKey.success === false, 'no API key returns success: false');
    assert(noKey.error && noKey.error.toLowerCase().includes('search'), 'error mentions search/config');

    // JOKE_MAX_CHARS is a safe cap for TTS
    assert(Number.isFinite(JOKE_MAX_CHARS) && JOKE_MAX_CHARS <= 1000, 'JOKE_MAX_CHARS is reasonable');

    console.log('make-joke-like.test.js: OK');
    console.log('  buildTools includes make_joke_like');
    console.log('  make_joke_like.execute with no context returns error');
    console.log('  getJokeForSubject empty subject and no API key return errors');
}

run().catch((err) => {
    console.error('make-joke-like test failed:', err);
    process.exit(1);
});
