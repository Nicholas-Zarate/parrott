/**
 * mention/format: resolveUserMentionsInContent, formatMessageForParrot (user mention resolution).
 * Run from agent/: node test/mention-format.test.js
 */
const assert = require('assert');

const {
    resolveUserMentionsInContent,
    formatMessageForParrot,
    getMentionedUsersLineForParrot,
    buildUserContentForParrot,
} = require('../abilities/mention/format');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  PASS: ${name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL: ${name}`);
        console.error(`    ${err.message}`);
        process.exitCode = 1;
    }
}

console.log('mention/format tests:');

test('resolveUserMentionsInContent: single mention becomes @username', () => {
    const content = ' what do you think of <@111222333> ?';
    const users = new Map([['111222333', { username: 'HOgs_tooth', tag: 'HOgs_tooth#1234' }]]);
    const message = { mentions: { users }, guild: null };
    const out = resolveUserMentionsInContent(content, message, null);
    assert(out.includes('@HOgs_tooth'), `expected @HOgs_tooth in: ${out}`);
    assert(!out.includes('<@111222333>'), `expected no raw id in: ${out}`);
});

test('resolveUserMentionsInContent: order of appearance preserved (first in text = first resolved)', () => {
    const content = ' a <@222> b <@111> ';
    const users = new Map([
        ['111', { username: 'UserOne', tag: 'UserOne#1' }],
        ['222', { username: 'UserTwo', tag: 'UserTwo#2' }],
    ]);
    const message = { mentions: { users }, guild: null };
    const out = resolveUserMentionsInContent(content, message, null);
    assert.strictEqual(out, ' a @UserTwo b @UserOne ', `content order must be preserved: ${out}`);
});

test('resolveUserMentionsInContent: unknown user id becomes @unknown_user', () => {
    const content = ' hi <@999999999> ';
    const message = { mentions: { users: new Map() }, guild: null };
    const out = resolveUserMentionsInContent(content, message, null);
    assert(out.includes('@unknown_user'), `expected @unknown_user in: ${out}`);
});

test('resolveUserMentionsInContent: bot id replaced with empty string when botUser provided', () => {
    const content = ' <@999> and <@456> ';
    const users = new Map([
        ['999', { username: 'Bot', tag: 'Bot#0' }],
        ['456', { username: 'HOgs_tooth', tag: 'HOgs_tooth#1' }],
    ]);
    const message = { mentions: { users }, guild: null };
    const botUser = { id: '999' };
    const out = resolveUserMentionsInContent(content, message, botUser);
    assert(!out.includes('<@999>') && !out.includes('@Bot'), `bot mention should be gone: ${out}`);
    assert(out.includes('@HOgs_tooth'), `other user should be resolved: ${out}`);
});

test('resolveUserMentionsInContent: guild member displayName used when available', () => {
    const content = ' <@111> ';
    const users = new Map([['111', { username: 'plainName', tag: 'plainName#1' }]]);
    const member = { displayName: 'HOgs_tooth' };
    const guild = { members: { cache: new Map([['111', member]]) } };
    const message = { mentions: { users }, guild };
    const out = resolveUserMentionsInContent(content, message, null);
    assert(out.includes('@HOgs_tooth'), `expected displayName @HOgs_tooth in: ${out}`);
});

test('resolveUserMentionsInContent: role mention <@&id> left unchanged', () => {
    const content = ' role <@&999888> and user <@777> ';
    const users = new Map([['777', { username: 'User', tag: 'User#1' }]]);
    const message = { mentions: { users }, guild: null };
    const out = resolveUserMentionsInContent(content, message, null);
    assert(out.includes('<@&999888>'), `role mention should be left as-is: ${out}`);
    assert(out.includes('@User'), `user mention should be resolved: ${out}`);
});

test('resolveUserMentionsInContent: empty or null content returned as-is', () => {
    const message = { mentions: { users: new Map() }, guild: null };
    assert.strictEqual(resolveUserMentionsInContent('', message, null), '');
    assert.strictEqual(resolveUserMentionsInContent(null, message, null), '');
});

test('formatMessageForParrot: user mention in content is resolved to @name', () => {
    const content = ' what do you think of <@111> ?';
    const users = new Map([['111', { username: 'HOgs_tooth', tag: 'HOgs_tooth#1' }]]);
    const message = {
        content,
        author: { displayName: 'swim', username: 'swim', tag: 'swim#0' },
        channel: { name: 'general', parent: null },
        mentions: { users },
        guild: null,
    };
    const out = formatMessageForParrot(message, null);
    assert(out.includes('@HOgs_tooth'), `formatted message should contain @HOgs_tooth: ${out}`);
    assert(!out.includes('<@111>'), `formatted message should not contain raw id: ${out}`);
});

test('formatMessageForParrot: bot mention stripped then other mentions resolved', () => {
    const content = '<@bot99> what do you think of <@111> ?';
    const users = new Map([['111', { username: 'HOgs_tooth', tag: 'HOgs_tooth#1' }]]);
    const message = {
        content,
        author: { displayName: 'swim', username: 'swim', tag: 'swim#0' },
        channel: { name: 'general', parent: null },
        mentions: { users },
        guild: null,
    };
    const botUser = { id: 'bot99' };
    const out = formatMessageForParrot(message, botUser);
    assert(out.includes('@HOgs_tooth'), `should resolve user: ${out}`);
    assert(!out.includes('<@bot99>') && !out.includes('<@111>'), `no raw ids: ${out}`);
});

test('USER_MENTION_REGEX: <@id> and <@!id> resolved; <@&id> left unchanged', () => {
    const content = ' <@123> and <@!456> and role <@&789> ';
    const users = new Map([
        ['123', { username: 'A', tag: 'A#1' }],
        ['456', { username: 'B', tag: 'B#2' }],
    ]);
    const message = { mentions: { users }, guild: null };
    const out = resolveUserMentionsInContent(content, message, null);
    assert(out.includes('@A') && out.includes('@B'), `user mentions resolved: ${out}`);
    assert(out.includes('<@&789>'), `role mention unchanged: ${out}`);
});

test('getMentionedUsersLineForParrot: no non-bot mentions returns empty', () => {
    const message = { content: ' hello ', mentions: { users: new Map() }, guild: null };
    assert.strictEqual(getMentionedUsersLineForParrot(message, null), '');
});

test('getMentionedUsersLineForParrot: one mention returns line with @Name (id ID)', () => {
    const message = {
        content: ' what do you think of <@111> ?',
        mentions: { users: new Map([['111', { username: 'HOgs_tooth', tag: 'HOgs_tooth#1' }]]) },
        guild: null,
    };
    const out = getMentionedUsersLineForParrot(message, null);
    assert(out.startsWith('Mentioned users in this message:'), out);
    assert(out.includes('@HOgs_tooth') && out.includes('id 111'), out);
});

test('getMentionedUsersLineForParrot: order of first appearance, bot excluded', () => {
    const message = {
        content: ' <@999> and <@222> and <@111> ',
        mentions: {
            users: new Map([
                ['999', { username: 'Bot', tag: 'Bot#0' }],
                ['222', { username: 'Second', tag: 'Second#2' }],
                ['111', { username: 'First', tag: 'First#1' }],
            ]),
        },
        guild: null,
    };
    const out = getMentionedUsersLineForParrot(message, { id: '999' });
    assert(out.includes('@Second') && out.includes('@First'), out);
    assert(!out.includes('Bot') && !out.includes('999'), `bot should be excluded: ${out}`);
    const idxSecond = out.indexOf('Second');
    const idxFirst = out.indexOf('First');
    assert(idxSecond < idxFirst, `order of appearance: Second before First in ${out}`);
});

test('getMentionedUsersLineForParrot: duplicate mention listed once', () => {
    const message = {
        content: ' <@111> and again <@111> ',
        mentions: { users: new Map([['111', { username: 'Once', tag: 'Once#1' }]]) },
        guild: null,
    };
    const out = getMentionedUsersLineForParrot(message, null);
    const count = (out.match(/@Once/g) || []).length;
    assert.strictEqual(count, 1, `@Once should appear once: ${out}`);
});

test('buildUserContentForParrot: includes mentioned-users line when message has mentions', async () => {
    const message = {
        content: ' roast <@111> ',
        author: { displayName: 'swim', username: 'swim', tag: 'swim#0' },
        channel: { name: 'general', parent: null },
        mentions: { users: new Map([['111', { username: 'HOgs_tooth', tag: 'HOgs_tooth#1' }]]) },
        guild: null,
    };
    const out = await buildUserContentForParrot(message, null);
    assert(out.includes('Mentioned users in this message:'), out);
    assert(out.includes('@HOgs_tooth') && out.includes('id 111'), out);
});

console.log(`\nTotal: ${passed} passed, ${failed} failed`);
