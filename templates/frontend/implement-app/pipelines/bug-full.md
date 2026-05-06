# Bug / Full Pipeline

Read this file after routing to bug/full mode.

For complex bugs: thorough diagnosis, implementation plan, full test suite, SonarQube gate.

## Model Tier Strategy

All agents use **sonnet** except Team Lead (Opus 4.7) and `@jira-runner` (**haiku**, mandatory). No DM-2 in bug pipelines.

## Jira Mirror — MANDATORY at every gate (unless `<JIRA_KEY> = NONE`)

After each B-step, the team lead **drafts** the comment body from the per-gate template and **spawns `@jira-runner` via the Agent tool with `model: "haiku"`** (Payload C `MODE: gate-comment`) to post it. Inline `Skill jira-tracking` and direct `mcp__claude_ai_Atlassian__*` calls are FORBIDDEN — see `teams/jira-runner.md`. Subjects:
- B1 → `ticket-created`/`pipeline-resumed`
- B3 Root Cause → `G1 Explore`
- B4 Fix Plan → `G4 Plan`
- B5 Impl → `G5 Impl`
- B6 Tests → `G6 Tests`
- B7 Verify → `G7 Verify` (paste Health Score)
- B8 Browser QA → `G8 BrowserQA`
- B9 Knowledge → `G9 Knowledge`
- B10 Finalize → `G10 PR`

On retry, spawn `@jira-runner` with a Payload D `blocker` / `revision` envelope. A `FAILED:` return → log to TASK.md Blockers, continue.

## B1: Create Team

TeamCreate — team name: `<APP>-bug-<short-description>`

Verify `<JIRA_KEY>` resolved at Step 0.a.i. Spawn `@jira-runner` (model: haiku) with Payload A (`MODE: verify-and-resume`) — or, if the bug report from the user was thin, draft a Gherkin bug ticket (As a / I want; Scenarios with repro steps as Given/When/Then) and spawn `@jira-runner` with Payload B (`MODE: create-and-post`). Do NOT invoke `Skill jira-tracking` inline.

## B2: Gather Repro

Ask user for repro steps, expected behavior, actual behavior. Request any logs or error messages.

## B3: Explorer — Deep Bug Mode

Spawn @indiana using Agent tool (model: sonnet):
> "Read `CLAUDE.md`, then `teams/explorer.md` — Bug Mode section. Perform deep investigation of: <DESCRIPTION>. Repro: <STEPS>. Trace all affected code paths. Produce Root Cause Report."

If Confidence = Low: ask targeted question. If Medium: ask "Do you have additional context?"
Create TASK.md with bug context.

## B3.5: Brainstorm Fix Approach (conditional — MANDATORY when triggered)

Trigger this gate if ANY of the following is true after B3:
- Root Cause Report confidence is Medium or Low.
- More than one plausible fix exists and they have different blast radius (e.g. "patch symptom" vs "fix upstream data flow" vs "rework the feature").
- The fix would touch > 1 file OR an always-shared file (Resources.ts, admin.tsx, useDataProvider.ts, translation file).
- The root cause implicates a broader architectural pattern, not a single-line oversight.

If NONE of the above: the fix is a targeted one-line/one-file patch — skip this gate and go straight to B4. Say so out loud.

When triggered, invoke `superpowers:brainstorming` with:
- Root Cause Report (full)
- Affected files + current behavior
- Regression risk surface
- Override: save the FEAT document to `docs/plans/YYYY-MM-DD-HHMM-feat-<slug>.md` (use the Jira key in the slug).

Output: which approach was chosen and why. Record path in TASK.md Metadata as `FEAT doc:`.

## B4: Fix Plan (Bug-Specific SPEC)

Write a concise fix plan (bug SPEC) as a file (not just TASK.md Notes):
- Exact files to change
- What to change and why
- Test cases that would catch this regression
- File Layout table (even if small) — one row per file touched

Save to `docs/plans/YYYY-MM-DD-HHMM-bugfix-<slug>.md` per the Artifact File Convention. Include the executing-plans directive at the top:

> `**For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.`

Record the path in TASK.md Metadata as `SPEC:`. Also add bullet summary to TASK.md Notes for at-a-glance context, but the bugfix file is the source of truth.

## B5: Implement Fix

Spawn @sheep-1 using Agent tool (model: sonnet):
> "Read `CLAUDE.md`, then `teams/implementer.md`. Fix plan: <PLAN_PATH>. Root cause: <ROOT_CAUSE_REPORT_SUMMARY>.
>
> **Plan-execution contract (first action):** invoke `Skill superpowers:executing-plans` against `<PLAN_PATH>` and follow it step-by-step. Review the plan critically before starting; raise concerns instead of guessing.
>
> **Size + test-coexistence contract (NO COMMANDS — sheep-specific):** every non-test source file you touch stays ≤ 300 lines (full cap table in `teams/implementer.md` 'Self-Check Before Marking an IMP Task Done'); every new non-test source file has a planned co-located `*.test.*` entry in TASK.md File Layout (Pete writes it). If the fix pushes a file over cap, split NOW per the patterns in implementer.md — don't defer. Verify by reading line counts — do NOT run commands. You do NOT invoke `Skill code-quality`, run tests, run typecheck, run lint, or run build. Sentinel owns every audit at G7.
>
> Update TASK.md as you work."

## B6: Full Test Suite

Spawn @paranoid-pete using Agent tool (model: sonnet):
> "Read `teams/test-writer.md`. Write comprehensive tests for the bug fix and all affected code paths. Affected files: <FILES>. Run scoped coverage (≥80% threshold)."

## B7: Full Verification

Spawn @sentinel using Agent tool (model: sonnet):
> "Read `teams/verifier.md`. Mode: full. Verify bug fix at <AFFECTED_FILES>. Invoke `Skill code-quality` (inputs: `<APP>`, `<feature>`, mode=full) — it runs every gate. Paste the Health Score verbatim. Use the Respawn Decisions table from verifier.md to pick the correct agent for any failing gate. A regression or oversize-file leak ships to production, so the OVERALL verdict must be PASS before you mark the bug closed."

## B8: Browser QA (if UI visible)

If bug is UI-visible: spawn @inspector-clouseau.

## B9: Knowledge Update (MANDATORY)

Document root cause, fix pattern, and any architectural insight.
Consider: should this pattern be added to `references/arch-*.md` to prevent recurrence?
Confirm: "Reviewed learnings — [updates made / no updates needed]."

## B10: Finalize

REQUIRED: Invoke `finalize` skill.
