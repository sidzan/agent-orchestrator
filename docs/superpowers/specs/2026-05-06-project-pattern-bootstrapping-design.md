# Project-Pattern Bootstrapping — Design Spec

**Date:** 2026-05-06
**Status:** Approved (post-brainstorming) — ready for implementation plan
**Affects:** `agent-bootstrap` CLI; all `templates/{frontend,backend}/...` files

---

## Problem

The bootstrap CLI installs a multi-agent orchestration skill into a target project, but the skill's references and pipeline checklists ship with hard-coded paths and conventions copied from a single source codebase (React-Admin + OData on the frontend, Flyway + multi-region SQL Server on the backend). Even after stripping proper nouns, the *shape* of those examples (file layouts, library imports, naming conventions, data-provider wiring) leaks the source project's architecture into every install.

Concrete symptom: a freshly-installed `implement-app` SKILL.md tells a user's agents to create files at `packages/ui/domain/<feature>/<Feature>.ts` and register resources via `Resources.WIDGETS` — paths and identifiers that exist in the source codebase but not in the target.

The references are EDIT-ME starter content the user is told to rewrite, but in practice nobody does, and the shipped shape becomes the de-facto recipe.

## Goal

When the user opts in, the CLI scans the target codebase using a Claude subprocess and rewrites the project-specific portions of every installed skill file with patterns derived from the user's actual code. Untagged content (gate sequence, methodology, persona definitions, the `Automated update>` Jira protocol, etc.) ships unchanged.

## Non-Goals

- Cross-session re-discovery. v1 is install-time only; re-running the CLI is the only way to refresh.
- Live discovery during skill invocation. The orchestrator never spawns Claude itself.
- Backward-compat with `claude` CLI absence. If the CLI is missing, agent-bootstrap exits with a deliberately blunt message rather than silently shipping the EDIT-ME content (see Failure modes).

---

## High-level flow

The existing 3-pass CLI grows a 4th pass between integration prompts and file writes:

```
1. Verify cwd is a project root.                          (existing)
2. Stack selection prompt: frontend / backend / both.     (existing)
3. Pass 1 — Structural inference (silent).                (existing)
4. Pass 2 — Confirmation.                                 (existing)
5. Pass 3 — Integration prompts (Jira, Sonar, hooks, MCP).(existing)
6. Pass 4 — Pattern discovery.                            (NEW)
   6a. Check `claude` CLI is on PATH; if not → mic-drop exit.
   6b. Print cost preview; prompt "Run pattern discovery? [Y/n]".
       Decline → mic-drop exit.
   6c. Walk the *templates* (not the user's repo yet) collecting every
       `<!-- DISCOVER:section-id ... -->` block and its instruction.
   6d. Spawn `claude -p` once with a single combined discovery prompt;
       parse JSON output {section-id: derived markdown | "FALLBACK"}.
7. Render templates with substitution AND discovered content.   (changed)
8. Write files; print discovery summary.                  (changed)
```

Pattern discovery is read-only: Claude has only `Read`, `Glob`, `Grep` tools. The CLI is the sole writer.

---

## Template tagging

Every project-specific section in any template file is wrapped:

```markdown
<!-- DISCOVER:list-page-files
  Find: where list page components live, the file-naming convention, the
  shared layout component(s) wrapping them, and the data-fetching pattern.
  Output: a 5–10 line "Files to create" checklist with concrete paths.
-->
- [ ] **2. Domain type** — `packages/ui/domain/<feature>/<Feature>.ts`
- [ ] **3. Service file** — `apps/<APP>/src/pages/<feature>/services/<feature>Service.ts`
…
<!-- /DISCOVER -->
```

Three parts:

1. **`section-id`** — unique key (kebab-case). Used in the discovery JSON map.
2. **Discovery instruction** (inside the opening tag, before `-->`) — what Claude should look for and what shape to output. This is the prompt fragment.
3. **Fallback content** (between tags) — what ships if discovery is declined or that specific section returns `"FALLBACK"`.

Tags can appear in **any** template file:
- `templates/frontend/implement-app/SKILL.md`
- `templates/frontend/implement-app/pipelines/*.md`
- `templates/frontend/implement-app/teams/*.md`
- `templates/frontend/implement-app/references/arch-*.md`
- (same for backend)

Untagged content is universal (gate sequence, methodology, persona definitions, Jira protocol, etc.) and is never touched by discovery.

### Render rule

Per tag block, given the discovery output map `D`:

| Condition | Output |
|---|---|
| `D[section-id]` exists and is not `"FALLBACK"` | Replace whole tag block with `D[section-id]`. |
| Otherwise | Strip just the comment markers (`<!-- DISCOVER... -->` and `<!-- /DISCOVER -->`); keep the fallback content. |

The renderer is a thin extension of `lib/substitute.js` — runs after `{{CONFIG.*}}` substitution but before files are written.

---

## The discovery prompt

A single Claude call. The CLI walks all templates being installed, collects each tag's `(section-id, instruction)`, and assembles:

```
You are scanning a {React | C# | both} codebase to derive
project-specific implementation patterns.

Repository root: {cwd}
Detected stack:  {react+vite+react-admin / c#-net8-flyway / mixed}
Apps to cover:   {list from Pass 2}

For each section below, read the relevant code and return a JSON object
mapping section-id → derived content (markdown). If you cannot find
sufficient examples in the codebase to derive a section, return the
literal string "FALLBACK" for that section-id.

Sections to derive:

[list-page-files]
{instruction body from the tag}

[form-page-files]
{instruction body}

[domain-types]
{instruction body}

…

Output ONLY a JSON object. No prose, no code fences, no commentary.
Keys are section-ids; values are markdown strings or "FALLBACK".
```

### Subprocess flags

```bash
claude -p "<discovery-prompt>" \
  --output-format json \
  --allowed-tools "Read,Glob,Grep" \
  --dangerously-skip-permissions
```

`--dangerously-skip-permissions` is acceptable here because the tool allow-list is read-only — there is no edit/Bash surface area to abuse.

### Parsing

`claude --output-format json` wraps the model's text output in an envelope. The CLI:

1. Reads stdout as JSON envelope.
2. Extracts the assistant's final text response.
3. Parses that text as a second JSON object (the section map).
4. Validates: every section-id collected from tags appears in the map; values are strings.
5. Any validation failure → global fallback (treat as if user declined).

---

## Failure modes

| Failure | Behavior |
|---|---|
| `claude` not on PATH | Print `your loss! mic drop. bye` and exit non-zero. |
| User declines the prompt | Print `your loss! mic drop. bye` and exit non-zero. |
| `claude -p` exits non-zero | Print stderr; treat as global fallback; install proceeds with all fallback content. |
| Discovery exceeds 5 min wall clock | Kill subprocess; global fallback. |
| Output envelope not valid JSON | Save raw output to `.claude/agent-bootstrap-discovery.log`; global fallback. |
| Inner section map not valid JSON | Same — save log, global fallback. |
| Specific `section-id` returns `"FALLBACK"` | That section uses fallback content; others use derived content. |
| Specific `section-id` missing from map | Same as `"FALLBACK"` — use fallback content for that section. |
| Specific `section-id` value is empty string | Same — use fallback content. |

Note the asymmetry: **missing claude CLI** and **user decline** are hard exits with mic drop. **Technical failures during execution** fall back gracefully because at that point the user has already opted in and has a partial install in progress; bailing would be worse than ship-as-is.

---

## Cost / opt-in UX

Before spawning Claude:

```
── Pattern Discovery (optional) ──
This will scan your codebase using Claude (read-only) to tailor the
skill's references and pipeline checklists to your project's actual
file paths, shared components, and naming conventions.

  Estimated:   30–90 seconds, ~5–20K tokens
  Tools used:  Read, Glob, Grep (no edits, no Bash)
  Cost:        billed against your existing Claude Code session

Run pattern discovery? [Y/n]
```

Default Y. Decline → mic-drop exit (no install).

After completion, the CLI prints a per-section summary:

```
── Pattern Discovery — results ──
  ✓ list-page-files       (derived from 4 examples)
  ✓ form-page-files       (derived from 2 examples)
  ⚠ odata-filters         (insufficient examples — fallback)
  ⚠ shared-components     (no shared lib found — fallback)
  ✓ domain-types          (derived from 7 examples)
  …

Sections derived: 5/8.  Sections fallback: 3/8.
```

The "examples found" hint comes from Claude wrapping each derived value with a single-line metadata header that the CLI strips before writing:

```
[examples=4] - [ ] **2. Domain type** — packages/...
```

If the header is missing, the summary just says `(derived)` with no count.

---

## Backend (C#) discovery

Same mechanism. Backend templates get DISCOVER tags for things like:

- handler placement (where new request handlers live)
- DI registration pattern (which `AddXxxApplicationServices()` to extend)
- migration file shape (Flyway vs EF Core, version-numbering convention, target databases)
- test layout (`tests/<Project>.IntegrationTests/...` vs flat)

The CLI's stack detection already knows whether to install frontend, backend, or both. The discovery prompt assembles tags from whichever templates are being installed. Cross-stack discovery (one Claude call sees both frontend and backend code) is fine — Claude can handle a mixed monorepo prompt.

---

## CLI changes

| File | Change |
|---|---|
| `bin/bootstrap.js` | Add Pass 4 between integrations and install. ~80 lines. May push the file past 350 lines; if so, split discovery into `lib/discover.js`. |
| `lib/discover.js` | NEW. `runDiscovery({templatesToInstall, cwd, stack}) → {[sectionId]: string}`. Includes the claude-CLI presence check, the prompt builder, the subprocess spawn, the JSON parsing, the validation. |
| `lib/substitute.js` | Add a second-pass renderer that consumes the discovery map and rewrites tagged blocks. Kept separate from `{{CONFIG.*}}` substitution; run sequentially. |
| `lib/install.js` | Pass the discovery map through to the renderer. |
| `templates/...` | Add `<!-- DISCOVER:... -->` blocks around every project-specific section. v1 starts with the most flagrant offenders (the implementation checklists in pipelines, the file paths in `references/arch-*.md`); other tags accrete over time. |

---

## Open / deferred

- **Re-discovery without full re-install**. v1 has no `--rediscover` flag. To refresh, re-run the CLI; rename-on-conflict gives a `<name>-v2` install the user hand-merges.
- **Streaming preview**. Discovery is opaque (you wait 30–90s, then see results). A future iteration could stream Claude's tool-use to stderr so the user sees what's being inspected.
- **Per-section opt-out**. v1 is binary (run discovery or don't). A future flag could let the user pick which sections to derive.
- **Caching**. Re-running the CLI in the same project re-spawns Claude from scratch. A `.claude/agent-bootstrap-cache.json` could store the last discovery output keyed by repo HEAD; out of scope for v1.
- **Token budget enforcement**. The cost preview is an estimate, not a hard cap. v1 trusts Claude Code's session limits to backstop runaway scans.

---

## Manual test matrix (additions to existing matrix)

| Scenario | Expected |
|---|---|
| `claude` CLI not on PATH | `your loss! mic drop. bye` exit |
| User declines pattern discovery | `your loss! mic drop. bye` exit (no `.claude/` written) |
| Discovery completes for all sections | All tagged sections rewritten; summary shows ✓ for each |
| Discovery returns `"FALLBACK"` for some | Mixed summary; fallback sections retain ship-as-is content |
| `claude -p` exits non-zero mid-run | Global fallback; install completes; stderr surfaced |
| JSON envelope unparseable | `.claude/agent-bootstrap-discovery.log` exists; global fallback |
| Greenfield React project (one App.tsx, no list pages, no forms) | Most sections return FALLBACK; install completes with EDIT-ME content for those |
| Mixed monorepo (frontend + backend) | Single discovery call covers both stacks; per-section summary distinguishes them |
