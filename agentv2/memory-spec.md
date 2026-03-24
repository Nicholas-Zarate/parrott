# Memory spec: structured + vector, combined retrieval

## Spec (what we build)

- **Two stores:** (1) Structured table: key-value by scope (channel_id, guild_id, user_id). (2) Vector table: content + embedding, same scope columns. Both writable only via the **remember** tool; readable only by the **agent runner** (programmatic).
- **Save:** Model calls the **remember** tool with a key and/or a freeform “memory” string. Tool writes structured facts to the structured table; optional semantic snippet to the vector table (after vectorization). One tool, one or both stores per call.
- **Retrieve:** Runner, before each turn, (1) loads **structured** rows for the current scope (channel/user). (2) Builds a **query** (e.g. last user message or “channel context”). (3) Calls **vector search** with that query (vectorized) and same scope. (4) **Combines** both into a single “Memory” block and injects it into the system prompt. No tool is used for read.
- **Scope:** All reads and writes are scoped (channel_id, guild_id, user_id). Use empty string for “global” when not scoped. Same scope used for both stores so combined context is coherent.

---

## How and when they are combined on retrieval

- **When:** Every turn, before the runner builds the prompt and calls the LLM.
- **Steps:**
  1. **Structured fetch:** Query structured table for current scope (and optionally key prefix). Return a list of `key: value` (or short facts).
  2. **Vector fetch:** Embed the retrieval query (e.g. last user message + optional “recent context”). Call similarity-search RPC with that vector and scope filter. Return top-k rows (e.g. content + metadata).
  3. **Combine:** Format into one block, e.g.  
     `## Memory\n\n**Facts:**\n- key1: value1\n- key2: value2\n\n**Relevant context:**\n- [semantic result 1]\n- [semantic result 2]`  
     Order can be: structured first (stable facts), then semantic (conversation-relevant). Cap total size (e.g. top N structured, top K vector results).
  4. **Inject:** Prepend or insert this block into the system prompt (or a dedicated “Memory” section) so the model sees a single combined memory view.

- **When to use which in retrieval:** Always run both for the current scope. Structured gives precise, updatable facts; vector gives “what’s relevant to what was just said.” The model doesn’t choose—the runner always merges both and injects once per turn.

---

## Example workflows

### Workflow 1: Single turn (retrieve → respond → maybe save)

1. **User sends a message** in a channel.
2. **Runner (retrieve):**
   - Scope = (channel_id, guild_id, user_id or "").
   - Structured: `SELECT key, value FROM memory WHERE channel_id = $1 AND guild_id = $2 AND user_id = $3`.
   - Query = last user message (or truncated).
   - Vector: `embed(query)` → `search_memory_embeddings(query_embedding, scope, limit)`.
   - Combine structured list + vector results into one Memory block.
3. **Runner (prompt):** Build system prompt = [Soul, Personality, **Memory block**, tools]. Append conversation (user message).
4. **Runner (generate):** Call LLM with tools (including **remember**).
5. **If model calls remember:** Tool writes to structured table (key/value) and/or vector table (content → embed → insert). Then continue/reply.
6. **Runner:** Return reply to user (and optionally persist conversation elsewhere).

### Workflow 2: Remember tool implementation (save path)

1. **Input:** Tool args, e.g. `key`, `value` (optional), `semantic_content` (optional), plus scope from context (channel_id, guild_id, user_id).
2. **Structured write:** If `key` (and optionally `value`) provided: upsert into structured table for scope + key.
3. **Vector write:** If `semantic_content` provided: call `embed(semantic_content)`, then insert row into vector table (scope, content, embedding, metadata).
4. **Return:** Tool returns a short confirmation to the model (e.g. “Remembered.”).

### Workflow 3: First message in a new channel (no memory yet)

1. **Retrieve:** Same as Workflow 1; structured query returns empty; vector search returns empty (or global scope only).
2. **Combine:** Memory block = “No stored memory for this context.” or omit the block.
3. **Prompt / generate:** Proceed as usual. Model can call **remember** to create first memories for this scope.

---

## Out of scope for this spec

- Exact schema (see `db/memory/*.sql`).
- Embedding model/config (see plan; e.g. OpenAI text-embedding-3-small).
- RLS and auth (runner uses service role; no direct client access to memory tables).
- Optional: recall_semantic as an on-demand tool (model asks for more semantic search). This spec assumes programmatic retrieval only.
