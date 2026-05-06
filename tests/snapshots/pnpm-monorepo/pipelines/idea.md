# Idea Pipeline

Read this file after routing to idea mode.

Explore and spec only. No implementation.

## I1: Brainstorm

REQUIRED: Invoke `superpowers:brainstorming` skill with:
- The idea/request
- CLAUDE.md context (`<APP>`-relevant patterns)
- Recent git log for context: `git log --oneline -10`
- Relevant area of the codebase (ask user if unclear)
- **Path override (MANDATORY):** state in the first message to the brainstorming skill: *"Save the idea doc to `docs/plans/YYYY-MM-DD-HHMM-idea-<slug>.md` — this project's override supersedes `docs/superpowers/specs/`."* Use `date -u +%Y-%m-%d-%H%M` for the timestamp and the Jira key (if any) in the slug.

Follow the full brainstorming process:
- Ask clarifying questions one at a time
- Propose 2-3 approaches with trade-offs
- Present design sections, get user approval after each
- Verify file exists on disk at the override path before declaring I1 done
- Commit the idea doc

## I2: Optional — Continue to Implementation?

After brainstorm completes, ask:

> "Design doc saved to `docs/plans/YYYY-MM-DD-HHMM-idea-<slug>.md`.
> Want to continue to implementation?
> A) Yes — feature/full pipeline (complete with eng review, DM, browser QA)
> B) Yes — feature/fast pipeline (streamlined, faster)
> C) No — stop here, I'll implement later"

If A: re-enter this skill, route to feature/full. Pass the idea doc path so F4 can build on it (produces a separate `-feat-` FEAT document).
If B: re-enter this skill, route to feature/fast. Same handoff as A.
If C: STOP. Print the idea doc path.
