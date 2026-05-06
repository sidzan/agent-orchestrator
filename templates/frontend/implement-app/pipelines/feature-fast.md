# Feature / Fast Pipeline

Read this file after routing to feature/fast mode.

Abridged version of feature/full. Skips: Eng Review (F5), DM-2 (F7). Uses 70% coverage threshold.

## Model Tier Strategy

All agents use **sonnet** except Team Lead (Opus 4.7) and `@jira-runner` (**haiku**, mandatory). DM-2 is skipped in fast mode so no opus agents spawned.

## Jira Mirror — MANDATORY at every gate (unless `<JIRA_KEY> = NONE`)

Same contract as feature/full: after each F-step, the team lead **drafts** the body and **spawns `@jira-runner` via the Agent tool with `model: "haiku"`** to post the `Automated update>` comment. Inline `Skill jira-tracking` and direct `mcp__claude_ai_Atlassian__*` calls from the team lead are FORBIDDEN. Gates G3 and G4.5 are skipped in fast mode so no comment for those. All other gates (G0, G0.5, G1, G2, G4, G5, G6, G7, G8, G9, G10) get their standard comment — same per-gate templates, same Scribe transport. See feature-full "Jira Mirror" section, `teams/jira-runner.md` (payload envelopes), and `.claude/skills/jira-tracking/SKILL.md` (body templates).

## F1: Create Team

TeamCreate — team name: `<APP>-<short-feature-name>`

Verify `<JIRA_KEY>` resolved at Step 0.a.i. Spawn `@jira-runner` (model: haiku) with Payload A (`MODE: verify-and-resume`) if the ticket existed, or rely on the `ticket-created` comment the Scribe already posted at Step 0.a.i if the ticket was just created. Do NOT invoke `Skill jira-tracking` inline.

## F2: Decision Maker — DM-1 (Gate G0.5)

Same as feature/full F2. DM-1 still runs.

## F3: Explorer (Gate G1)

Same as feature/full F3.

## F4: FEAT Document (Gate G2) — MANDATORY

> **What is a FEAT?** Feature Document — bridges the PRD/Jira requirements and the technical SPEC. Captures user flows, business rules, and acceptance criteria.

**Hard rule:** Fast mode is a coverage-threshold knob, not a FEAT knob. Skipping this step = pipeline violation. Streamlining means fewer clarifying questions, not zero FEAT design.

**Announce out loud:** `Entering F4 FEAT design — invoking superpowers:brainstorming (fast variant: one round).`

REQUIRED: Invoke `superpowers:brainstorming` with:
- The feature request + Explorer Passport findings
- PRD context (Jira ticket ACs if available)
- Override: save FEAT document to `docs/plans/YYYY-MM-DD-HHMM-feat-<slug>.md` (state this in the first message to the brainstorming skill)
- Aim for one round of clarifying questions + FEAT presentation + user approval.

After: verify the file exists at that path, Business Rules section populated, Acceptance Criteria section populated, user approved. Record path in TASK.md Metadata as `FEAT doc:`. **Gate G2 only passes when all four hold.**

## F5: Write SPEC — Technical Specification (Gate G4)

> **What is a SPEC?** Technical Specification — the implementation contract with file layout, task list, and data flow.

REQUIRED: Invoke `superpowers:writing-plans`.

**SPEC path override:** In the first message to the skill, state: *"Save the SPEC to `docs/plans/YYYY-MM-DD-HHMM-spec-<slug>.md` — this project's override supersedes the default `docs/superpowers/plans/` location."* Reuse the same `YYYY-MM-DD-HHMM` stamp from F1 so FEAT + SPEC pair up.

The SPEC's writing-plans "Plan Document Header" already carries the executing-plans directive for sheep — don't strip it.

After: verify file exists at the override path; record in TASK.md Metadata as `SPEC:`; populate Implementation and Testing checklists from the File Layout.

**(Skip: Eng Review, ADR check, and DM-2 — gates G1.5, G3, and G4.5 are BYPASSED in fast mode. FEAT design is NOT skipped.)**

## F6: Implementation (Gate G5)

Same as feature/full F8 — **including the fan-out criterion** AND the **Plan-execution contract**: every sheep spawn prompt tells the sheep to invoke `Skill superpowers:executing-plans` with the plan path as its first action.

Sheep spawn prompt template (copy from feature-full F8 — sheep get SPEC-execution + the command-free size/test-coexistence contract; sheep do NOT get a code-quality invocation):
> "Read `CLAUDE.md`, then `teams/implementer.md`. Your assigned IMP tasks: <IDS>. SPEC: <SPEC_PATH>. FEAT: <FEAT_DOC_PATH>.
> **SPEC-execution contract (first action):** invoke `Skill superpowers:executing-plans` against `<SPEC_PATH>` and follow it step-by-step for your assigned IMP tasks.
> **Size + test-coexistence contract (NO COMMANDS):** every non-test source file you touch stays ≤ 300 lines (full cap table in `teams/implementer.md` 'Self-Check Before Marking an IMP Task Done'); every new non-test source file has a planned co-located `*.test.*` entry in TASK.md File Layout (Pete writes it). If a file is over cap, split NOW per the patterns in implementer.md. Verify by reading line counts — do NOT run commands. You do NOT invoke `Skill code-quality`, run tests, run typecheck, run lint, or run build. Sentinel owns every audit at G7."

Fast mode does NOT relax the Plan-execution contract or the size/test-coexistence rule — coverage threshold is the only knob (70% vs 80%, enforced by Sentinel/Pete, not sheep).

Write file ownership to TASK.md first. Monitor. Wait for all Done.

## F7: Testing (Gate G6)

Same as feature/full F9. Pete spawn prompt uses the same Quality contract one-liner (`Skill code-quality` mode: fast). Coverage threshold: ≥70% per file (fast mode).

## F8: Verification (Gate G7)

Spawn @sentinel using Agent tool (model: sonnet):
> "Read `teams/verifier.md`. Verify feature at the path(s) implemented by sheep (from TASK.md File Layout). Mode: fast. Invoke `Skill code-quality` (inputs: `<APP>`, `<feature>`, mode=fast) — it runs every gate including FILE_SIZE and TEST_COEXISTENCE (fast mode only skips SonarQube, never these). Paste the Health Score verbatim. Use the Respawn Decisions table from verifier.md to pick the correct agent for any failing gate."

**Gate G7:** Health score OVERALL = PASS.

## F9: Browser QA (Gate G8)

Same as feature/full F11.

## F10: Knowledge Update (Gate G9 — MANDATORY)

Same as feature/full F12. Cannot skip.

## F11: Finalize (Gate G10)

REQUIRED: Invoke `finalize` skill.
