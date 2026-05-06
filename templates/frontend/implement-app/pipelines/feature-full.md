# Feature / Full Pipeline

Read this file after routing to feature/full mode.

**Note:** Where this file says `model: sonnet`, that resolves to **Opus 4.7** in the current environment. Sonnet tier is unchanged.

## Model Tier Strategy

| Role | Model | Rationale |
|------|-------|-----------|
| Team Lead | opus (Opus 4.7, inherited) | Coordination, synthesis, judgment |
| DM-1 (scope) | sonnet | Simple classification |
| DM-2 (plan review) | **opus (Opus 4.7)** | Gate decision, high blast radius |
| Explorer | sonnet | File reading + reporting |
| Eng Reviewer | sonnet | Design review, pattern matching |
| Implementers | sonnet | Code gen from detailed specs |
| Test Writers | sonnet | Test writing from patterns |
| Verifier | sonnet | Run checks, fix issues |
| Browser QA | sonnet | Browser interaction |
| Jira Scribe (jira-runner) | **haiku** | Templated MCP round-trips — keeps Jira mirroring off the Opus budget |

## Jira Mirror — MANDATORY at every gate (unless `<JIRA_KEY> = NONE`)

After every F-step below completes its gate, the team lead **drafts** the body from the per-gate template and **spawns `@jira-runner` via the Agent tool with `model: "haiku"`** to post the `Automated update>` checkpoint on `<JIRA_KEY>`. The team lead never calls `Skill jira-tracking` inline and never invokes `mcp__claude_ai_Atlassian__*` directly — see `teams/jira-runner.md` for the Scribe's payload envelopes. Mid-pipeline comments use `run_in_background: true`; only the G0 verify/create blocks. Mapping:

| Step | Gate | jira-tracking subject |
|------|------|----------------------|
| F1 | G0 | `ticket-created` / `pipeline-resumed` |
| F2 | G0.5 | `G0.5 DM-1` |
| F3 | G1 | `G1 Explore` |
| F3.5 | G1.5 | `G1.5 ADR` (only if triggered; skipped otherwise) |
| F4 | G2 | `G2 FEAT` |
| F5 | G3 | `G3 EngReview` (paste dimensions block) |
| F6 | G4 | `G4 SPEC` |
| F7 | G4.5 | `G4.5 DM-2` |
| F8 | G5 | `G5 Impl` |
| F9 | G6 | `G6 Tests` |
| F10 | G7 | `G7 Verify` (paste Health Score incl. FILE_SIZE + TEST_COEXISTENCE) |
| F11 | G8 | `G8 BrowserQA` |
| F12 | G9 | `G9 Knowledge` |
| F13 | G10 | `G10 PR` (include PR URL) |

On BLOCK/retry, additionally spawn `@jira-runner` (model: haiku) with a `blocker` or `revision` payload (Payload D in `teams/jira-runner.md`). A `FAILED:` return from the Scribe → log to TASK.md Blockers and continue.

## F1: Create Team

TeamCreate — team name: `<APP>-<short-feature-name>`
Print: `Team created.`

Verify `<JIRA_KEY>` is resolved (set at Step 0.a.i). If not yet, go back to Step 0.a.i — resolving the key happens there via `@jira-runner`, not here.

After team creation, spawn `@jira-runner` via the Agent tool with `model: "haiku"` and Payload A (`MODE: verify-and-resume`) or — if the ticket was just created at Step 0.a.i — rely on the `ticket-created` comment the Scribe already posted. Do NOT invoke `Skill jira-tracking` inline.

## F2: Decision Maker — DM-1 (Gate G0.5)

Spawn @the-oracle using Agent tool (model: sonnet):
> "Read `teams/decision-maker.md`. Request: <USER_REQUEST>. Ticket: <JIRA_ID if given>. Run DM-1 assessment."

Read SCOPE output:
- SCOPE=Clear → proceed
- SCOPE=Unclear + QUESTION → ask user, wait, proceed
- SCOPE=Risky → flag risk, ask "Still want to proceed?"
- SCOPE=Reconsider → explain alternative, user decides. If user says stop: STOP.

Log DM-1 row to TASK.md Decision Maker Results table.
**Gate G0.5:** SCOPE must not be Reconsider (or user confirmed proceed).

## F3: Explorer (Gate G1)

Spawn @indiana using Agent tool (model: sonnet):
> "Read `CLAUDE.md`, then `teams/explorer.md`. Explore codebase for: <REQUEST>. Produce the Exploration Passport. Create TASK.md at project root using `references/task-tracking.md`."

Validate: all 9 Exploration Passport fields filled.
**Gate G1:** If any field empty → BLOCK, re-ask explorer.

## F3.5: ADR — Architecture Decision Record (Gate G1.5, OPTIONAL)

**Trigger this gate if ANY of the following is true after F3:**
- DM-1 returned SCOPE=Risky.
- The Exploration Passport reveals the feature requires a new integration, a new data pattern, a new auth flow, or any decision that changes how the system is structured (not just how a feature is implemented).
- Gordon (F5) would likely flag "new pattern introduced without documented rationale."

**If NONE of the above:** say aloud `No significant architectural decision detected — skipping ADR (G1.5)` and advance to F4.

**When triggered:** Team lead drafts an ADR following this format and saves it to `docs/architecture/decisions/ADR-NNN-<slug>.md` (check the directory for the next number):

```markdown
# ADR-NNN: <Title>

## Status
Proposed

## Context
<What problem or constraint makes this decision necessary>

## Decision
<What we decided to do>

## Alternatives Considered
- <Alternative A> — rejected because <reason>
- <Alternative B> — rejected because <reason>

## Consequences
- <Trade-off or impact>
```

After writing:
- Verify file exists at `docs/architecture/decisions/ADR-NNN-<slug>.md`.
- Record the path in TASK.md Metadata as `ADR:`.
- Spawn `@jira-runner` (model: haiku, background) with `G1.5 ADR` subject.

**Gate G1.5:** ADR file exists at the correct path (or explicitly skipped with announcement).

## F4: FEAT Document (Gate G2) — MANDATORY, NO SUBSTITUTES

> **What is a FEAT?** The Feature Document is the bridge between business requirements (PRD / Jira ticket) and technical implementation. It captures: user flows, business rules, acceptance criteria, and UI surface. It is what Indiana's exploration makes possible to write with precision.

**Hard rule:** This gate fires even if you already ran Step 0.a.ii PRD step. The PRD validates intent; the FEAT validates design given what the explorer found. Two different gates, two different outputs, both required.

**Announce out loud before spawning:** `Entering F4 FEAT design — invoking superpowers:brainstorming with Passport findings.`

REQUIRED: Invoke `superpowers:brainstorming` skill with:
- The feature request + PRD context (Jira ticket ACs if available)
- Explorer Passport findings (summarise the full Passport, not just the headline)
- Existing patterns from `references/arch-*.md` relevant to the feature
- ADR link (if G1.5 produced one)
- Override: save the FEAT document to `docs/plans/YYYY-MM-DD-HHMM-feat-<slug>.md` (NOT the brainstorming skill's default `docs/superpowers/specs/...`). State this override in the first message to the brainstorming skill.

After brainstorm completes:
- Verify the FEAT file exists on disk at `docs/plans/YYYY-MM-DD-HHMM-feat-<slug>.md`.
- Verify it includes a **Business Rules** section with bullet-level rules, not "TBD".
- Verify it includes **Acceptance Criteria** (observable, testable from a user perspective).
- Record the full path in TASK.md Metadata as `FEAT doc:`.

**Gate G2 passes only if:**
- File exists at the expected path (re-check with `ls docs/plans/` — do not trust a claim without verification).
- Business Rules section is populated.
- Acceptance Criteria section is populated.
- User has explicitly approved the FEAT during the brainstorming session (per brainstorming skill's HARD-GATE).

**Gate G2 FAILS (block and re-run) if any of the following rationalizations surface:**
- "Exploration was thorough, the FEAT is obvious, skip brainstorming" → false, re-enter F4.
- "I'll write the FEAT directly without the brainstorming skill" → false, the skill's dialogue is the gate, not the doc template.
- "The FEAT can live inline in TASK.md" → false, a separate file is the artifact.

For UI features (Has UI = YES in Passport): during brainstorming, ask "Do you want UI mockups?" and invoke design tools if yes.

Fill TASK.md Design Decisions table from the finalized FEAT doc.

## F5: Eng Review (Gate G3)

Spawn @gordon using Agent tool (model: sonnet):
> "Read `teams/eng-reviewer.md` and `references/arch-*.md`. Review this FEAT document: <FEAT_DOC_PATH>. Has UI: <YES/NO from Passport>. Business Rules from the FEAT: <BULLETS>. ADR: <ADR_PATH or NONE>. Think carefully and step-by-step before APPROVE/BLOCK — this gate has high blast radius; a rubber-stamped APPROVE costs a full re-review cycle downstream."

If BLOCK: fix FEAT doc, respawn (max 2 re-submits). Log to TASK.md Review Results.
**Gate G3:** Eng Review = APPROVE before writing SPEC.

## F6: Write SPEC — Technical Specification (Gate G4)

> **What is a SPEC?** The Technical Specification is the implementation contract: file layout, component breakdown, data flow, task list. It translates the FEAT's acceptance criteria into exact files, functions, and sequences that sheep will implement.

REQUIRED: Invoke `superpowers:writing-plans` skill.

**SPEC path override (MANDATORY):** In the first message to the writing-plans skill, state: *"Save the SPEC to `docs/plans/YYYY-MM-DD-HHMM-spec-<slug>.md` — this project's override supersedes the default `docs/superpowers/plans/` location."* Use the same `YYYY-MM-DD-HHMM` stamp throughout the run (take it once at Step 0.a.ii or F1 and reuse). `<slug>` = Jira key + short kebab description.

**SPEC output MUST include a "File Layout" table** with, for each new file: path, role (ui / hook / service / test), projected line count. Any row projecting > 250 lines is automatically decomposed in the SPEC into sub-files before G4 is passed. Every non-test source-file row MUST have a corresponding test-file row in the table. This pre-decomposition prevents @sheep from ever needing to split mid-implementation.

**SPEC header MUST include the executing-plans directive** (the writing-plans skill does this automatically via its "Plan Document Header" template — don't strip it). Sheep rely on that directive to know which skill to invoke.

After SPEC written:
- Verify the file exists at `docs/plans/YYYY-MM-DD-HHMM-spec-<slug>.md` (`ls` it, don't trust).
- Record the full path in TASK.md Metadata as `SPEC:`.
- Populate TASK.md Implementation and Testing checklists from the File Layout — one IMP per source file, one TST per test file.

**Gate G4:** SPEC file exists at the correct path + File Layout table present + TASK.md populated with matching IMP + TST pairs + TASK.md Metadata `SPEC:` recorded.

## F7: Decision Maker — DM-2 (Gate G4.5)

Spawn @the-oracle using Agent tool (model: opus):
> "Read `teams/decision-maker.md`. Request: <USER_REQUEST>. Plan: <PLAN_PATH>. Ticket: <JIRA_ID if given>. Eng Review findings: <GORDON_VERDICT_AND_FINDINGS>. Run DM-2 review. Think carefully and step-by-step — this is the final gate before implementation and has the highest blast radius in the pipeline."

If VERDICT=REVISE: fix identified plan sections. Re-spawn DM-2 (max 1 revision). Log to TASK.md.
**Gate G4.5:** VERDICT = PROCEED before spawning implementers.

## F8: Implementation (Gate G5)

Before spawning: write file ownership to TASK.md. Designate a single owner for each ALWAYS-SHARED FILE (see `teams/implementer.md`).

**Fan-out criterion (be judicious — Opus 4.7 is good at one-shot work):**
- Count the IMP tasks and the files they touch.
- Spawn parallel sheep (`sheep-1`, `sheep-2`, …) ONLY when tasks hit **disjoint files** AND there are ≥3 IMP tasks total.
- If tasks touch overlapping files, share state, or number ≤2: spawn a **single** `sheep-1` and let it execute them sequentially. One capable agent finishes faster than a coordination dance between two.

**Plan-execution contract (MANDATORY in every sheep spawn prompt):** Each sheep invokes `superpowers:executing-plans` against the plan file. The team lead does NOT invoke that skill itself at this step — the sheep does, inside its own session. This is how the bite-sized step discipline, TodoWrite mirror, and stop-on-blocker behavior propagate to the agent that's actually writing code.

Spawn implementer(s) using Agent tool (model: sonnet, run_in_background: true):
> "Read `CLAUDE.md`, then `teams/implementer.md`. Your assigned IMP tasks: <ASSIGNED_TASK_IDS>. Explorer findings: <PASSPORT_SUMMARY>. File ownership: <OWNERSHIP_TABLE>.
>
> **SPEC-execution contract (FIRST ACTION):** invoke `Skill superpowers:executing-plans` with the SPEC at `<SPEC_PATH>` (absolute path). Follow that skill's process exactly: load the SPEC, review it critically against the FEAT doc at `<FEAT_DOC_PATH>`, raise concerns before starting, create TodoWrite entries mirroring the SPEC's bite-sized steps for YOUR assigned IMP tasks only, then execute step-by-step. Stop and report back if you hit a blocker. Do NOT free-form a different ordering — the SPEC is the contract.
>
> **Size + test-coexistence contract (NO COMMANDS — sheep-specific):** every non-test source file you touch MUST stay at or below its hard cap (300 lines for UI/hook/service/config — full table in `teams/implementer.md` 'Self-Check Before Marking an IMP Task Done'). Every new non-test source file MUST have a planned co-located `*.test.*` entry in TASK.md File Layout (Pete writes the test). The plan's File Layout is binding — do not consolidate files. If a file is over cap, split NOW per the patterns in implementer.md. You check by reading line counts; you do NOT run any command. You do NOT invoke `Skill code-quality`. You do NOT run tests / typecheck / lint / build — all forbidden for sheep; Sentinel owns every audit at G7.
>
> Update TASK.md as you work (mark IMP `[~]` on start, `[x]` on done). For template-replacement work, prioritize responding quickly rather than thinking deeply — the plan's code blocks are the source of truth."

Monitor via TaskList. When ALL done:
**Gate G5:** All IMP tasks Done in TASK.md AND every sheep reported having invoked `superpowers:executing-plans` against the SPEC.

## F9: Testing (Gate G6)

**Fan-out criterion (same principle as F8):** only spawn parallel testers when test targets are independent files with no shared fixtures. Otherwise, spawn a single `paranoid-pete` to handle them sequentially.

Spawn test writer(s) using Agent tool (model: sonnet, run_in_background: true):
> "Read `teams/test-writer.md`. Write tests for: <ASSIGNED_FILES>. Files implemented by sheep: <SHEEP_SUMMARY>. Coverage threshold: ≥80% per file (full mode).
>
> **Quality contract:** before marking any TST task Done, invoke `Skill code-quality` (mode: full). `TEST_COEXISTENCE: PASS` and `COVERAGE: PASS` are required. Do not return until both are green — if `MISSING TEST:` lines appear in the Health Score, add the missing test files and re-invoke the audit."

Wait for all to complete.
**Gate G6:** All TST tasks Done in TASK.md.

## F10: Verification (Gate G7)

Spawn @sentinel using Agent tool (model: sonnet):
> "Read `teams/verifier.md`. Verify feature at the path(s) implemented by sheep (from TASK.md File Layout). Mode: full. Invoke `Skill code-quality` (inputs: `<APP>`, `<feature>`, mode=full) to run every gate — do NOT duplicate the commands yourself; that skill is the single source of truth for the rules. Paste its Health Score block verbatim. Use `teams/verifier.md` Respawn Decisions table to choose the correct agent for each failing gate. Max 3 retries per bug."

**Gate G7:** Health score OVERALL = PASS.

## F11: Browser QA (Gate G8)

Spawn @inspector-clouseau using Agent tool (model: sonnet):
> "Read `teams/browser-qa.md`. Feature path: <FEATURE_URL>. Verify feature works in browser. Report PASS or BLOCK with screenshots."

If BLOCK: respawn sheep to fix. Browser QA re-runs. On re-runs, add to the spawn prompt: *"Prioritize responding quickly — you've already characterized the feature; re-check only the specific failure paths from the previous BLOCK report."* Max 3 retries. After 3: escalate to user.
**Gate G8:** Browser QA PASS.

## F12: Knowledge Update (Gate G9 — MANDATORY)

Team lead reviews what was learned. Update:
1. `~/.claude/projects/.../memory/MEMORY.md` — new patterns, gotchas, user preferences
2. `CLAUDE.md` — new hard rules only (not obvious patterns)
3. `docs/architecture/` — new feature patterns established
4. `references/arch-*.md` — if a pattern changed or was discovered

Confirm out loud: "Reviewed learnings — [updates made / no updates needed]."
**Gate G9: CANNOT SKIP. Cannot mark complete without this confirmation.**

## F13: Finalize (Gate G10)

REQUIRED: Invoke `finalize` skill.
**Gate G10:** PR URL written to TASK.md.
