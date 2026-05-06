# Task Tracking Guide

## Purpose

TASK.md is a live checklist at the project root that tracks the current implementation session. It prevents agents from losing focus, ensures all phases complete, and gives the team lead visibility into progress.

## TASK.md Location

Always at: `TASK.md` (project root)

## When to Create

The **team lead** creates TASK.md immediately after the explorer reports back (Step 2). Use the template below.

## When to Update

Every agent updates TASK.md when:
- Starting a task → mark `[~]` (in progress)
- Completing a task → mark `[x]` (done)
- Discovering a blocker → add to Blockers section
- Adding new work discovered during implementation → add to relevant section
- Discovering a bug during verification → add to Bugs table

## Template

```markdown
# TASK — <Feature Name>

## Metadata
| Field | Value |
|-------|-------|
| Feature | <Feature Name> |
| App | admin / employee / customer |
| Ticket | <JIRA-ID, or NONE if user opted out of Jira mirroring> |
| Jira gate comments | mirror on / off (set by jira-tracking at G0) |
| Branch | <branch-name> |
| Started | YYYY-MM-DD |
| Status | Exploration / Implementation / Testing / Verification / Complete |
| PRD doc | <path to docs/plans/YYYY-MM-DD-HHMM-prd-*.md, or "Jira ticket" if clear> |
| FEAT doc | <path to docs/plans/YYYY-MM-DD-HHMM-feat-*.md> |
| SPEC | <path to docs/plans/YYYY-MM-DD-HHMM-spec-*.md or bugfix-*.md> |
| ADR | <path to docs/architecture/decisions/ADR-NNN-*.md, or NONE> |

## Design Decisions
| Field | Value |
|-------|-------|
| WHAT | <feature in one sentence> |
| HOW | <chosen approach> |
| WHY | <rationale> |
| Business Rules | <link or inline — REQUIRED — team lead verifies before implementation> |

## Decision Maker Results
| Run | Scope | Recommendation | Risk | Question Asked |
|-----|-------|----------------|------|----------------|
| DM-1 | Clear/Unclear/Risky | fast/full/reconsider | | |
| DM-2 | Aligned/Misaligned | PROCEED/REVISE | | |

## Current Phase

<!-- Update this as phases change -->
- Phase: Exploration / Brainstorm / Planning / Implementation / Testing / Verification / Finalize

## Exploration Findings

<!-- Explorer fills this in -->
- Closest existing feature:
- Reusable components:
- Suggested structure:
- Resources.ts update needed: yes/no
- New domain types needed:

## Implementation Tasks

<!-- Team lead populates from the plan. Implementers update status. -->
| ID | Task | File(s) | Status | Assignee | Retries | Notes |
|----|------|---------|--------|----------|---------|-------|
| IMP-001 | description | `path/to/file.tsx` | Pending / In Progress / Done | implementer-N | 0 | |
| IMP-002 | description | `path/to/file.ts` | Pending | implementer-N | 0 | |

## Testing Tasks

<!-- Test writer updates status -->
| ID | Test File | Covers | Status | Assignee | Notes |
|----|-----------|--------|--------|----------|-------|
| TST-001 | `path/to/file.test.tsx` | IMP-001 | Pending | test-writer | |
| TST-002 | `path/to/file.test.tsx` | IMP-002 | Pending | test-writer | |

## Bugs

<!-- Verifier adds bugs here. Implementer fixes and updates status. -->
| ID | Linked Task | Severity | Description | Status | Resolution |
|----|-------------|----------|-------------|--------|------------|

## Review Results
| Reviewer | Status | Key Findings |
|----------|--------|--------------|
| Eng Review | APPROVE/BLOCK | |
| Design Review | APPROVE/BLOCK/SKIPPED | |

## Browser QA Results
| Run | Status | Screenshot Path | Notes |
|-----|--------|-----------------|-------|
| 1 | PASS/BLOCK | | |

## Verification Checklist

<!-- Verifier updates status -->
| Check | Status | Notes |
|-------|--------|-------|
| TypeScript compiles (`typecheck`) | [ ] | |
| Lint passes (`lint:fix`) | [ ] | |
| All tests pass | [ ] | |
| Coverage >= 80% per new file | [ ] | |
| No regressions | [ ] | |

## Quality Gate

<!-- All must pass before finalization -->
- [ ] `pnpm --filter=<app> typecheck` — 0 errors
- [ ] `pnpm --filter=<app> lint:fix` — 0 errors
- [ ] `pnpm --filter=<app> test` — all pass
- [ ] `pnpm --filter=<app> build` — success

## Finalization

- [ ] Translation keys synced to Lokalise
- [ ] PR created
- [ ] Pipeline monitoring started (`/loop`)
- [ ] Pipeline passed / auto-fixed
- [ ] Cleanup done

## PR Summary
| Field | Value |
|-------|-------|
| Title | |
| PR URL | |
| Description | |

## Blockers / Notes

<!-- Any agent can add blockers or important notes here -->
```

## Mandatory Gates

At EVERY gate transition, the team lead MUST:
1. Read `TASK.md`
2. Verify the blocking condition
3. If condition fails → STOP, log what's missing, do NOT proceed

| Gate | Phase Transition | Check | Fails If |
|------|-----------------|-------|----------|
| G0 | → Exploration | TASK.md exists, Metadata populated | No file or empty Metadata |
| G0.5 | → Planning | DM-1 run; SCOPE not "Reconsider" (or user confirmed proceed) | SCOPE = Reconsider and no user override |
| G1 | → Planning | Exploration Findings has data | Empty findings |
| G2 | → Implementation | Implementation Tasks has ≥1 task | Empty table |
| G3a | → Testing (services/hooks) | All service + hook IMP tasks = Done | Any service/hook task not Done |
| G3b | → Testing (UI/pages) | All UI + page IMP tasks = Done | Any UI/page task not Done |
| G4 | → Verification | All TST tasks = Done | Any not Done |
| G4.5 | → Verification (final) | DM-2 run; VERDICT = PROCEED (or plan revised and re-approved) | VERDICT = REVISE and no revised plan |
| G5 | → Finalization | All Verification rows = Pass | Any Fail (after retry loop) |
| G6 | → Complete | Quality Gate all checked | Any unchecked |
| G7 | → Complete | Eng Review = APPROVE | BLOCK status |
| G8 | → Complete | Browser QA Run 1 = PASS | BLOCK status |
| G9 | → Complete | PR URL in Metadata | No PR |
| G10 | → Complete | Pipeline passed | Pipeline failing |

Full gate sequence: **G0 → G0.5 → G1 → G2 → G3a → G3b → G4 → G4.5 → G5 → G6 → G7 → G8 → G9 → G10**

## Rules for Agents

### Indiana 🪬 (Explorer)
- After exploration, create TASK.md using the template
- Fill in the "Exploration Findings" section and Metadata
- Set "Current Phase" to `Exploration`

### Team Lead (Orchestrator)
- After planning, populate "Implementation Tasks" with exact IMP-XXX tasks from the plan
- Populate "Testing Tasks" with expected TST-XXX entries
- Update "Current Phase" as workflow progresses
- **Run gate checks between every phase** — do NOT skip
- Review TASK.md between phases to catch drift
- Fill "Design Decisions" table before implementation begins — Business Rules field is REQUIRED

### Sheep 🐑 (Implementer)
- Read TASK.md at start to understand full scope
- Mark your assigned IMP tasks `In Progress` when starting, `Done` when done
- Add any discovered subtasks or blockers
- Do NOT modify tasks assigned to other agents
- Track retries: if a task is sent back for fixes, increment Retries column

### Paranoid Pete 🔍 (Test Writer)
- Read TASK.md to see what was implemented
- Mark TST tasks `In Progress` when starting, `Done` when done
- Add test file paths to "Testing Tasks" if not already there

### Sentinel 🛡️ (Verifier)
- Read TASK.md to understand what to verify
- Mark verification items when checking
- **Log ALL bugs in the Bugs table** with severity (Minor/Critical)
- Minor bugs: sheep fixes, sentinel re-checks (max 3 retries per bug)
- Critical bugs: STOP immediately, escalate to team lead
- Fill "Review Results" and "Browser QA Results" tables

### The Oracle (Decision Maker)
- **DM-1** runs before exploration begins (gates G0.5): team lead invokes with the feature request, Oracle returns SCOPE (Clear/Unclear/Risky) + recommended mode (fast/full/reconsider). Fill the DM-1 row in Decision Maker Results.
- **DM-2** runs after the plan is written, before implementation (gates G4.5): team lead invokes with the plan + Exploration Passport, Oracle verifies alignment. Fill the DM-2 row with VERDICT (PROCEED/REVISE).
- If DM-1 returns "Reconsider" and user has not overridden: team lead STOPS, escalates to user before continuing.

## Why This Matters

Without TASK.md, agents can:
- Forget steps in the middle of long implementations
- Lose track of what's been done vs what's remaining
- Duplicate work or skip work
- "Sway off" into unrelated changes
- Skip quality gates and ship broken code

TASK.md is the single source of truth for the current session.
