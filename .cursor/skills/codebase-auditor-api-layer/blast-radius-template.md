# Blast radius table template (auditAPILayer — Q2)

Use this structure when answering Question 2. Add or remove rows so every relevant tech stack in the monorepo is covered.

| Area / Tech stack | In scope? | Uses Supabase/API? | Notes / Gaps |
|-------------------|-----------|--------------------|--------------|
| Client (e.g. Next.js, React) | Yes/No | Yes / No / Partial | Brief note |
| Agent (e.g. Node, Discord bot) | Yes/No | Yes / No / Partial | Brief note |
| Jobs / workers / cron | Yes/No | Yes / No / Partial | Brief note |
| Other (name the stack) | Yes/No | Yes / No / Partial | Brief note |

**Guidance**

- **In scope?**: Whether this area was included in the audit (sending or receiving data).
- **Uses Supabase/API?**: Whether it uses the shared backend (Supabase or other API) for persistence/read-write. Use "Partial" if some flows use it and others do not.
- **Notes / Gaps**: Missing usage, direct DB access, env-only config, or consistency gaps.
