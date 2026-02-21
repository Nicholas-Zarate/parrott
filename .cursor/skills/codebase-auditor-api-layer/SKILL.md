---
name: codebase-auditor-api-layer
description: Designs prompts that replace auditor-style prompts and runs the auditAPILayer subskill. Audits incoming/outgoing API and data flow across all tech stacks in the monorepo (FE and Agent). Use when the user asks for an API/data-layer audit, Supabase or backend data-flow review, or to design or replace prompts that ask about backend security and data flow consistency.
---

# Codebase Auditor — API Layer

Think like a **codebase auditor**. This skill has two modes:

1. **Prompt design**: Design prompts that replace a given (auditor-style) prompt.
2. **Subskill auditAPILayer**: Run the standardized API/data-layer audit (incoming and outgoing) across the whole monorepo and produce structured answers plus a plan.

---

## When to Use

- User asks to audit API layer, Supabase usage, or data flow.
- User asks to design or replace prompts that ask about backend/API security and data flow.
- User invokes the "auditAPILayer" subskill or the series of questions below.

---

## Subskill: auditAPILayer

Run this workflow when auditing **incoming and outgoing** data flow across all available tech stacks (FE, Agent, any other apps in the monorepo). Search the codebase for send/receive patterns; do not assume.

### Question 1 — Backend/API and security (answer in 3–4 lines max)

- Are we using a Supabase backend or another API to pass data to/from tables?
- If yes: how secure is that process (auth, keys, RLS, transport)?

**Output**: Concise 3–4 line answer. No tables or long prose.

---

### Question 2 — Consistency of usage and blast radius

- If we have Supabase/API: is it used **everywhere** we send or receive data?
- Search the codebase for: sending data, receiving data, persistence, external APIs, env-based URLs/keys.
- Scope: FE and Agent (and any other stacks in the repo).

**Output**: Answer in prose, then attach a **blast radius table** by tech stack.

Use this structure (see [blast-radius-template.md](blast-radius-template.md) for the exact table format):

| Area / Tech stack | In scope? | Uses Supabase/API? | Notes / Gaps |
|-------------------|-----------|--------------------|--------------|
| Client (Next.js / React) | Yes/No | Yes/No/Partial | … |
| Agent (Node) | Yes/No | Yes/No/Partial | … |
| Other (e.g. jobs, workers) | Yes/No | Yes/No/Partial | … |

Add or remove rows so every relevant tech stack in the monorepo is represented. "Blast radius" = which areas are affected by current data-flow choices or by future changes.

---

### Question 3 — Improvements and plan

- After thinking through the codebase and research: what improvements would you recommend?
- Consider: what’s documented online, what’s researched, and what’s industry standard or proven.

**Output**: Write a **plan.md** file. Do not only respond in chat.

- **Location**: `instructions/plan.md` (or `instructions/audit-api-layer-plan.md` if you want a dedicated name).
- **Content**: Short context, list of findings, prioritized recommendations, and optional next steps. Keep it actionable.

The project keeps instruction sets and plan docs in `/instructions`; ensure that folder exists and that plan files are written there.

---

## Prompt design mode

When the user wants to **design prompts that replace** an existing auditor-style prompt:

1. Treat the existing prompt as the “source” (e.g. the series of questions above).
2. Propose one or more replacement prompts that preserve intent but improve clarity, scope, or structure.
3. If the replacement includes an API/data-layer audit, align it with the **auditAPILayer** workflow and output formats (Q1: 3–4 lines; Q2: blast radius table; Q3: plan.md in `instructions/`).
4. Optionally suggest when to use each variant (e.g. “full audit” vs “quick check”).

---

## Quick checklist for auditAPILayer

- [ ] Q1 answered in 3–4 lines only.
- [ ] Q2: codebase searched for send/receive and persistence; blast radius table by tech stack included.
- [ ] Q3: improvements stated; `instructions/plan.md` (or `instructions/audit-api-layer-plan.md`) created with findings and recommendations.
- [ ] All stacks in the monorepo represented in the blast radius table.
