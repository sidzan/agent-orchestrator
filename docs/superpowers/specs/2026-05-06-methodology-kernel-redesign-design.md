# Methodology Kernel Redesign — Design Spec

**Date:** 2026-05-06
**Status:** Approved (post-brainstorming) — supersedes parts of the original design and the project-pattern-bootstrapping spec.
**Affects:** `bin/bootstrap.js`, `lib/{discover,install,substitute}.js`, the entire `templates/frontend/implement-app/` and `templates/backend/implement-backend/` trees.

---

## Problem

The shipped orchestrator skill is React-Admin / OData / Flow24-shaped at the bone. Stripping proper nouns and adding `<!-- DISCOVER -->` tags around fallback content does not solve this — the **fallback content itself is the problem**. A user with Next.js + tRPC, Remix, vanilla Vite, or any non-React-Admin React stack who runs `agent-bootstrap` and either declines discovery or has discovery fall back gets an installed skill that prescribes:

- `Resources.ts` enum management
- `ListPageContainer` + `DatagridConfigurable` usage
- `_eq` filter suffix conventions
- `operationCountry: string` in every domain type
- `apps/<APP>/src/pages/<feature>/{list,details,create}/ui/` directory layout

None of those are universal. They are Flow24's React-Admin idioms shipped under the label *"Canonical skill for ANY feature / bug / idea across the Admin, Employee, and Customer apps (all React-Admin based)"* — which itself declares the React-Admin assumption in the skill description.

The orchestrator's value is the methodology — gates, personas, TDD discipline, Jira protocol, model/cost discipline. That value gets buried under (and undermined by) shipped patterns that don't fit most projects.

## Goal

The shipped skill is a **methodology kernel**. It contains zero patterns, zero file paths, zero code samples. Project-specific knowledge is produced at install time by a Claude subprocess and written into a fresh `references/` directory inside the installed skill, or filled in by hand by the user.

If pattern discovery fails or is declined, the installed skill has an empty `references/` directory. Methodology still runs. No Flow24 idioms can leak in any path through the install.

## Non-Goals

- Shipping a "React-Admin starter pack" or any other stack-specific starter alongside the kernel. Out of scope; possibly a separate skill later.
- Live discovery during skill invocation. Discovery remains install-time only.
- Backwards-compat with the previous `<!-- DISCOVER -->` tag format. The tag format is deleted; existing tagged files get rewritten.
- Inferring patterns Claude does not have evidence for. If a project lacks any list pages, the skill simply has no `patterns/list-pages.md`. The agents will read the codebase directly when they need to build the first list page.

---

## What stays in the kernel

| File / area | Disposition |
|---|---|
| `SKILL.md` | **Kept** as: gate sequence (G0–G10) with universal pass/fail conditions, pipeline picker, artifact convention (PRD → FEAT → SPEC → ADR with slug naming), persona pointer table, the `Automated update>` Jira gate-comment protocol, model/cost discipline (Opus team-lead, Sonnet workers, Haiku jira-runner), red-flag list. **Deleted**: App Parameter Table, "Feature directory structure", "Translation keys / Lokalise" step, every code snippet that references `Resources.ts` / `ListPageContainer` / `operationCountry` / `_eq`. |
| `pipelines/{feature-fast,feature-full,bug-fast,bug-full,idea}.md` | **Kept**, but each pipeline's checklists describe gate outcomes and artifact expectations only — no concrete file paths, no library-specific steps. The "files to create" sections move to discovery. |
| `teams/*.md` | **Kept**, with any Flow24-internal references stripped. Persona definitions (PM / Explorer / Designer / Implementer / Test Writer / Verifier / Inspector / Scribe) are universal: they describe responsibilities, model assignment, and gate ownership. |
| `templates/` directory inside the skill | **Deleted entirely.** No `.tsx` / `.ts` code samples ship. |
| `references/` directory inside the skill (i.e. inside `templates/frontend/implement-app/references/`) | **Deleted entirely from the shipped templates.** Discovery creates the directory at install time inside the resolved installed skill, populated only with files Claude actually derived. |

---

## What gets deleted

Files and directories removed from the repo:

- `templates/frontend/implement-app/templates/` — every `.tsx` / `.ts` file (currently 13 files).
- `templates/frontend/implement-app/references/` — every `arch-*.md` and `task-tracking.md` file (currently 9 files).
- `templates/backend/implement-backend/assets/*.sql` — the EDIT-ME stubs for triggers/tables/views; also project-specific.
- `templates/backend/implement-backend/references/migration-guide.md` — Flyway / multi-region SQL Server specific.

Code removed:

- `renderDiscoverTags()` and `collectDiscoverTags()` in `lib/substitute.js` (~30 lines).
- The `DISCOVER_RE` regex constant.
- The `discoveryMap` parameter plumbed through `copyDirRendered` and `installSkill` in `lib/install.js`.
- The DISCOVER-tag walker logic in `lib/discover.js` (`walkTags`, `dedupeTags`, `collectDiscoverTags` import).

Tag annotations in templates that were added in the previous round:

- The `<!-- DISCOVER:* -->` blocks in `arch-api-to-feature.md`, `arch-list-patterns.md`, `arch-form-patterns.md`, `arch-detail-patterns.md`, `arch-shared-components.md` — moot once those files are deleted.

---

## New discovery contract

`lib/discover.js` carries a static list per stack. Two entries are filled in below as illustrations; the rest show structure only (`'…'`) — full instructions are authored during implementation, drawing from the patterns in the deleted reference files for inspiration.

```js
const FRONTEND_DISCOVERIES = [
  {
    filename: 'patterns/list-pages.md',
    instruction:
      'Find: where list page components live in this codebase, the file-naming convention, the layout component(s) wrapping them, and the data-fetching pattern. Output: a markdown reference doc engineers should read before implementing a new list page. Include concrete file paths and 1–2 short code excerpts from real components in the codebase. If no list pages exist, return "FALLBACK".',
  },
  {
    filename: 'patterns/forms.md',
    instruction: '…',
  },
  {
    filename: 'patterns/detail-pages.md',
    instruction: '…',
  },
  {
    filename: 'patterns/api-to-feature.md',
    instruction:
      'Find: the steps an engineer in this codebase follows to take a new backend endpoint and surface it as a CRUD feature in the UI. Look at: where domain types live, how API/data wiring is registered, where routes/resources are declared, the per-feature folder shape, and any translation/i18n step. Output: a numbered markdown checklist of 5–10 concrete steps with paths from THIS codebase. Skip patterns from libraries the codebase does not import.',
  },
  {
    filename: 'patterns/shared-components.md',
    instruction: '…',
  },
  {
    filename: 'patterns/testing.md',
    instruction: '…',
  },
  {
    filename: 'conventions/file-layout.md',
    instruction:
      'Find: the directory structure under each app, where features live, where shared code lives, where tests live. Output: a markdown reference describing this codebase\'s layout conventions, with a tree-style example for a representative feature.',
  },
  {
    filename: 'conventions/data-fetching.md',
    instruction:
      'Find: how this codebase fetches data — query libraries (TanStack Query, SWR, RTK Query, react-admin data provider, fetch wrappers), where API clients live, how loading/error states are handled. Output: short reference doc explaining the pattern with an example call site.',
  },
];

const BACKEND_DISCOVERIES = [
  { filename: 'patterns/handlers.md',          instruction: '…' },
  { filename: 'patterns/di-registration.md',   instruction: '…' },
  { filename: 'patterns/migrations.md',        instruction: '…' },
  { filename: 'patterns/integration-tests.md', instruction: '…' },
  { filename: 'conventions/project-layout.md', instruction: '…' },
];
```

The discovery prompt builder (`buildPrompt` in `lib/discover.js`) takes the active list (frontend / backend / both), assembles it into a single Claude prompt, and asks for a JSON map: `{filename: markdown | "FALLBACK"}`.

The CLI writes each non-FALLBACK entry as a literal file at `.claude/skills/<resolved-orchestrator-name>/references/<filename>`. Subdirectories (`patterns/`, `conventions/`) are created on demand. Filenames in the list are repository-relative paths within `references/` — they may include subdirectories.

If a key returns `"FALLBACK"`, is missing, or is an empty string → no file is written for that key. The `references/` directory may end up empty or sparse.

If discovery is declined or `claude` is missing → mic-drop exit (unchanged from prior spec).

---

## Kernel SKILL.md change

A short, universal section is added to the kernel SKILL.md (replacing any specific list of references):

```markdown
## Project-specific patterns

Before any implementation, agents MUST read every file under
`references/`. These were derived from this project's codebase at
install time and supersede any generic guidance.

If `references/` is empty or sparse, read the existing code under
{{CONFIG.apps[0].path}} (and equivalents) to ground decisions before
designing or implementing. Update `references/` by hand or by
re-running `agent-bootstrap` when conventions stabilize.
```

The kernel does not list expected reference filenames. Agents adapt to whatever exists. If a particular reference is absent, agents fall back to reading the codebase directly — which is the right behavior for projects whose patterns haven't been documented yet.

---

## Order of operations (revised)

```
1.  Verify cwd is a project root.
2.  Stack selection: frontend / backend / both.
3.  Pass 1 — Structural inference (silent).
4.  Pass 2 — Confirmation.
5.  Pass 3 — Integration prompts.
6.  Render & write kernel skill files (substitution only — no discovery yet).
7.  Pass 4 — Pattern discovery (NEW order):
    7a. Check `claude` is installed; mic-drop if not.
    7b. Print cost preview; prompt opt-in; mic-drop if declined.
    7c. Build prompt from FRONTEND_DISCOVERIES and/or BACKEND_DISCOVERIES.
    7d. Spawn `claude -p ... --allowed-tools "Read,Glob,Grep" --dangerously-skip-permissions`.
    7e. Parse JSON envelope and inner section map.
    7f. For each key with a non-FALLBACK value, write
        `.claude/skills/<resolved>/references/<filename>`.
8.  Install hooks (optional).
9.  Write `.mcp.json.example` (optional).
10. Print summary including how many references were derived.
```

The discovery pass moves to **after** the kernel skill is written, because the discovery target directory is the resolved installed skill (which may have been renamed via the rename-on-conflict prompt during step 6). This is a change from the previous spec, which placed discovery before installation.

---

## Code changes

| Change | File | Approx LoC delta |
|---|---|---|
| Delete `renderDiscoverTags`, `collectDiscoverTags`, `DISCOVER_RE` | `lib/substitute.js` | −35 |
| Remove `discoveryMap` parameter from public + private functions | `lib/install.js` | −10 |
| Add `FRONTEND_DISCOVERIES` and `BACKEND_DISCOVERIES` static lists | `lib/discover.js` | +60 |
| Replace `runDiscovery` return shape: returns `{ ok, written: [filename], fallback: [filename], reason }` instead of `{ ok, map }` | `lib/discover.js` | +20 −20 |
| Add `writeDerivedReferences(skillDir, map)` helper | `lib/discover.js` | +25 |
| Update `runPatternDiscovery` in `bin/bootstrap.js`: take `resolvedSkillDir` rather than `templatesToInstall`; print "wrote N references" summary | `bin/bootstrap.js` | +5 −10 |
| Move Pass 4 invocation in `main()` to after `installSkill` returns the resolved name | `bin/bootstrap.js` | restructure |

| Deletion | Files | Approx files removed |
|---|---|---|
| Delete `templates/frontend/implement-app/templates/` directory | 13 .tsx/.ts files | 13 |
| Delete `templates/frontend/implement-app/references/` directory | 9 .md files | 9 |
| Delete `templates/backend/implement-backend/assets/` directory | 4 .sql stubs | 4 |
| Delete `templates/backend/implement-backend/references/migration-guide.md` | 1 .md | 1 |
| Strip Flow24-shaped sections from `templates/frontend/implement-app/SKILL.md`, `pipelines/*.md`, `teams/*.md` | varies | edit-in-place |
| Strip Flow24-shaped sections from `templates/backend/implement-backend/SKILL.md`, `references/{decision-maker,explorer,implementer,test-writer,verifier,jira-runner}.md` | varies | edit-in-place |

---

## Failure modes (unchanged from prior spec, revalidated)

| Failure | Behavior |
|---|---|
| `claude` not on PATH | Mic-drop exit (code 2). |
| User declines discovery prompt | Mic-drop exit. |
| `claude -p` exits non-zero | Save stderr to `.claude/agent-bootstrap-discovery.log`; install proceeds with `references/` empty; print warning. |
| Discovery exceeds 5 min wall clock | Same as non-zero exit. |
| Output envelope not valid JSON | Same; log saved. |
| Inner section map not valid JSON | Same; log saved. |
| Specific key returns `"FALLBACK"` or is missing | No file written for that key. |
| Specific key value is empty string | No file written. |

The asymmetry remains: missing-claude and decline are hard exits; mid-run technical failures fall back to "no derived references" rather than aborting (the kernel skill still works).

---

## Manual test matrix (additions)

| Scenario | Expected |
|---|---|
| Decline pattern discovery | Mic-drop, no `.claude/` artifacts beyond what already existed. |
| `claude` not on PATH | Same. |
| Discovery succeeds for all 8 frontend keys | `.claude/skills/implement-app/references/` contains 8 files; SKILL.md has the universal "Project-specific patterns" section. |
| Discovery succeeds for 5/8 keys, 3 return FALLBACK | `references/` contains 5 files; missing 3 don't exist. |
| Discovery times out | `references/` is empty; install completes; warning printed; debug log saved. |
| User has a Next.js + tRPC project | Discovery should produce sensibly-named patterns (file paths under `app/` or `pages/`, mentions of tRPC routers, etc.) — **not** `Resources.ts` or React-Admin idioms. (This is the regression test for the redesign.) |
| Greenfield React project (no list pages, no forms yet) | Most keys return FALLBACK; `references/` may have only `conventions/file-layout.md`. Methodology still runs. |
| User runs in a Remix project | Discovery sees `routes/` shape and produces references oriented around it; no React-Admin leakage. |

---

## Open / deferred

- **Backend EDIT-ME starters for SQL.** The deleted `assets/*.sql` files were Flyway-specific stubs. If users want a database-migration generator pattern, a separate skill or a discover-targeted reference can do it. v1 ships nothing under `assets/`.
- **Re-discovery without full re-install.** Same as the prior spec — re-running the CLI is the only path. Could later add `agent-bootstrap --rediscover` that overwrites just the `references/` directory.
- **Per-discovery progress UI.** Discovery is a single opaque call. Streaming Claude's tool-use to stderr would let the user see what's being inspected. Out of scope for this redesign.
- **Adding stack-specific opt-in starters.** Out of scope. If demanded later, a separate skill `agent-bootstrap-react-admin-starter` could ship the patterns the kernel deliberately drops.
- **Reusing this kernel for additional orchestrators** (e.g., a "review-pr" skill, a "triage-bug" skill). Possible, since the kernel is now genuinely universal. Out of scope for this redesign.

---

## Migration impact

Existing installs from earlier versions (`a0bd644` through `aecabf5`) shipped Flow24-shaped templates. Users who already ran `agent-bootstrap` against any project have those installed. Re-running the CLI after this redesign will, due to the rename-on-conflict policy:

- Refuse to overwrite the existing `implement-app/` install
- Prompt for a new name (default `implement-app-v2/`)
- Install the kernel as `implement-app-v2/`
- Run discovery against their codebase, populating `implement-app-v2/references/`

The user can then delete the old `implement-app/` once they're satisfied with `-v2`.

This is acceptable — the previous spec already established that re-running with rename is the v1 update path.
