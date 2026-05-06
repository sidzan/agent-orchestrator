# Methodology Kernel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the shipped agent-bootstrap skill into a methodology-only kernel (gates, personas, Jira protocol, TDD/cost discipline). Project-specific patterns are produced at install time by `claude` and written into a fresh `references/` directory inside the installed skill — no React-Admin / OData / Flow24 idioms ever ship in the package.

**Architecture:** Delete every Flow24-shaped artifact from `templates/`. Strip Flow24-shaped sections from kernel files (SKILL.md, pipelines/, teams/) for both frontend and backend orchestrators. Replace the section-level `<!-- DISCOVER -->` tag mechanism with file-level discovery: a static list of `{filename, instruction}` pairs in `lib/discover.js`, a single `claude -p` call that returns a JSON map, and direct file writes into the resolved skill's `references/` directory after the kernel is installed. If discovery is declined or the `claude` CLI is missing, mic-drop exit. If a section returns FALLBACK or fails parsing mid-run, that file simply isn't written and the kernel continues.

**Tech Stack:** Node.js (built-ins only — `fs`, `path`, `child_process`, `readline`). Zero npm deps. No automated test framework — verification is one-line Node assertions and grep checks.

**Reference spec:** `docs/superpowers/specs/2026-05-06-methodology-kernel-redesign-design.md`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/substitute.js` | shrink | `{{CONFIG.*}}` substitution + `{{#if}}` conditionals only. DISCOVER tag logic deleted. |
| `lib/install.js` | simplify | Recursive copy + render. `discoveryMap` parameter removed (kernel render is config-only). |
| `lib/discover.js` | rewrite | Owns `FRONTEND_DISCOVERIES` and `BACKEND_DISCOVERIES` static lists. `runDiscovery` now writes files into a target dir; returns `{ok, written: [], fallback: [], reason}`. |
| `bin/bootstrap.js` | reorder | Pass 4 (Pattern Discovery) moves to AFTER kernel install. Receives the resolved orchestrator skill dir from `installSkill`. |
| `templates/frontend/implement-app/templates/` | DELETE entirely | 13 React-Admin code samples removed. |
| `templates/frontend/implement-app/references/` | DELETE entirely | 9 Flow24 reference docs removed. |
| `templates/frontend/implement-app/SKILL.md` | strip + amend | Drop App Parameter Table, "Feature directory structure", translation-key step, Resources.ts/ListPageContainer mentions. Add "Project-specific patterns" section. Update `description:` to drop "React-Admin" and "Admin/Employee/Customer apps". |
| `templates/frontend/implement-app/pipelines/*.md` | strip | Remove file-path checklists and library-specific steps; keep gate definitions and artifact requirements. |
| `templates/frontend/implement-app/teams/*.md` | strip | Remove Flow24-internal references; keep persona definitions and gate ownership. |
| `templates/backend/implement-backend/assets/` | DELETE entirely | 4 SQL stubs removed (project-shape assumption). |
| `templates/backend/implement-backend/references/migration-guide.md` | DELETE | Flyway/SQL Server specific. |
| `templates/backend/implement-backend/SKILL.md` | strip + amend | Same treatment as frontend SKILL.md. |
| `templates/backend/implement-backend/references/{decision-maker,explorer,implementer,jira-runner,test-writer,verifier}.md` | strip | Remove BackOffice / FieldEmployee / Customer API surface enumerations and 4-country DB assumptions; keep persona role descriptions. |
| `README.md` | minor edit | Drop "EDIT-ME starter references" wording; describe the kernel + discovery model. |
| `CLAUDE.md` | minor edit | Same. |

---

## Task 1: Tear down the DISCOVER tag mechanism

**Files:**
- Modify: `lib/substitute.js` (delete `renderDiscoverTags`, `collectDiscoverTags`, `DISCOVER_RE`, exports)
- Modify: `lib/install.js` (remove `discoveryMap` parameter from `copyDirRendered` and `installSkill`)

- [ ] **Step 1: Open `lib/substitute.js` and remove the DISCOVER section**

Delete these four blocks from the file (currently lines ~118–168):

1. The `if (options.discoveryMap)` branch inside `render()`:
```js
  if (options.discoveryMap) {
    return renderDiscoverTags(afterValues, options.discoveryMap, warn);
  }
  return afterValues;
```
Replace with the single line:
```js
  return afterValues;
```

2. The `DISCOVER_RE` constant declaration (one regex line).
3. The full `renderDiscoverTags(text, discoveryMap, warn)` function body (~13 lines).
4. The full `collectDiscoverTags(text)` function body (~12 lines).
5. The exports at the bottom — change from:
```js
module.exports = { render, resolvePath, renderDiscoverTags, collectDiscoverTags };
```
to:
```js
module.exports = { render, resolvePath };
```

- [ ] **Step 2: Verify substitute.js parses cleanly**

Run:
```bash
node --check lib/substitute.js
```
Expected: no output (success).

- [ ] **Step 3: Verify the deleted symbols are gone**

Run:
```bash
grep -nE "DISCOVER_RE|renderDiscoverTags|collectDiscoverTags" lib/substitute.js
```
Expected: no matches.

- [ ] **Step 4: Modify `lib/install.js` — remove `discoveryMap` parameter**

Find the `copyDirRendered` signature and remove the trailing `, discoveryMap` parameter. Replace:
```js
function copyDirRendered(srcDir, destDir, config, log, discoveryMap) {
```
with:
```js
function copyDirRendered(srcDir, destDir, config, log) {
```

Inside the same function, remove `, discoveryMap` from the recursive call and from the `render()` options. Replace:
```js
      count += copyDirRendered(src, dest, config, log, discoveryMap);
```
with:
```js
      count += copyDirRendered(src, dest, config, log);
```

And replace:
```js
        const rendered = render(raw, config, {
          warn: (msg) => log && log(`  warn: ${path.relative(process.cwd(), src)}: ${msg}`),
          discoveryMap: discoveryMap || undefined,
        });
```
with:
```js
        const rendered = render(raw, config, {
          warn: (msg) => log && log(`  warn: ${path.relative(process.cwd(), src)}: ${msg}`),
        });
```

- [ ] **Step 5: Modify `installSkill` signature**

Replace:
```js
async function installSkill({ projectRoot, templateDir, skillName, config, prompts, log, discoveryMap }) {
```
with:
```js
async function installSkill({ projectRoot, templateDir, skillName, config, prompts, log }) {
```

And replace the `copyDirRendered` call inside it from:
```js
  const fileCount = copyDirRendered(templateDir, resolved.target, finalConfig, log, discoveryMap);
```
to:
```js
  const fileCount = copyDirRendered(templateDir, resolved.target, finalConfig, log);
```

- [ ] **Step 6: Verify install.js parses cleanly**

Run:
```bash
node --check lib/install.js
```
Expected: no output.

- [ ] **Step 7: Verify discoveryMap is gone**

Run:
```bash
grep -n "discoveryMap" lib/install.js
```
Expected: no matches.

- [ ] **Step 8: Commit**

```bash
git add lib/substitute.js lib/install.js
git -c commit.gpgsign=false commit -m "refactor: remove DISCOVER tag mechanism

The section-level <!-- DISCOVER:id -->...<!-- /DISCOVER --> approach is
replaced by file-level discovery (next commits). Strips the tag walker
from substitute.js and the discoveryMap parameter from install.js.
"
```

---

## Task 2: Delete shipped Flow24-shaped artifacts

**Files:**
- Delete: `templates/frontend/implement-app/templates/` (entire directory, 13 files)
- Delete: `templates/frontend/implement-app/references/` (entire directory, 9 files)
- Delete: `templates/backend/implement-backend/assets/` (entire directory, 4 files)
- Delete: `templates/backend/implement-backend/references/migration-guide.md`

- [ ] **Step 1: Confirm what's about to be deleted**

Run:
```bash
ls templates/frontend/implement-app/templates/
ls templates/frontend/implement-app/references/
ls templates/backend/implement-backend/assets/
ls templates/backend/implement-backend/references/migration-guide.md
```
Expected: all four listings show files (no errors).

- [ ] **Step 2: Delete the frontend `templates/` directory**

```bash
rm -r templates/frontend/implement-app/templates/
```

- [ ] **Step 3: Delete the frontend `references/` directory**

```bash
rm -r templates/frontend/implement-app/references/
```

- [ ] **Step 4: Delete the backend `assets/` directory**

```bash
rm -r templates/backend/implement-backend/assets/
```

- [ ] **Step 5: Delete the backend `migration-guide.md`**

```bash
rm templates/backend/implement-backend/references/migration-guide.md
```

- [ ] **Step 6: Verify the deletions**

```bash
ls templates/frontend/implement-app/templates/ 2>&1 | grep -q "No such" && echo "frontend templates/ gone" || echo "FAIL"
ls templates/frontend/implement-app/references/ 2>&1 | grep -q "No such" && echo "frontend references/ gone" || echo "FAIL"
ls templates/backend/implement-backend/assets/ 2>&1 | grep -q "No such" && echo "backend assets/ gone" || echo "FAIL"
test ! -e templates/backend/implement-backend/references/migration-guide.md && echo "backend migration-guide.md gone" || echo "FAIL"
```
Expected: four "gone" lines, zero FAILs.

- [ ] **Step 7: Confirm what remains in the orchestrator dirs**

```bash
find templates/frontend/implement-app templates/backend/implement-backend -type d | sort
```
Expected — only methodology-bearing directories remain:
```
templates/backend/implement-backend
templates/backend/implement-backend/references
templates/frontend/implement-app
templates/frontend/implement-app/pipelines
templates/frontend/implement-app/teams
```
(No `templates/`, no frontend `references/`, no `assets/`.)

- [ ] **Step 8: Commit**

```bash
git add -A templates/
git -c commit.gpgsign=false commit -m "feat: delete shipped Flow24-shaped patterns

Removes the React-Admin/OData code samples, Flow24-shaped reference
docs, Flyway SQL stubs, and multi-region migration guide. The kernel
now ships methodology only — patterns come from install-time discovery.

Removed:
- templates/frontend/implement-app/templates/ (13 files: ListPage.tsx,
  CreateForm.tsx, EditForm.tsx, ReferenceInputActive.tsx, etc.)
- templates/frontend/implement-app/references/ (9 files: arch-*.md +
  task-tracking.md)
- templates/backend/implement-backend/assets/ (4 SQL stubs)
- templates/backend/implement-backend/references/migration-guide.md
"
```

---

## Task 3: Strip Flow24 sections from frontend kernel

**Files:**
- Modify: `templates/frontend/implement-app/SKILL.md` (strip + add Project-specific patterns)
- Modify: `templates/frontend/implement-app/pipelines/{feature-fast,feature-full,bug-fast,bug-full,idea}.md` (strip checklists with concrete file paths)
- Modify: `templates/frontend/implement-app/teams/*.md` (strip Flow24-internal references)

- [ ] **Step 1: Inventory what needs stripping in frontend SKILL.md**

Run:
```bash
grep -nE "Resources\.|ListPageContainer|operationCountry|_eq|@yourorg|apps/<APP>|App Parameter Table|Feature directory structure|Translation keys|Lokalise|React-Admin|Admin, Employee" templates/frontend/implement-app/SKILL.md
```
Expected: a list of line numbers. These are the offending sections.

- [ ] **Step 2: Read the SKILL.md in chunks and rewrite**

Use the Read tool on `templates/frontend/implement-app/SKILL.md`.

For the **frontmatter**: change the `description:` field. Replace any phrase resembling:
```yaml
description: Canonical skill for ANY feature / bug / idea across the Admin, Employee, and Customer apps (all React-Admin based).
```
with:
```yaml
description: Multi-agent orchestrator for frontend feature / bug / idea work. Runs a gate pipeline (G0–G10) with named team personas, TDD discipline, and a Jira gate-comment protocol. Stack-agnostic kernel — project-specific patterns are derived at install time and live in references/.
```

For the **App Parameter Table** (a markdown table listing `admin / employee / customer` apps with ports and pnpm filters): delete the entire table section. The kernel does not need to enumerate apps; the orchestrator detects them via `{{CONFIG.apps}}` substitution where needed.

For the **"Feature directory structure"** section (a tree showing `apps/<APP>/src/pages/<feature>/...`): delete the entire section. This is a project-shape assumption.

For the **"Translation keys / Lokalise"** step in any checklist: delete the whole bullet/step.

For any code snippet referencing `Resources.WIDGETS`, `ListPageContainer`, `operationCountry`, `_eq` filters: delete the snippet and any prose introducing it.

- [ ] **Step 3: Add "Project-specific patterns" section to frontend SKILL.md**

Find a spot near the top of the body (after the description / problem statement, before pipeline definitions) and insert:

```markdown
## Project-specific patterns

Before any implementation, agents MUST read every file under `references/`.
These were derived from this project's codebase at install time and
supersede any generic guidance.

If `references/` is empty or sparse, read the existing code under
{{CONFIG.apps[0].path}} (and equivalents) to ground decisions before
designing or implementing. Update `references/` by hand or by re-running
`agent-bootstrap` when conventions stabilize.
```

- [ ] **Step 4: Verify SKILL.md no longer contains banned strings**

Run:
```bash
grep -cE "Resources\.|ListPageContainer|operationCountry|_eq|App Parameter Table|Feature directory structure|Translation keys|Lokalise|React-Admin|Admin, Employee" templates/frontend/implement-app/SKILL.md
```
Expected: `0`

Also confirm the new section is present:
```bash
grep -c "Project-specific patterns" templates/frontend/implement-app/SKILL.md
```
Expected: `1` (or more).

- [ ] **Step 5: Strip pipelines/feature-full.md**

Read `templates/frontend/implement-app/pipelines/feature-full.md`. Remove every checklist item that prescribes a concrete file path tied to React-Admin (e.g. `packages/ui/config/Resources.ts`, `apps/<APP>/src/pages/<feature>/...`, `useDataProvider.ts`). Keep:
- The gate sequence (G0, G1, …, G10)
- Pass/fail criteria for each gate
- Artifact expectations (PRD path, FEAT path, etc., using `{{CONFIG.*}}` substitution where feasible — otherwise generic `docs/plans/`)
- Persona-spawn instructions
- Jira gate-comment expectations

Replace any "Files to create" sub-list with a one-line pointer:
```markdown
**Files to create / modify:** Determined per-feature by reading `references/`
or, if absent, the existing code under {{CONFIG.apps[0].path}}.
```

- [ ] **Step 6: Strip the other four pipelines**

Apply the same surgery to:
- `pipelines/feature-fast.md`
- `pipelines/bug-fast.md`
- `pipelines/bug-full.md`
- `pipelines/idea.md`

Each retains its gate flow and artifact expectations; loses any "create file at X" prescription.

- [ ] **Step 7: Verify no banned strings remain in pipelines/**

```bash
grep -lnE "Resources\.|ListPageContainer|operationCountry|_eq|@yourorg|packages/ui|apps/<APP>" templates/frontend/implement-app/pipelines/
```
Expected: no output (empty).

- [ ] **Step 8: Strip teams/ persona files**

For each file in `templates/frontend/implement-app/teams/{browser-qa,decision-maker,design-reviewer,eng-reviewer,explorer,implementer,jira-runner,test-writer,verifier}.md`:

- Read the file.
- Find any references to specific Flow24 file paths (`apps/admin`, `packages/ui/...`), specific React-Admin component names (`ListPageContainer`, `Datagrid`, `useDataProvider`), or specific entity names from the source codebase.
- Replace concrete file-path examples with stack-agnostic phrasing: "the data-fetching layer", "the resource-registration site", "the shared component library".
- Keep: persona role description, gate ownership, model assignment (Opus/Sonnet/Haiku), output format expectations, escalation rules.

- [ ] **Step 9: Verify teams/ is clean**

```bash
grep -lnE "Resources\.|ListPageContainer|operationCountry|@yourorg|packages/ui|apps/<APP>" templates/frontend/implement-app/teams/
```
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add templates/frontend/implement-app/
git -c commit.gpgsign=false commit -m "refactor(frontend-kernel): strip Flow24/React-Admin patterns

Remove App Parameter Table, Feature directory tree, translation steps,
and every concrete reference to Resources.ts / ListPageContainer /
operationCountry / _eq / packages/ui / apps/<APP> from SKILL.md,
pipelines/, and teams/. Add the universal 'Project-specific patterns'
section pointing at references/. Update the SKILL.md description to
drop the React-Admin assumption.

Pipelines retain their gate sequence and artifact expectations; lose
their concrete-file-path checklists.

Personas retain their role, model assignment, and escalation rules;
lose any specific Flow24 entity / library names.
"
```

---

## Task 4: Strip Flow24 sections from backend kernel

**Files:**
- Modify: `templates/backend/implement-backend/SKILL.md` (strip + add Project-specific patterns)
- Modify: `templates/backend/implement-backend/references/{decision-maker,explorer,implementer,jira-runner,test-writer,verifier}.md`

- [ ] **Step 1: Inventory backend SKILL.md offenders**

```bash
grep -nE "BackOffice|FieldEmployee|Customer\.Api|Workers\.|Functions\.|ICPlan|3 API surface|API_SURFACE|EDIT-ME" templates/backend/implement-backend/SKILL.md
```
Expected: line numbers.

- [ ] **Step 2: Rewrite backend SKILL.md frontmatter description**

Replace any text resembling:
```yaml
description: ... three API surfaces (BackOffice, FieldEmployee, Customer) ...
```
with:
```yaml
description: Multi-agent orchestrator for C# backend feature / bug / idea work. Runs a gate pipeline (G0–G10) with TDD-first discipline (RED before GREEN), named team personas, and a Jira gate-comment protocol. Stack-agnostic kernel — project-specific patterns (handlers, DI registration, migrations, tests) are derived at install time and live in references/.
```

- [ ] **Step 3: Strip backend SKILL.md body**

Remove:
- Any tables enumerating "BackOffice / FieldEmployee / Customer" API surfaces.
- Any references to `AddBackOfficeApplicationServices`, `BuildBackOfficeEdm`, `Flow24.Workers.*`, or specific .csproj names.
- Any 4-country (`NO/DK/FI/SE`) database section.
- Any concrete file-path checklist (`src/YourOrg.Service.Api/...`) — replace with the same stack-agnostic pointer used in the frontend pipelines.

Keep: gate sequence, model/cost discipline, TDD discipline, persona pointer table, Jira gate-comment protocol, red-flag list.

- [ ] **Step 4: Add Project-specific patterns to backend SKILL.md**

Insert near the top of the body:

```markdown
## Project-specific patterns

Before any implementation, agents MUST read every file under `references/`.
These were derived from this project's codebase at install time and
supersede any generic guidance.

If `references/` is empty or sparse, read the existing code under
{{CONFIG.backend.srcPath}} (and equivalents) to ground decisions before
designing or implementing. Update `references/` by hand or by re-running
`agent-bootstrap` when conventions stabilize.
```

- [ ] **Step 5: Verify backend SKILL.md is clean**

```bash
grep -cE "BackOffice|FieldEmployee|Customer\.Api|Workers\.|ICPlan|3 API surface|API_SURFACE" templates/backend/implement-backend/SKILL.md
```
Expected: `0`

```bash
grep -c "Project-specific patterns" templates/backend/implement-backend/SKILL.md
```
Expected: at least `1`.

- [ ] **Step 6: Strip backend persona files**

For each of `references/{decision-maker,explorer,implementer,jira-runner,test-writer,verifier}.md`:

- Remove enumerations of BackOffice / FieldEmployee / Customer / Worker.
- Remove specific Flow24 namespace references (`YourOrg.BackOffice.*`).
- Remove the 4-country trigger pattern guidance.
- Keep: persona role, gate ownership, model assignment, output format, escalation rules.

- [ ] **Step 7: Verify backend references/ is clean**

```bash
grep -lnE "BackOffice|FieldEmployee|Customer\.Api|ICPlan|API_SURFACE|3 API surface" templates/backend/implement-backend/references/
```
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add templates/backend/implement-backend/
git -c commit.gpgsign=false commit -m "refactor(backend-kernel): strip Flow24/multi-API-surface assumptions

Remove the 3-API-surface (BackOffice/FieldEmployee/Customer) framing,
4-country DB pattern, and Flyway specifics from SKILL.md and the persona
references. Add the universal 'Project-specific patterns' section
pointing at references/.

Personas retain their role, model assignment, and escalation rules;
lose any specific Flow24 service / namespace / DB-tier assumptions.
"
```

---

## Task 5: Add `FRONTEND_DISCOVERIES` and `BACKEND_DISCOVERIES` to lib/discover.js

**Files:**
- Modify: `lib/discover.js`

- [ ] **Step 1: Open `lib/discover.js` and locate the top-level constants area**

Currently the file imports `{ collectDiscoverTags }` from `./substitute`. That import is now broken. Remove it. Replace:
```js
const { collectDiscoverTags } = require("./substitute");
```
with nothing (delete the line).

- [ ] **Step 2: Delete the now-orphan helpers**

Remove the following functions (they were used by the section-level mechanism):
- `walkTags(dir, tags = [])`
- `dedupeTags(tags)`

Also remove their entries from `module.exports` at the bottom.

- [ ] **Step 3: Add the static discovery lists near the top of the file**

Add (after the `DISCOVERY_TIMEOUT_MS` constant):

```js
const FRONTEND_DISCOVERIES = [
  {
    filename: "patterns/list-pages.md",
    instruction:
      "Find: where list/index page components live in this codebase, the file-naming convention, the layout component(s) wrapping them, and the data-fetching pattern. Output: a markdown reference doc engineers should read before implementing a new list page. Include concrete file paths and 1-2 short code excerpts from real components in the codebase. If no list pages exist, return \"FALLBACK\".",
  },
  {
    filename: "patterns/forms.md",
    instruction:
      "Find: where form components live (create / edit / submit forms), the validation library used, how form state is managed, and how submission errors surface to the user. Output: a markdown reference with concrete file paths and a short canonical example from the codebase. If no forms exist, return \"FALLBACK\".",
  },
  {
    filename: "patterns/detail-pages.md",
    instruction:
      "Find: where detail / show / view pages live, how they fetch a single record by id, how they handle loading and not-found states, and any tab / section pattern. Output: a markdown reference with concrete paths. If no detail pages exist, return \"FALLBACK\".",
  },
  {
    filename: "patterns/api-to-feature.md",
    instruction:
      "Find: the steps an engineer in this codebase follows to take a new backend endpoint and surface it as a CRUD feature in the UI. Look at: where domain types live, how API/data wiring is registered, where routes/resources are declared, the per-feature folder shape, and any translation/i18n step. Output: a numbered markdown checklist of 5-10 concrete steps with paths from THIS codebase. Skip patterns from libraries the codebase does not import.",
  },
  {
    filename: "patterns/shared-components.md",
    instruction:
      "Find: which shared/common UI components exist, where they live, and how they are imported. Output: a markdown reference listing the most commonly-used shared components with their import paths and a one-line purpose for each. If no shared component library exists, return \"FALLBACK\".",
  },
  {
    filename: "patterns/testing.md",
    instruction:
      "Find: the test framework in use, the testing-library setup if any, file-naming convention for tests (*.test.tsx vs __tests__/), and a representative test for a component or hook. Output: a markdown reference with the conventions and one short canonical example. If no tests exist yet, return \"FALLBACK\".",
  },
  {
    filename: "conventions/file-layout.md",
    instruction:
      "Find: the directory structure under each app, where features live, where shared code lives, where tests live. Output: a markdown reference describing this codebase's layout conventions, with a tree-style example for a representative feature. Always derivable, never FALLBACK.",
  },
  {
    filename: "conventions/data-fetching.md",
    instruction:
      "Find: how this codebase fetches data — query libraries (TanStack Query, SWR, RTK Query, react-admin data provider, fetch wrappers), where API clients live, how loading/error states are handled. Output: short reference doc explaining the pattern with an example call site. If the codebase is greenfield with no data fetching yet, return \"FALLBACK\".",
  },
];

const BACKEND_DISCOVERIES = [
  {
    filename: "patterns/handlers.md",
    instruction:
      "Find: where request handlers / controllers / endpoints live, the naming convention, the dispatch pattern (MediatR / minimal APIs / controller actions), and a representative example. Output: a markdown reference with concrete file paths and one short example.",
  },
  {
    filename: "patterns/di-registration.md",
    instruction:
      "Find: how services are registered in dependency injection — which method, which file, which lifetime defaults. Output: a markdown reference with concrete examples from the codebase.",
  },
  {
    filename: "patterns/migrations.md",
    instruction:
      "Find: the migration tool (Flyway, EF Core migrations, Fluent Migrator), version-numbering convention, file location, and a representative example. Output: a markdown reference with concrete steps for adding a new migration. If no migrations have been added yet, return \"FALLBACK\".",
  },
  {
    filename: "patterns/integration-tests.md",
    instruction:
      "Find: the integration test framework, where test fixtures live, how the test database is set up/torn down, and a representative test. Output: a markdown reference with concrete paths and a short example. If no integration tests exist, return \"FALLBACK\".",
  },
  {
    filename: "conventions/project-layout.md",
    instruction:
      "Find: the .NET project structure (Api / Application / Domain / Infrastructure layering, or vertical-slice, etc.), which projects depend on which, and where each layer's code lives. Output: a markdown reference describing the layering with a tree of the src/ directory.",
  },
];
```

- [ ] **Step 4: Add the new lists to module.exports**

At the bottom of the file, update the exports block. Replace whatever is currently there with:
```js
module.exports = {
  runDiscovery,
  checkClaudeInstalled,
  buildPrompt,
  parseSectionMap,
  tryParseEnvelope,
  extractJsonObject,
  summarize,
  FRONTEND_DISCOVERIES,
  BACKEND_DISCOVERIES,
};
```

- [ ] **Step 5: Verify discover.js parses cleanly**

```bash
node --check lib/discover.js
```
Expected: no output.

- [ ] **Step 6: Verify the orphan tag helpers are gone**

```bash
grep -nE "collectDiscoverTags|walkTags|dedupeTags" lib/discover.js
```
Expected: no matches.

- [ ] **Step 7: Smoke test — dump the discovery lists**

```bash
node -e "
const d = require('./lib/discover');
console.log('frontend lists:', d.FRONTEND_DISCOVERIES.length);
console.log('backend lists:', d.BACKEND_DISCOVERIES.length);
"
```
Expected output:
```
frontend lists: 8
backend lists: 5
```

- [ ] **Step 8: Commit**

```bash
git add lib/discover.js
git -c commit.gpgsign=false commit -m "feat(discover): add static FRONTEND_DISCOVERIES and BACKEND_DISCOVERIES lists

Replaces the section-level walk-templates-for-tags approach with a
static per-stack list of {filename, instruction} pairs. Drops the now-
unused walkTags/dedupeTags/collectDiscoverTags imports.

Frontend list: 8 entries (patterns/* + conventions/*).
Backend list:  5 entries (patterns/* + conventions/project-layout).
"
```

---

## Task 6: Refactor `runDiscovery` to write files instead of returning a map

**Files:**
- Modify: `lib/discover.js` (`runDiscovery`, `summarize`, add `writeDerivedReferences`)

- [ ] **Step 1: Update the prompt builder for the new contract**

The existing `buildPrompt` already iterates over an array of `{sectionId, instruction}`. Update it so the keys are filenames, not section ids. Replace the body of `buildPrompt({ tags, cwd, stack, apps })` — rename parameter `tags` to `entries` for clarity:

```js
function buildPrompt({ entries, cwd, stack, apps }) {
  const sections = entries
    .map((e) => `[${e.filename}]\n${e.instruction}`)
    .join("\n\n");

  const stackLabel = Array.isArray(stack) ? stack.join(" + ") : stack;
  const appsLine =
    apps && apps.length
      ? apps.map((a) => `${a.name} at ${a.path}`).join(", ")
      : "(detected from cwd)";

  return [
    `You are scanning a ${stackLabel} codebase to derive project-specific implementation patterns.`,
    ``,
    `Repository root: ${cwd}`,
    `Detected stack:  ${stackLabel}`,
    `Apps to cover:   ${appsLine}`,
    ``,
    `For each filename below, read the relevant code and return a JSON`,
    `object mapping filename → derived markdown content. If you cannot`,
    `find sufficient examples in the codebase to derive a section,`,
    `return the literal string "FALLBACK" for that filename.`,
    ``,
    `Output ONLY a JSON object. No prose, no code fences, no commentary.`,
    `Keys are filenames (may include subdirectories like "patterns/forms.md");`,
    `values are markdown strings or "FALLBACK".`,
    ``,
    `Sections to derive:`,
    ``,
    sections,
  ].join("\n");
}
```

- [ ] **Step 2: Update parseSectionMap for the filename-keyed contract**

The function name is fine; just confirm it expects `expectedIds` to be filenames now (no code change needed — it's already opaque to what the keys mean). Skip if no change is required.

- [ ] **Step 3: Add `writeDerivedReferences` helper**

Add this function to `lib/discover.js` (above `runDiscovery`):

```js
function writeDerivedReferences(skillDir, map) {
  const written = [];
  const fallback = [];
  const referencesDir = path.join(skillDir, "references");
  for (const [filename, value] of Object.entries(map)) {
    if (typeof value !== "string" || value === "FALLBACK" || value.trim() === "") {
      fallback.push(filename);
      continue;
    }
    const dest = path.join(referencesDir, filename);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, value.endsWith("\n") ? value : value + "\n");
    written.push(filename);
  }
  return { written, fallback };
}
```

- [ ] **Step 4: Rewrite `runDiscovery` for the new contract**

Replace the entire current `runDiscovery` function with:

```js
async function runDiscovery({ stacks, projectRoot, skillDir, apps, log }) {
  if (!checkClaudeInstalled()) return { ok: false, reason: "no-claude" };

  // Compose the active discovery list per stack.
  const entries = [];
  if (stacks.includes("frontend")) entries.push(...FRONTEND_DISCOVERIES);
  if (stacks.includes("backend")) entries.push(...BACKEND_DISCOVERIES);
  if (entries.length === 0) return { ok: false, reason: "no-entries" };

  log && log(`Will derive up to ${entries.length} reference file(s).`);

  const prompt = buildPrompt({ entries, cwd: projectRoot, stack: stacks, apps });
  const spawned = spawnClaude(prompt, log);
  if (!spawned.ok) {
    const logPath = writeDebugLog(projectRoot, spawned.stdout || "", spawned.stderr || "");
    return { ok: false, reason: spawned.reason, logPath, stderr: spawned.stderr };
  }

  const env = tryParseEnvelope(spawned.stdout);
  if (!env.ok) {
    const logPath = writeDebugLog(projectRoot, spawned.stdout, "");
    return { ok: false, reason: env.reason, logPath };
  }

  const expectedIds = entries.map((e) => e.filename);
  const parsed = parseSectionMap(env.text, expectedIds);
  if (!parsed.ok) {
    const logPath = writeDebugLog(projectRoot, spawned.stdout, env.text);
    return { ok: false, reason: parsed.reason, logPath };
  }

  const { written, fallback } = writeDerivedReferences(skillDir, parsed.map);
  return { ok: true, written, fallback, total: entries.length };
}
```

- [ ] **Step 5: Update `summarize` to match the new shape**

Replace the function body with:

```js
function summarize(result) {
  return {
    derived: result.written || [],
    fallback: result.fallback || [],
    total: result.total || 0,
  };
}
```

- [ ] **Step 6: Update module.exports**

Replace the exports with:
```js
module.exports = {
  runDiscovery,
  checkClaudeInstalled,
  buildPrompt,
  parseSectionMap,
  tryParseEnvelope,
  extractJsonObject,
  writeDerivedReferences,
  summarize,
  FRONTEND_DISCOVERIES,
  BACKEND_DISCOVERIES,
};
```

- [ ] **Step 7: Verify parses cleanly**

```bash
node --check lib/discover.js
```
Expected: no output.

- [ ] **Step 8: Smoke test `writeDerivedReferences` in isolation**

```bash
node -e '
const fs = require("fs");
const path = require("path");
const { writeDerivedReferences } = require("./lib/discover");
const tmp = fs.mkdtempSync("/tmp/abdisc-");
const map = {
  "patterns/list-pages.md": "# Lists\n\nfoo bar baz",
  "patterns/forms.md":      "FALLBACK",
  "conventions/file-layout.md": "# Layout\n\nstuff",
};
const r = writeDerivedReferences(tmp, map);
console.log("written:", r.written);
console.log("fallback:", r.fallback);
console.log("contents of " + tmp + "/references:");
const out = require("child_process").execSync("find " + tmp + "/references -type f").toString();
console.log(out);
require("fs").rmSync(tmp, { recursive: true });
'
```
Expected output:
```
written: [ 'patterns/list-pages.md', 'conventions/file-layout.md' ]
fallback: [ 'patterns/forms.md' ]
contents of /tmp/abdisc-XXXXXX/references:
/tmp/abdisc-XXXXXX/references/patterns/list-pages.md
/tmp/abdisc-XXXXXX/references/conventions/file-layout.md
```
(no `forms.md` file, fallback is correctly skipped, subdirectories created.)

- [ ] **Step 9: Commit**

```bash
git add lib/discover.js
git -c commit.gpgsign=false commit -m "refactor(discover): file-level discovery — write files instead of returning a map

runDiscovery now spawns claude once with a filename-keyed prompt and
writes each non-FALLBACK entry as a literal file under <skillDir>/references/.
Subdirectories (patterns/, conventions/) are created on demand.

Drops the section-level map contract. The summary now reports written/
fallback filenames; mid-run failures still log to .claude/agent-bootstrap-discovery.log
and return a sentinel reason without aborting the install.
"
```

---

## Task 7: Reorder Pass 4 in bin/bootstrap.js

**Files:**
- Modify: `bin/bootstrap.js`

- [ ] **Step 1: Locate and adapt the `runPatternDiscovery` helper in bin/bootstrap.js**

Find the existing `runPatternDiscovery({ cwd, stacks, fe, be })` function. Replace its body with the version that targets a resolved skill dir:

```js
async function runPatternDiscovery({ cwd, stacks, resolvedSkillDir, fe, be }) {
  log("\n── Pattern Discovery (required) ──");
  log("This scans your codebase using `claude` (read-only: Read/Glob/Grep)");
  log("to derive project-specific reference docs into the installed skill.");
  log("");
  log("  Estimated:   30–90 seconds, ~5–20K tokens");
  log("  Cost:        billed against your existing Claude Code session");

  const yes = await prompts.confirm("Run pattern discovery?", true);
  if (!yes) micDropAndExit();

  const result = await runDiscovery({
    stacks,
    projectRoot: cwd,
    skillDir: resolvedSkillDir,
    apps: fe ? fe.apps : be ? [{ name: be.projectName, path: be.srcPath }] : [],
    log,
  });

  if (!result.ok) {
    if (result.reason === "no-claude") {
      err("\nclaude CLI not found on PATH.");
      micDropAndExit();
    }
    if (result.reason === "no-entries") {
      log("(no discovery entries for selected stacks — skipping)");
      return;
    }
    err(`\nDiscovery failed: ${result.reason}`);
    if (result.logPath) err(`See ${result.logPath} for details.`);
    if (result.stderr) err(result.stderr.split("\n").slice(0, 10).join("\n"));
    log("\nProceeding with empty references/ — agents will read the codebase directly.");
    return;
  }

  const { derived, fallback, total } = summarize(result);
  log(`\n── Pattern Discovery — results ──`);
  for (const f of derived) log(`  ✓ ${f}  (derived)`);
  for (const f of fallback) log(`  ⚠ ${f}  (fallback — no file written)`);
  log(`\nWrote ${derived.length}/${total} reference file(s) into ${resolvedSkillDir}/references/.`);
}
```

- [ ] **Step 2: Move the discovery call into the install flow**

Find the `if (fe) { ... }` block in `main()`. The existing structure calls `runPatternDiscovery` BEFORE `installSkill`. Move it AFTER. The pattern is:

```js
  if (fe) {
    const cfg = frontendConfig(fe, integrations, projectName);
    log("\n── Installing frontend skill ──");
    const main = await installSkill({
      projectRoot: cwd,
      templateDir: path.join(TEMPLATES, "frontend", "implement-app"),
      skillName: "implement-app",
      config: cfg,
      prompts,
      log,
    });
    installed.push(`.claude/skills/${main.skillName}`);

    // NEW: discovery runs after the kernel is in place, targeting the resolved skill dir.
    await runPatternDiscovery({
      cwd,
      stacks: ["frontend"],
      resolvedSkillDir: main.target,
      fe,
    });

    for (const sub of ["jira-tracking", "create-pull-request", "sonar-fix"]) {
      // ...existing support-skill installs (no discoveryMap parameter anymore)...
    }
  }
```

Apply the same change inside the `if (be) { ... }` block, with `stacks: ["backend"]` and `be` instead of `fe`. Skip the call if there's no kernel (only `fe` and `be` cases trigger discovery; never both stacks combined into one call — each kernel has its own `references/`).

- [ ] **Step 3: Remove the previous early discovery call site**

Find and DELETE the section in `main()` that previously called `runPatternDiscovery` before `installSkill`. It looks something like:

```js
  // Pass 4 — Pattern Discovery (mandatory: hard exit if claude is missing or
  // the user declines).
  const discoveryMap = await runPatternDiscovery({
    cwd,
    stacks,
    fe,
    be,
  });
```
Delete the entire block including the variable. Discovery is now invoked per-stack inside the install branches.

- [ ] **Step 4: Remove the `discoveryMap` parameter from all `installSkill` callsites**

In `bin/bootstrap.js`, every `installSkill({ ..., discoveryMap })` should drop the parameter. Search:
```bash
grep -n "discoveryMap" bin/bootstrap.js
```
Expected after the edit: no matches.

- [ ] **Step 5: Verify bootstrap.js parses cleanly**

```bash
node --check bin/bootstrap.js
```
Expected: no output.

- [ ] **Step 6: Verify no orphan references**

```bash
grep -n "templatesToInstall\|discoveryMap" bin/bootstrap.js
```
Expected: no matches (these were old-design vocabulary).

- [ ] **Step 7: Smoke test the no-claude path**

```bash
NODE_BIN=$(which node)
SHIM=$(mktemp -d) && ln -s "$NODE_BIN" "$SHIM/node"
TMP=$(mktemp -d) && cd "$TMP"
cat > package.json <<'EOF'
{"name":"smoke","version":"0.0.0","scripts":{"dev":"vite --port 5173"},"dependencies":{"react":"^18","react-admin":"^4"}}
EOF
touch package-lock.json
( yes "" | head -50 | timeout 30 env PATH="/usr/bin:/bin:$SHIM" "$NODE_BIN" /home/sijan/personal/frontend-agent-orchestrator/bin/bootstrap.js 2>&1 ; echo "EXIT=$?" ) | tail -10
rm -rf "$TMP" "$SHIM"
cd /home/sijan/personal/frontend-agent-orchestrator
```

Expected output (last lines):
```
── Installing frontend skill ──
  installed implement-app (N files)
...
── Pattern Discovery (required) ──
...
Run pattern discovery? [Y/n]
claude CLI not found on PATH.

your loss! mic drop. bye
EXIT=2
```

(The exit happens after the kernel is installed, which is acceptable per the spec — the kernel is genuinely installed, but discovery ran and aborted. The user can re-run with `claude` on PATH to populate `references/`.)

- [ ] **Step 8: Commit**

```bash
git add bin/bootstrap.js
git -c commit.gpgsign=false commit -m "refactor(bootstrap): move Pass 4 to after kernel install; per-stack discovery

Pattern discovery now runs once per orchestrator install, targeting the
resolved skill dir (which may have been renamed via rename-on-conflict).
The previous pre-install single discovery call is removed.

Each installed kernel gets its own references/ populated independently;
mixed monorepos run discovery twice (once per stack). The summary
reports per-file derived/fallback counts and the destination dir.

Mic-drop semantics preserved (no claude / decline → exit 2).
"
```

---

## Task 8: Update README.md and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Find the EDIT-ME wording in README.md**

```bash
grep -nE "EDIT-ME|starter references|React-Admin|OData" README.md
```
Expected: line numbers.

- [ ] **Step 2: Rewrite the relevant README sections**

Find the section describing what gets installed (likely under a "What it installs" heading). Update wording to drop the "EDIT-ME starter references" framing. Replace any sentence resembling:

> *"The architecture reference docs (`references/arch-*.md`) ship with EDIT-ME headers — they are starter patterns derived from a React-Admin + OData project; replace the contents with your stack's conventions."*

with:

> *"The skill ships methodology only — gates, personas, Jira protocol, TDD discipline. Project-specific patterns (file layouts, data-fetching, list/form/detail conventions, test idioms) are derived at install time by `claude` reading your codebase, and written into `.claude/skills/implement-app/references/`. If discovery is declined, the `references/` directory is empty and agents read your code directly when they need to. No React-Admin or OData idioms ship in this package."*

- [ ] **Step 3: Verify README is consistent**

```bash
grep -ncE "EDIT-ME|starter references" README.md
```
Expected: `0`.

- [ ] **Step 4: Update CLAUDE.md**

```bash
grep -nE "EDIT-ME|starter references|`<!-- DISCOVER" CLAUDE.md
```
Expected: line numbers.

Update those sections similarly. The "Source of Truth" table row for `templates/frontend/implement-app/` should drop the "Inspector Clouseau, EDIT-ME references" wording. The DISCOVER tag mention (if present) should be replaced with a description of the file-level discovery in `lib/discover.js`.

- [ ] **Step 5: Verify CLAUDE.md is consistent**

```bash
grep -ncE "EDIT-ME|starter references|<!-- DISCOVER" CLAUDE.md
```
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add README.md CLAUDE.md
git -c commit.gpgsign=false commit -m "docs: align README and CLAUDE.md with methodology-kernel architecture

Drops 'EDIT-ME starter references' framing. Describes the kernel +
install-time discovery + empty references/ on decline model. Removes
references to the section-level DISCOVER tag mechanism.
"
```

---

## Task 9: Smoke-test the full path with claude available

**Files:** none modified — verification only.

- [ ] **Step 1: Confirm claude is reachable**

```bash
which claude && claude --version 2>&1 | head -1
```
Expected: a path and a version line.

- [ ] **Step 2: Run the CLI end-to-end against a temp React project**

```bash
TMP=$(mktemp -d) && cd "$TMP"
cat > package.json <<'EOF'
{
  "name":"smoke-kernel",
  "version":"0.0.0",
  "scripts":{"dev":"vite --port 5173","build":"vite build","test":"vitest"},
  "dependencies":{"react":"^18.2.0","react-dom":"^18.2.0"},
  "devDependencies":{"vite":"^5","vitest":"^1"}
}
EOF
touch package-lock.json
mkdir -p src && cat > src/App.tsx <<'EOF'
import React from "react";
export default function App() { return <div>hello</div>; }
EOF

# Decline integrations to keep the smoke quick; accept discovery.
printf 'n\nn\nn\nn\n\ny\n' | timeout 180 node /home/sijan/personal/frontend-agent-orchestrator/bin/bootstrap.js 2>&1 | tail -40
echo "--- EXIT=$? ---"
echo "--- references/ contents ---"
find "$TMP/.claude/skills/implement-app/references" -type f 2>/dev/null
echo "--- check for Flow24 leakage ---"
grep -rilE "Resources\.|ListPageContainer|operationCountry|@flow24|RT24|apphuset" "$TMP/.claude" 2>/dev/null && echo "LEAK FOUND" || echo "clean"
cd /home/sijan/personal/frontend-agent-orchestrator
rm -rf "$TMP"
```

Expected:
- The CLI runs to completion, exit 0.
- `references/` has at least `conventions/file-layout.md` (the spec says always derivable). Other files may or may not appear depending on what Claude found in the minimal project.
- The "clean" line prints (no Flow24 leakage in any installed file).
- Discovery summary is printed (`✓ filename (derived)` and/or `⚠ filename (fallback — no file written)`).

- [ ] **Step 3: Verify the kernel itself is clean**

```bash
grep -rilE "Resources\.|ListPageContainer|operationCountry|@flow24|RT24|apphuset|7peakssoftware|ICPlan|BackOffice|FieldEmployee|App Parameter Table" templates/ 2>/dev/null
```
Expected: no matches (no leakage in shipped templates either).

- [ ] **Step 4: Verify the SKILL.md description was updated**

```bash
head -8 templates/frontend/implement-app/SKILL.md | grep -E "react-admin|React-Admin|Admin, Employee" && echo "OLD DESCRIPTION REMAINS" || echo "description clean"
head -8 templates/backend/implement-backend/SKILL.md | grep -E "BackOffice.*FieldEmployee|3 API surface" && echo "OLD DESCRIPTION REMAINS" || echo "description clean"
```
Expected: two "description clean" lines.

- [ ] **Step 5: Verify no automated-test-suite regressions in lib/**

```bash
node -e "
const s = require('./lib/substitute');
const d = require('./lib/discover');
const i = require('./lib/install');

// substitute exports
if (typeof s.render !== 'function') throw new Error('render missing');
if (s.renderDiscoverTags) throw new Error('renderDiscoverTags should be removed');

// discover exports
if (typeof d.runDiscovery !== 'function') throw new Error('runDiscovery missing');
if (!Array.isArray(d.FRONTEND_DISCOVERIES)) throw new Error('FRONTEND_DISCOVERIES missing');
if (!Array.isArray(d.BACKEND_DISCOVERIES)) throw new Error('BACKEND_DISCOVERIES missing');
if (typeof d.writeDerivedReferences !== 'function') throw new Error('writeDerivedReferences missing');
if (d.walkTags) throw new Error('walkTags should be removed');

// install exports
if (typeof i.installSkill !== 'function') throw new Error('installSkill missing');

console.log('all module exports OK');
"
```
Expected: `all module exports OK`.

- [ ] **Step 6: No commit needed (verification only)**

If all six steps above pass, proceed to Task 10.
If any fail, fix the offending Task before continuing — do NOT commit broken state.

---

## Task 10: Push the redesign

**Files:** none — push only.

- [ ] **Step 1: Confirm a clean working tree**

```bash
git status --short
```
Expected: empty (everything committed in Tasks 1–8).

- [ ] **Step 2: Review the commit log for the redesign**

```bash
git log --oneline -10
```
Expected: at least 7 new commits (Tasks 1, 2, 3, 4, 5, 6, 7, 8).

- [ ] **Step 3: Push**

```bash
git push 2>&1 | tail -3
```
Expected: a successful push to `origin/main`.

- [ ] **Step 4: Confirm push by spot-checking GitHub**

Either visit `https://github.com/sidzan/agent-orchestrator` in a browser or:
```bash
git ls-remote origin main
```
The hash returned should match local `git rev-parse HEAD`.

- [ ] **Step 5: Tell the user how to test on their machine**

Print or share:

```
Redesign pushed. To re-test on your target repo:

  rm -rf .claude .mcp.json.example ~/.npm/_npx/*/node_modules/agent-bootstrap
  npx -p github:sidzan/agent-orchestrator -- agent-bootstrap

You'll see the kernel install, then a Pattern Discovery prompt.
Press Enter to scan; the references/ directory will be populated
with patterns derived from YOUR codebase. No Flow24 / React-Admin
idioms will appear in any installed file.

Decline discovery or run on a machine without `claude` and the CLI
exits with "your loss! mic drop. bye". The kernel install up to
that point is left in place; references/ is empty.
```

---

## Notes for the implementer

- Each task is a single commit. Don't squash.
- Verification commands in the smoke tests are intentionally specific — run them as-is, don't approximate.
- If grep "expected: 0" actually returns a hit, **stop and investigate** — don't skip ahead.
- The persona stripping in Task 3 Step 8 and Task 4 Step 6 is hand-edit territory; if a file feels too project-specific to salvage, replace its body with a 5-line stub describing the persona role and gate ownership rather than half-cleaning it.
- The smoke test in Task 9 will actually invoke Claude (10–60 seconds, real tokens). Run it once, not in a loop.
