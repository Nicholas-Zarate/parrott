# Plan: Making Every Input View-Only (and blast radius)

**Scope: client/ only.** All file paths and changes below are within the Next.js client app. No agent or backend changes.

---

## How auth/edit gating works today

**There is no single “auth wrapper” that wraps the whole app.** Editability is controlled **per section**:

- **`usePermissions()`** (from `@/lib/hooks/use-permissions`) runs in individual pages/components and returns:
  - `loading`, `authenticated`, `userId`, `appRole` (admin | editor | viewer), `isBootstrapAdmin`, **`canEdit`** (true if bootstrap admin OR admin/editor role), **`isAdmin`**
- **Parent components** call `usePermissions()` and pass **`canEdit`** or **`readOnly`** down to cards/inputs.
- **No shared context** for “view only” — each feature decides using `canEdit` (and sometimes `isAdmin`).

So: **FE elements are gated by passing `canEdit` / `readOnly` from the component that calls `usePermissions()`, not by a single wrapper.**

---

## What “every input view-only” can mean

1. **Option A – Global kill switch**  
   One flag (e.g. env or feature flag) that forces **all** inputs to read-only regardless of role. Good for maintenance mode or “freeze UI” without changing roles.

2. **Option B – Enforce viewer = view-only**  
   Ensure every editable surface respects `canEdit` (and, if you want, explicitly treats `appRole === "viewer"` as view-only). Viewers already get `canEdit: false`; this is mostly an audit + fix of any missed spots.

3. **Option C – New “view-only mode” in auth**  
   e.g. `AppUser.consoleUser` or a new flag that means “this session is view-only”. Then you’d derive a single `viewOnly` (or `!canEdit`) from that and pass it down the same way you do `canEdit` today.

---

## Blast radius (client/ only)

### 1. Permission source (single place)

| Location | Purpose |
|----------|--------|
| `lib/hooks/use-permissions.ts` | Source of truth for `canEdit`, `isAdmin`, `appRole`. Any “view only” that depends on role will go through here (or a value derived from it). |

**Blast radius:** One file. If you add a global “view only” flag, you could expose it here (e.g. `viewOnlyOverride: boolean`) and have `canEdit` become `canEdit && !viewOnlyOverride`.

---

### 2. Places that call `usePermissions()` and pass editability down

| Location | What it passes | What becomes view-only |
|----------|----------------|------------------------|
| `components/personality-tabs.tsx` | `canEdit={perms.canEdit}` or `canEdit={perms.isAdmin}` to multiple cards | All Personality tab content: tones, voice sliders, TTS ending, roast config, prompt config. |
| `app/settings/model/page.tsx` | Uses `perms.isAdmin`; non-admins get a message instead of the form | Model + Voice model selects (admins only see form). |
| `app/settings/team/page.tsx` | Uses `perms`; “Only admins can manage team roles” | Team role dropdowns and role management. |
| `app/activities/scenarios/page.tsx` | `readOnly={!perms.canEdit}` to scenario cards | Scenario cooldowns and checkboxes. |
| `components/side-nav.tsx` | `perms.isAdmin` to show/hide Settings | Entire Settings section (Model, Team) is hidden for non-admins. |

**Blast radius:** These 5 call sites. Making “every input view-only” in practice means either (a) making each of these pass “no edit” (e.g. force `canEdit=false` or `readOnly=true`), or (b) changing the single source in `usePermissions()` so they all get `canEdit=false` when in “view-only mode”.

---

### 3. Components that receive `canEdit` or `readOnly` (consumers)

| Component | Prop | Behavior when view-only |
|-----------|------|--------------------------|
| `personality-tone-list.tsx` (Media + System) | `canEdit` | Hides/disables toggles and description edits; shows “Ask an admin for editor permissions”. |
| `voice-style-sliders-card.tsx` | `canEdit` | Disables sliders and save; shows “Ask an admin for editor permissions”. |
| `tts-ending-card.tsx` | `canEdit` | `disabled = !canEdit \|\| saving`; hides save when `!canEdit`. |
| `roast-config-card.tsx` | `canEdit` | Disables inputs and save; shows “Ask an admin for editor permissions”. |
| `prompt-config-lists.tsx` | (used under personality-tabs with canEdit) | Disables save/edits when not allowed. |
| `scenario-settings-card.tsx` | `readOnly` | `disabled={saving \|\| readOnly}` on all inputs. |
| `personality-keywords-chips.tsx` | `addEditDisabled` (separate from canEdit) | Add/edit/remove disabled when true. |

**Blast radius:** These 7 components already support a “view-only” style behavior via `canEdit` or `readOnly`. No new component API is required if you only want “viewer role = view-only”; you only need to ensure every parent passes `canEdit=false` for viewers (which they already do if `usePermissions()` is correct).

---

### 4. Pages that render forms but don’t use `canEdit` for inputs

| Location | Notes |
|----------|--------|
| `app/login/page.tsx` | Console code + Discord; leave as-is (auth entry point). |
| `components/history-filter-header.tsx` | Search/filter inputs; currently only `disabled={isSearching}`. Could be gated by a “view only” flag if you want filters read-only. |
| `components/logs-filter-header.tsx` | Same idea as history filters. |
| `app/user/page.tsx` | User preferences (e.g. DM toggles); currently no `canEdit` — could add if you want viewers to see but not change. |

**Blast radius:** Small: 2–3 places. Only relevant if “every input” includes filters and user prefs.

---

## How it would work in practice (client only)

### If you use the existing pattern (Option B – viewer = view-only)

- **No new wrapper.** Keep using `usePermissions()` in the same parent components.
- **Ensure** every place that can edit gets `canEdit` (or `readOnly`) from `usePermissions()` and that viewers have `canEdit: false` (already true if DB/roles are set correctly).
- **Audit** the “Pages that render forms but don’t use canEdit” section above; add `canEdit`/`readOnly` there if you want those inputs view-only for viewers.

### If you add a global “view-only mode” (Option A or C)

1. **Single source of “view only”**
   - Either in `usePermissions()` (e.g. env `NEXT_PUBLIC_VIEW_ONLY=true` or runtime flag) or in your auth context (e.g. `AppUser.consoleUser` or a dedicated `viewOnly`).
2. **Derive one flag**
   - e.g. `effectiveCanEdit = canEdit && !viewOnlyOverride` in the hook or in a thin wrapper hook.
3. **No change to child components**
   - They already take `canEdit` or `readOnly`; parents keep passing the same props, now driven by `effectiveCanEdit`.
4. **Optional: auth wrapper**
   - You could add a single **`ViewOnlyProvider`** that reads the flag and exposes `viewOnly` (and/or `effectiveCanEdit`) via context so every page doesn’t need to call `usePermissions()` just for that. That would be a convenience layer; the actual gating would still be “pass down `canEdit` / `readOnly`” to the same list of consumers above.

---

## Summary table (blast radius — client/ only)

| Layer | Files / areas | Change if “every input view-only” |
|-------|----------------|-----------------------------------|
| Permission source | `lib/hooks/use-permissions.ts` | Optional: add global view-only override or derive `effectiveCanEdit`. |
| Call sites (pass canEdit/readOnly) | personality-tabs, settings/model, settings/team, activities/scenarios, side-nav | Either pass forced read-only when in “view-only mode” or rely on updated hook. |
| Consumers (inputs) | personality-tone-list, voice-style-sliders-card, tts-ending-card, roast-config-card, prompt-config-lists, scenario-settings-card, personality-keywords-chips | No API change; they already respect `canEdit`/`readOnly`. |
| Edge cases | history-filter-header, logs-filter-header, user/page | Add `canEdit`/read-only handling only if you want those inputs view-only too. |

**Bottom line:** You are **not** using a single auth wrapper that wraps FE elements. You are using **per-component permission checks** via `usePermissions()` and passing **`canEdit`** or **`readOnly`** down. Making every input view-only works by (1) ensuring that “view only” is expressed as `canEdit === false` (or a new global override) in one place, and (2) ensuring every input that should be view-only is behind one of the existing consumers that already respect `canEdit`/`readOnly`. **All of this is confined to the client app.**
