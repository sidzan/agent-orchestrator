---
name: jira-tracking
description: Use when starting work on a Jira ticket (create if missing) or passing a gate in implement-app / implement-backend (post checkpoint comment). Creates tickets in Gherkin story/task format with a separate Technical Details section. Mirrors TASK.md gate events to Jira as comments prefixed "Automated update>". Uses mcp__claude_ai_Atlassian__* tools. When invoked from an orchestrator, this skill runs inside the @jira-runner teammate (model: haiku) — never inline on the team-lead model.
---

# Jira Tracking

You mirror work state into Jira so humans can follow progress without reading TASK.md. Two modes:

1. **Create ticket** — when the user describes work without a ticket, create one in Gherkin format (story/task), not a technical spec.
2. **Update ticket** — when passing a pipeline gate, append a single comment starting with `Automated update>` and a gate-specific subject.

## Who invokes this skill

**Inside `implement-app` / `implement-backend`:** this skill is called exclusively by the `@jira-runner` teammate spawned with `model: "haiku"` (see the orchestrator's `references/jira-runner.md`). The team-lead model drafts bodies but never invokes this skill inline — that pattern is forbidden because it burns expensive tokens on templated MCP round-trips. If you find yourself reading this skill *as the team lead*, stop and spawn `@jira-runner` instead.

**Outside the orchestrators:** invoke directly for ad-hoc ticket creation. The Gherkin format, comment prefix, and templates below apply identically.

## Site Configuration

| Setting | Value |
|---------|-------|
| Atlassian site | `{{CONFIG.integrations.jira.baseUrl}}` |
| Primary project key | `{{CONFIG.integrations.jira.projectKey}}` |
| Default ticket type | `Task` (engineering work), `Story` (user-facing feature), `Bug` (defect) |
| Default labels | `ai-generated`, `{{CONFIG.project.name}}` (add to every ticket this skill creates) |

Resolve `cloudId` once via `mcp__claude_ai_Atlassian__getAccessibleAtlassianResources` and reuse for the session.

---

## Mode 1 — Create Ticket (Gherkin)

### When to use

- The user describes work but gave no ticket key.
- Team lead is starting exploration without a ticket recorded in TASK.md.
- User explicitly says "create a Jira ticket for this".

### STOP — confirm first

> "I'll create a Jira ticket in `{{CONFIG.integrations.jira.projectKey}}` as a **[Story|Task|Bug]**. Summary: `<short>`. OK to create? (y / change type / change project / skip Jira)"

Skip the confirmation only if the user said "auto-create".

### Ticket format — Gherkin, NOT technical

A Jira ticket read by a PM, designer, or stakeholder MUST describe **behaviour and value**, not implementation. Technical details go into a clearly-labelled sub-section **below** the story.

**Summary** (title): one sentence in present tense, from the user's perspective. No `[FE]`/`[BE]` prefixes. Examples:

- ✅ `Admin can list orders filtered by region`
- ✅ `Customer order checkout no longer double-saves on retry`
- ❌ `Add OrderController with FilterByRegion endpoint`
- ❌ `Refactor OrderHandler to use IReadWriteRepository`

**Description** — use this exact skeleton (Atlassian Wiki Markup):

```
h2. Story

*As a* {role}
*I want* {goal in one clause}
*So that* {benefit / outcome in business terms}

h2. Acceptance Criteria

*Scenario:* {happy path label}
*Given* {initial state}
*When* {user action / API call}
*Then* {observable outcome}
*And* {additional outcome, if any}

*Scenario:* {edge case or error label}
*Given* {initial state}
*When* {user action}
*Then* {observable outcome}

h2. Notes

- {non-goal — what this ticket explicitly does NOT cover}
- {affected surface(s)}
- {related tickets, if any}

h2. Technical Details

_This section is for engineering hand-off. PMs can skip it._

*Surface(s):* {service / page / worker name}
*Closest existing feature:* {file path or component}
*Approach:* {1–3 bullets on chosen approach}
*Migrations:* {migration version + summary, or "none"}
*Out of scope:* {bulleted}
*Dependencies:* {entities, services, feature flags}
*Risks:* {failure modes, data migrations, perf hotspots}

h2. Definition of Done

- [ ] Tests in place (RED before GREEN where TDD applies)
- [ ] Build + lint clean ({{CONFIG.commands.build}} / {{CONFIG.commands.lint}})
- [ ] Verifier OVERALL = PASS
- [ ] PR created and linked on this ticket
- [ ] SonarQube quality gate PASS (if applicable)
```

### Hard rules for Mode 1

- **Summary MUST NOT contain file names, class names, framework names, or handler-method names.** A stakeholder should be able to read the summary and know what changed for the user.
- **Story section MUST use the "As a / I want / So that" triad.** All three clauses.
- **At least one `Scenario:` block is required**, with `Given / When / Then`.
- **Technical Details section MUST exist and MUST be labelled `h2. Technical Details`.**
- **Labels:** always attach `ai-generated` and `{{CONFIG.project.name}}`.

### Tool call

```
mcp__claude_ai_Atlassian__createJiraIssue({
  cloudId: "<resolved>",
  projectKey: "{{CONFIG.integrations.jira.projectKey}}",
  issueTypeName: "Task",
  summary: "<user-facing sentence>",
  description: "<the wiki-markup skeleton above, filled in>"
})
```

After creation, capture the returned `key` and write it into TASK.md Metadata → Ticket. Post the first checkpoint comment immediately (see Mode 2, "ticket-created" subject).

### Rationalizations NOT accepted

| Excuse | Reality |
|--------|---------|
| "It's an internal refactor, Gherkin doesn't apply" | Then the role is "developer / system". There is always a `who / what / why`. |
| "The ticket is just for me, skip the story" | Future-you, onboarding engineers, and auditors read these tickets. |
| "The summary should say the handler class so I know what to open" | The PR title and branch carry the tech. The ticket summary is for business readers. |

---

## Mode 2 — Checkpoint Comments (gate updates)

### When to use

Exactly once per gate transition in the orchestrator. Never spam multiple comments per gate. Never skip comments — silent progress is useless.

### Comment format

Every comment **MUST** start with the literal string `Automated update>` followed by a single-line subject, then a blank line, then the body. This prefix is the search key humans use to filter bot comments.

```
Automated update> {GATE} — {short subject}

{body}
```

The `{GATE}` slot must be one of the orchestrator gate IDs so the history is scannable. Frontend pipeline uses gates `G0..G10`; backend pipeline uses similar gates with TDD-specific subjects (`G5 RED`, `G6 GREEN`, `G7 Verify`, `G10 PR`). Adapt to whichever orchestrator is active.

### Per-gate templates

**ticket-created**:

```
Automated update> ticket-created — pipeline started

Pipeline: {implement-app | implement-backend}
Surface(s): {component / API / worker}
Branch: {feat/PROJ-XXXX-slug}
Worktree: {path, if isolated}
TASK.md: {repo-relative path}
Operator: Claude Code
```

**Gate comments (G0.5, G1, G2, G4, G4.5, G5, G6, G7)** — one short body block summarising the gate output. Keep each comment under ~10 lines.

**G10 PR**: PR URL + final verifier block + a link back to the design doc.

**blocker** (ad-hoc, any gate):

```
Automated update> blocker — {short description}

Gate in progress: {Gx}
Description: {what's blocked}
Proposed next step: {what the human needs to do / decide}
Retry count: {n}/{max}
```

**revision** (ad-hoc, on re-runs of a gate):

```
Automated update> revision — {GATE} retry {n}/{max}

{new dimensions block or verdict change}
Verdict change: {BLOCK → APPROVE | REVISE → PROCEED | etc.}
```

### Tool call — add a comment

```
mcp__claude_ai_Atlassian__addCommentToJiraIssue({
  cloudId: "<resolved>",
  issueIdOrKey: "{{CONFIG.integrations.jira.projectKey}}-XXXX",
  commentBody: "<the full wiki-markup string starting with 'Automated update>'>"
})
```

If the comment fails (permissions, ticket moved, etc.), log to TASK.md Blockers and continue the pipeline. Do not halt a gate over a failed comment; halt only if the ticket itself is missing at G0.

### Rationalizations NOT accepted

| Excuse | Reality |
|--------|---------|
| "Gate passed so the comment is redundant" | The ticket is the only place a PM sees the pipeline running. Post the comment. |
| "I'll batch all gate comments at the end" | Then a blocker at G6 has no audit trail. Post per gate. |
| "Each comment should summarize the whole pipeline" | Each comment covers ONE gate. Brevity is the feature. |
| "Prefixing every comment with 'Automated update>' is ugly" | Ugly is the point — humans filter on that prefix. Keep it. |

---

## Ticket Discovery — locate-then-create

When the orchestrator starts at G0, ask: "Is there an existing Jira ticket?"

1. User provides a ticket key → call `mcp__claude_ai_Atlassian__getJiraIssue` to confirm it exists; post `ticket-created` comment (subject becomes `pipeline-resumed`).
2. User says "no, create one" → enter Mode 1.
3. User unsure → search first with `mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql`:
   ```
   project = {{CONFIG.integrations.jira.projectKey}} AND summary ~ "<keywords>" ORDER BY created DESC
   ```
   Offer top 5 matches. If none fit, enter Mode 1.

Never silently create a duplicate ticket. Always search + confirm first.

---

## Integration with TASK.md

TASK.md stays the local log — in-session detail, agent-to-agent state, bug table, task checklists. The Jira ticket stays the external log — stakeholder-readable, gate-level only.

Rule of thumb: if a detail would be noise for a PM, it belongs in TASK.md only. If it signals "this pipeline advanced a gate" or "this pipeline is blocked on a human", it belongs in both.

At Gate G0, write the Jira key into TASK.md Metadata → Ticket. At G10, write the PR URL into both TASK.md and the ticket.

---

## Red Flags — STOP

- You're about to create a ticket whose summary is a class or handler name → rewrite as a user sentence.
- You're about to post a comment that doesn't start with `Automated update>` → prefix it.
- You're about to skip a gate comment because "nothing changed" → gates always advance state; post it.
- You're posting the SAME comment twice at the same gate → edit or add a `revision` comment instead.
- You're creating a second ticket for the same work → search JQL first, link instead of duplicating.

All of these mean: stop, re-read this skill, do it right. The ticket is permanent; bad tickets outlive the session.
