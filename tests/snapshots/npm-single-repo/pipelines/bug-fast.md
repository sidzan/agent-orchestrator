# Bug / Fast Pipeline

Read this file after routing to bug/fast mode.

## Model Tier Strategy

All agents use **sonnet** except Team Lead (Opus 4.7) and `@jira-runner` (**haiku**, mandatory).

## Jira Mirror — MANDATORY at every gate (unless `<JIRA_KEY> = NONE`)

After each B-step, the team lead **drafts** the comment body and **spawns `@jira-runner` via the Agent tool with `model: "haiku"`** (Payload C `MODE: gate-comment`) to post it. Inline `Skill jira-tracking` and direct `mcp__claude_ai_Atlassian__*` calls are FORBIDDEN — see `teams/jira-runner.md`. Same subject mapping as bug-full except no `G4 Plan` step (bug-fast has no separate plan stage). Gates: `ticket-created`, `G1 Explore` (root cause), `G5 Impl`, `G6 Tests`, `G7 Verify` (Health Score with FILE_SIZE + TEST_COEXISTENCE), `G8 BrowserQA`, `G9 Knowledge`, `G10 PR`. On retry, spawn `@jira-runner` with a Payload D `blocker` / `revision` envelope. A `FAILED:` return → TASK.md Blockers.

## B1: Create Team

TeamCreate — team name: `<APP>-bug-<short-description>`

Verify `<JIRA_KEY>` resolved at Step 0.a.i. Spawn `@jira-runner` (model: haiku) with Payload A (`MODE: verify-and-resume`) — or rely on the `ticket-created` comment the Scribe already posted at Step 0.a.i if the ticket was just created. Do NOT invoke `Skill jira-tracking` inline.

## B2: Gather Repro

Ask user for:
1. Exact steps to reproduce
2. Expected behavior
3. Actual behavior (error messages, screenshots if available)

## B3: Explorer — Bug Mode (Root Cause Report)

Spawn @indiana using Agent tool (model: sonnet):
> "Read `CLAUDE.md`, then `teams/explorer.md` — Bug Mode section. Bug: <DESCRIPTION>. Repro: <STEPS>. Expected: <EXPECTED>. Actual: <ACTUAL>. Produce Root Cause Report."

Read Root Cause Report. If Confidence = Low: ask one targeted question, re-spawn explorer.

Create TASK.md at project root with the bug description.

## B3.5: Brainstorm if Ambiguous (conditional)

Bug-fast assumes the fix is an obvious targeted patch. If the Root Cause Report comes back Medium/Low confidence, or multiple plausible fixes exist, you are in the wrong pipeline — switch to `bug/full` and run B3.5 brainstorm there. Do NOT continue bug-fast with an unclear root cause; a bad patch hides the real bug.

## B3.7: Write Fix Plan File

Even in fast mode, the fix is a file on disk. Team lead writes a minimal fix plan and saves it to `docs/plans/YYYY-MM-DD-HHMM-bugfix-<slug>.md` per the Plan File Convention. Minimum content:

- **Root cause** (one paragraph from the Report)
- **Fix** — exact file(s), exact change(s), with code block for anything non-trivial
- **Test to add** — file path + what the test asserts
- Executing-plans directive at the top:
  > `**For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan.`

Record path in TASK.md Metadata as `SPEC:`. This takes ~2 minutes and is non-negotiable — the sheep needs a bugfix file to execute against.

## B4: Implement Fix

Spawn @sheep-1 using Agent tool (model: sonnet):
> "Read `CLAUDE.md`, then `teams/implementer.md`. Fix plan: <PLAN_PATH>. Root cause: <ROOT_CAUSE_ONE_LINE>. Affected files: <FILES_FROM_REPORT>.
>
> **Plan-execution contract (first action):** invoke `Skill superpowers:executing-plans` against `<PLAN_PATH>`. The plan is short but it's still the contract — follow its steps in order. Prioritize responding quickly; this is a targeted patch, not a redesign.
>
> **Size + test-coexistence contract (NO COMMANDS — sheep-specific):** every non-test source file you touch stays ≤ 300 lines (full cap table in `teams/implementer.md` 'Self-Check Before Marking an IMP Task Done'); every new non-test source file has a planned co-located `*.test.*` entry in TASK.md File Layout (Pete writes it). If the fix pushes a file over cap, split NOW per the patterns in implementer.md. Verify by reading line counts — do NOT run commands. You do NOT invoke `Skill code-quality`, run tests, run typecheck, run lint, or run build. Sentinel owns every audit at G7.
>
> Update TASK.md as you work."

## B5: Targeted Tests

Spawn @paranoid-pete using Agent tool (model: sonnet):
> "Read `teams/test-writer.md`. Write tests that cover the bug scenario: <BUG_DESCRIPTION>. Affected files: <FILES>. Run scoped tests."

## B6: Verification

Spawn @sentinel using Agent tool (model: sonnet):
> "Read `teams/verifier.md`. Mode: fast. Verify bug fix at <AFFECTED_FILES>. Invoke `Skill code-quality` (inputs: `<APP>`, `<feature>`, mode=fast) — it runs every gate including FILE_SIZE and TEST_COEXISTENCE (fast mode only skips SonarQube). Paste Health Score verbatim. Use the Respawn Decisions table from verifier.md for any failing gate."

If FAIL: respawn sheep-1. Max 3 retries.

## B7: Browser QA (if Has UI = YES)

If bug is UI-visible: spawn @inspector-clouseau.
> "Read `teams/browser-qa.md`. Verify this bug is fixed: <BUG_DESCRIPTION>. Feature path: <URL>."

## B8: Knowledge Update (MANDATORY)

Update memory with root cause and fix pattern. Note any patterns to prevent this class of bug.
Confirm: "Reviewed learnings — [updates made / no updates needed]."

## B9: Finalize

REQUIRED: Invoke `finalize` skill.
