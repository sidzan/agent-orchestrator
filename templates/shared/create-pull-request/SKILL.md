---
name: create-pull-request
description: Creates a pull request from a Jira ticket (branch naming, git flow, PR description). Use when the user asks to create a PR, create a pull request, or run the create PR workflow. Requires Jira ticket number; ask for it first if not provided.
---

# Create Pull Request

## When to Use

When the user requests to create a pull request (e.g. "create a PR", "run the create PR workflow"). **Do not start until the Jira ticket number is provided.**

- If the user includes the ticket (e.g. "Create PR for {{CONFIG.integrations.jira.projectKey}}-2067"), use it and proceed.
- If not, ask: `"What is the Jira ticket number? (e.g. {{CONFIG.integrations.jira.projectKey}}-2067)"` and stop until they provide it.

---

## Configuration

| Setting | Value |
|---|---|
| Jira base URL | `{{CONFIG.integrations.jira.baseUrl}}` |
| Project key | `{{CONFIG.integrations.jira.projectKey}}` |
| Target branch | `main` |

Hosting is detected from the repo's `origin` remote. The skill supports both Bitbucket and GitHub flows; the differences are isolated to Step 6 (Create PR).

---

## Step 1. Fetch Jira Ticket

Use `mcp__claude_ai_Atlassian__getJiraIssue` with the provided ticket key.

Extract:
- `key`
- `summary`
- `description` (for Developer Notes)

Build the Jira link: `{{CONFIG.integrations.jira.baseUrl}}/browse/{key}`

---

## Step 2. Inspect Git State

```bash
git branch --show-current
git status
git fetch origin main
git log origin/main..HEAD --oneline
git diff origin/main --name-only
```

If there are uncommitted changes, instruct the user to commit using:
`feat: [{KEY}] short description`

If commits are missing (`git log origin/main..HEAD` is empty), abort: there is nothing to PR.

---

## Step 3. Derive Branch Name

From the Jira `summary`:
- Strip surface prefixes (`[FE]`, `[BE]`, `[AP]`, etc.)
- Take 3–5 meaningful words
- Slugify (lowercase, hyphens, no special chars)

Branch name format: `feature/{KEY}-{short-desc}`

Example: `feature/{{CONFIG.integrations.jira.projectKey}}-2067-filter-chain-logic`

Commit message format: `feat: [{KEY}] <short description>`

---

## Step 4. Branch Hygiene

If the current branch is `main` or some unrelated branch:
```bash
git checkout -b feature/{KEY}-{short-desc}
```

If the current branch already matches the ticket (different short-desc OK), reuse it. If it matches a *different* ticket, ask the user before switching.

Push the branch:
```bash
git push -u origin feature/{KEY}-{short-desc}
```

---

## Step 5. Compose the PR Body

Use this skeleton:

```markdown
## Ticket

[{KEY}]({{CONFIG.integrations.jira.baseUrl}}/browse/{KEY}) — {summary}

## Summary

{1–3 bullets describing what changed and why, in plain language}

## Developer Notes

{relevant tech detail — refactors touched, gotchas, perf considerations}

## Test Plan

- [ ] {automated coverage added/updated}
- [ ] {manual scenarios verified}
- [ ] Build + lint clean ({{CONFIG.commands.build}} / {{CONFIG.commands.lint}})

## Out of Scope

{what this PR explicitly does NOT cover}
```

---

## Step 6. Create the PR

### If origin is Bitbucket (`git remote get-url origin` contains `bitbucket.org`)

Use the Bitbucket MCP server. Fetch default reviewers first via `getEffectiveDefaultReviewers`. Then create the PR with title `[{KEY}] {summary}` and the body from Step 5.

### If origin is GitHub (`git remote get-url origin` contains `github.com`)

Use the `gh` CLI:

```bash
gh pr create \
  --title "[{KEY}] {summary}" \
  --body "$(cat <<'EOF'
{Step 5 body}
EOF
)" \
  --base main
```

Capture the returned PR URL.

---

## Step 7. Post-Create

1. Print the PR URL to the user.
2. If Jira integration is enabled, post the URL on the ticket as a `G10 PR` checkpoint comment via `jira-tracking` (Mode 2).
3. Update TASK.md Metadata → PR row.

---

## Hard Rules

- **Never create a PR without a ticket key.** Ask for it.
- **Never push to `main` or open a PR with `main` as the source branch.**
- **PR title MUST start with `[{KEY}]`** so search/filtering works.
- **Body MUST include the Jira link** at the top.
- **Don't overwrite the user's work** — if the branch has unrelated commits the user didn't author this session, stop and confirm.
