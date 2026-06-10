# What to remember — memory guidance (current / in use)

> ✅ **CURRENT.** This guidance is used by v2. There is **no custom remember tool** —
> v2 relies on Mastra's built-in `updateWorkingMemory`. This content folds into the
> agent **instructions** and the **working-memory template** so the model knows what's
> worth persisting. See [`docs/memory-plan.md`](../../docs/memory-plan.md) and `plan.md` Task 2.

Use this guidance to decide what the bot should persist to working memory. This is for a Discord server that works like a friend group: the goal is to feel like a member who remembers what matters and forgets the rest.

---

## When to remember

Remember something when it will **increase belonging, inside-joke payoff, or relevance** later. If it’s generic, one-off, or wouldn’t change how you’d reply next time, skip it.

---

## Criteria (prioritized)

### 1. **User identity & preferences**
- Names, nicknames, pronouns, how they want to be called.
- Stated preferences: games, music, time zones, when they’re usually around, “don’t mention X,” etc.
- Anything they explicitly ask you to remember (“remember I’m in PST,” “remember I hate spoilers”).

### 2. **Slang, inside language & running jokes**
- Server- or group-specific slang, acronyms, phrases that keep coming back.
- Inside jokes: the trigger (phrase, event, meme) and short context so you can riff on it later without re-explaining.
- Callbacks: “that one time when…”, recurring bits, character or bit names the group uses.

### 3. **Shared context & commitments**
- Plans or commitments people made (“we’re doing the raid Saturday,” “I’ll send that link,” “promised to watch X”).
- Ongoing topics: current game, show, project, or drama the group is following.
- First-time disclosures (something shared for the first time) and big moments (wins, losses, life updates) that the group would expect a friend to remember.

### 4. **Relational & emotional anchors**
- Who is close with whom, who plays together, who tends to lead topics.
- Sensitivities: topics or jokes that landed badly or that someone asked to avoid.
- Recurring moods or patterns (“they’re usually joking when they say X,” “they get serious when talking about Y”).

### 5. **Facts that improve the next reply**
- Concrete facts that will make the next answer better: current patch, release date, “they’re on console not PC,” favorite character, etc.
- Corrections they gave you (“actually it’s X not Y”) so you don’t repeat the mistake.

---

## When *not* to remember

- **Generic small talk** that doesn’t tie to a person, joke, or future use.
- **One-off throwaway lines** with no callback or preference value.
- **Sensitive or private details** unless they’re clearly shared as group context (e.g. “we all know he’s moving”). When in doubt, don’t store.
- **Pure venting or ephemeral mood** unless they tie to a recurring theme or preference.
- **Things that change constantly** (e.g. “I’m tired today”) unless it becomes a running joke or pattern.

---

## How to phrase what you store

- **Short and reusable.** Key phrase or fact, not the whole conversation.
- **Scoped.** If it’s about one person, store it under that user/scope; if it’s server-wide (slang, inside joke), store under channel/guild.
- **Neutral and factual.** Store what was said or agreed, not your interpretation or judgment.

---

## Psychology note (for prompt design)

Research on friend groups and “transactive memory” suggests that **remembering for each other** strengthens perceived closeness: people feel more connected when the group (or a bot acting like a member) recalls shared experiences, inside jokes, and preferences. Remembering **selectively**—things that matter for engagement and entertainment—matters more than remembering everything. This prompt is tuned for that: remember what a good friend in the group would remember.
