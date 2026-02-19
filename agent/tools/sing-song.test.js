/**
 * sing_song tool and getLyricsForSong helper.
 * Run from agent/: node tools/sing-song.test.js
 */
const assert = require('assert');
const { buildTools } = require('../../ai-sdk/with-tools');
const { getLyricsForSong, LYRIC_MAX_CHARS } = require('../../abilities/sing-song/get-lyrics');

async function run() {
    // buildTools includes sing_song
    const tools = buildTools({});
    assert(tools.sing_song, 'buildTools() includes sing_song');
    const singSong = tools.sing_song;
    assert(typeof singSong.execute === 'function', 'sing_song has execute');

    // execute with no Discord context returns error
    const noContext = await singSong.execute({ songQuery: 'Never Gonna Give You Up' });
    assert(noContext && noContext.success === false, 'execute with no context returns success: false');
    assert(typeof noContext.error === 'string' && noContext.error.length > 0, 'error message present');
    assert(
        noContext.error.includes('Discord context') || noContext.error.includes('Voice'),
        'error mentions context or voice'
    );

    // getLyricsForSong with empty query
    const emptyQuery = await getLyricsForSong('');
    assert(emptyQuery.success === false && emptyQuery.error, 'empty query returns error');

    // getLyricsForSong with no TAVILY_API_KEY (save/restore so we don't break other tests)
    const savedKey = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;
    const noKey = await getLyricsForSong('Some Song');
    if (savedKey !== undefined) process.env.TAVILY_API_KEY = savedKey;
    else delete process.env.TAVILY_API_KEY;
    assert(noKey.success === false, 'no API key returns success: false');
    assert(noKey.error && noKey.error.toLowerCase().includes('search'), 'error mentions search/config');

    // LYRIC_MAX_CHARS is a safe cap for TTS
    assert(Number.isFinite(LYRIC_MAX_CHARS) && LYRIC_MAX_CHARS <= 1000, 'LYRIC_MAX_CHARS is reasonable');

    console.log('sing-song.test.js: OK');
    console.log('  buildTools includes sing_song');
    console.log('  sing_song.execute with no context returns error');
    console.log('  getLyricsForSong empty query and no API key return errors');
}

run().catch((err) => {
    console.error('sing-song test failed:', err);
    process.exit(1);
});
