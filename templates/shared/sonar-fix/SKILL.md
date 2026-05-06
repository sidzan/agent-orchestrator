---
name: sonar-fix
description: |
  Find and fix SonarQube issues for this project. Fetches open issues from SonarQube,
  triages by severity, and fixes them with proper build/lint verification. Use when
  asked to "fix sonar issues", "sonar cleanup", "fix code smells", "reduce technical
  debt", or "fix sonar blockers".
---

# SonarQube Issue Finder & Fixer

You find and fix SonarQube issues in this project.

**Project Key:** `{{CONFIG.integrations.sonar.projectKey}}`

## Step 0: Read Project Rules

Read `CLAUDE.md` in this repository root first.

## Step 1: Determine Scope

Parse the user's request:

1. **Severity filter:** default `HIGH` and `BLOCKER`
2. **Issue limit:** default `5`
3. **Quality filter:** `SECURITY`, `RELIABILITY`, `MAINTAINABILITY`, or all (default all)
4. **File scope:** specific file/directory, or all (default all)

If the user says "fix sonar issues" with no qualifier, default to HIGH+BLOCKER, limit 5. Confirm scope before proceeding.

## Step 2: Fetch Issues

```
mcp__sonarqube__search_sonar_issues_in_projects(
  projects: ["{{CONFIG.integrations.sonar.projectKey}}"],
  severities: ["HIGH", "BLOCKER"],
  issueStatuses: ["OPEN"],
  ps: <limit>
)
```

Optional filters:
- `impactSoftwareQualities: ["SECURITY"]` for security-only
- `files: ["{{CONFIG.integrations.sonar.projectKey}}:path/to/File"]` for file-scoped

## Step 3: Triage & Present

Present issues in a table:

```
| # | Severity | Rule | File | Line | Message |
|---|----------|------|------|------|---------|
```

Ask: "Which issues should I fix? (all / specific numbers / skip)"

## Step 4: Understand Rules

For each unique rule, fetch details:

```
mcp__sonarqube__show_rule(ruleKey: "<rule-key>")
```

Use the rule description and remediation guidance to inform fixes.

## Step 5: Fix Issues

For each selected issue:

1. Read the affected file
2. Understand the surrounding context (not just the flagged line)
3. Apply the fix following SonarQube's remediation guidance
4. Ensure the fix doesn't change behavior — these are refactoring fixes

**Common rules and fix strategies (cross-language):**

| Rule (typescript: / csharpsquid:) | Issue | Fix Strategy |
|---|---|---|
| `*S3776` | Cognitive complexity too high | Extract functions, simplify conditionals, use early returns |
| `*S1854` | Dead stores | Remove unused assignments |
| `*S1135` | TODO comments | Resolve or remove with ticket reference |
| `*S2259` / `S2532` | Null/undefined dereference | Add null checks, optional chaining, or guards |
| `*S4634` | Promise/Task not awaited | Add `await` or explicitly fire-and-forget with comment |

**Parallelization:**
- Fix issues in **different files** in parallel (spawn multiple agents)
- Fix issues in the **same file** sequentially
- Maximum 3 parallel fix agents

## Step 6: Verify

After all fixes:

```bash
{{CONFIG.commands.build}}
{{CONFIG.commands.lint}}
{{CONFIG.commands.test}}
```

If lint finds changes, apply them. If tests fail, investigate whether the fix caused the failure.

## Step 7: Report

```
## SonarQube Fix Report

### Fixed ({count})
| # | Severity | Rule | File | Status |
|---|----------|------|------|--------|

### Skipped / Could Not Fix ({count})
| # | Severity | Rule | File | Reason |
|---|----------|------|------|--------|

### Verification
- Build: PASS/FAIL
- Lint:  PASS/FAIL
- Tests: PASS/FAIL ({passed}/{total})

### Next Steps
- [ ] Review changes: `git diff`
- [ ] Commit if satisfied
- [ ] Remaining open issues: {count}
```

Do NOT commit automatically. Let the user review and decide.
