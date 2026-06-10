import { randomUUID } from 'crypto';
import pg from 'pg';
import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL)
    throw new Error('DATABASE_URL is required');
if (!process.env.OPENAI_API_KEY)
    throw new Error('OPENAI_API_KEY is required');
console.log('=== Parrott v2 — Memory Spike ===\n');
// ── 1. Construct stores ──────────────────────────────────────────────────────
const storage = new PostgresStore({ id: 'parrott-storage', connectionString: DATABASE_URL });
console.log('✓ PostgresStore (id=parrott-storage)');
const vector = new PgVector({ id: 'parrott-vector', connectionString: DATABASE_URL });
console.log('✓ PgVector (id=parrott-vector)');
const embedder = new ModelRouterEmbeddingModel('openai/text-embedding-3-small');
console.log('✓ ModelRouterEmbeddingModel (openai/text-embedding-3-small)\n');
// ── 2. Construct Memory ──────────────────────────────────────────────────────
const memory = new Memory({
    storage,
    vector,
    embedder,
    options: {
        lastMessages: 20,
        semanticRecall: {
            topK: 5,
            messageRange: 2,
        },
        workingMemory: {
            enabled: true,
            scope: 'resource',
        },
    },
});
console.log('✓ Memory constructed\n');
// ── 3. Create thread ─────────────────────────────────────────────────────────
const resourceId = 'discord:user-spike-001';
const threadId = 'discord:channel-spike-001';
const now = new Date();
const thread = await memory.saveThread({
    thread: { id: threadId, resourceId, title: 'Spike test thread', createdAt: now, updatedAt: now },
});
console.log('✓ Thread saved:', thread.id);
// ── 4. Save messages (MastraDBMessage format) ────────────────────────────────
const makeMsg = (role, text) => ({
    id: randomUUID(),
    threadId,
    resourceId,
    role,
    createdAt: new Date(),
    content: {
        format: 2,
        parts: [{ type: 'text', text }],
    },
});
await memory.saveMessages({
    messages: [
        makeMsg('user', 'Hey Parrott, my name is Nick and I love playing Elden Ring.'),
        makeMsg('assistant', 'Elden Ring? Nice. You seem like a guy who dies to the tutorial boss.'),
    ],
});
console.log('✓ 2 messages saved\n');
// ── 5. Read messages back ────────────────────────────────────────────────────
const ctx = await memory.getContext({ threadId, resourceId });
console.log(`✓ getContext: ${ctx.messages.length} message(s)`);
for (const m of ctx.messages) {
    const parts = m.content.parts ?? [];
    const text = parts.map((p) => p.text ?? '').join('');
    console.log(`  [${m.role}] ${text.slice(0, 80)}`);
}
// ── 6. Working memory ────────────────────────────────────────────────────────
await memory.updateWorkingMemory({
    threadId,
    resourceId,
    workingMemory: '- Name: Nick\n- Plays: Elden Ring\n- Probably dies to tutorial boss',
});
console.log('\n✓ Working memory written');
const wm = await memory.getWorkingMemory({ threadId, resourceId });
console.log('✓ Working memory read back:');
console.log(wm ?? '(empty)');
// ── 7. Semantic recall ───────────────────────────────────────────────────────
console.log('\nRunning semantic recall...');
const recalled = await memory.recall({
    threadId,
    resourceId,
    vectorSearchString: 'what game does Nick play?',
});
const hits = recalled.messages ?? [];
console.log(`✓ recall returned ${hits.length} hit(s):`);
for (const m of hits) {
    const parts = m.content.parts ?? [];
    const text = parts.map((p) => p.text ?? '').join('');
    console.log(`  [${m.role}] ${text.slice(0, 80)}`);
}
// ── 8. List tables Mastra created ───────────────────────────────────────────
const pool = new Pool({ connectionString: DATABASE_URL });
const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' ORDER BY table_name`);
await pool.end();
console.log('\n=== Tables in public schema ===');
for (const r of rows)
    console.log(' ', r.table_name);
console.log('\n=== Spike complete ===');
console.log('Export: PostgresStore ✓  (not PgStore)');
console.log('Export: PgVector ✓');
console.log('Export: ModelRouterEmbeddingModel from @mastra/core/llm ✓');
