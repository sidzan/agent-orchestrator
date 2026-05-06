# Init Prompt — agent-bootstrap

Use this file to generate CLAUDE.md for this project.
Read everything below, then read `docs/design.md` and `implement-app/SKILL.md` before writing CLAUDE.md.

---

## What This Project Is

An npm package (`agent-bootstrap`) that bootstraps a project-tailored multi-agent orchestration skill into any codebase — monorepo or single-repo, any stack.

The skill it generates is a generalized version of `implement-app`: a battle-tested Claude Code skill with a full gate pipeline (G0–G10), named team personas (Indiana, Sheep, Pete, Sentinel, Clouseau, Gordon, Oracle, Scribe), Jira integration, SonarQube gates, and an artifact convention. The original is hardwired to one specific project; this package makes it portable.

**Full design spec:** `docs/design.md`
**Original skill reference (gitignored, do not commit):** `implement-app/`

---

## How It Works

1. Developer runs `npx agent-bootstrap@latest` in any project root
2. CLI discovers project structure via file parsing (package manager, apps, ports, commands, tech stack)
3. CLI confirms inferred values with the user, asks about Jira + SonarQube (both default YES)
4. CLI copies generic core skill files into `.claude/skills/implement-app/`
5. CLI writes a `project.config.json` alongside them with all project-specific values
6. The skill's `SKILL.md` reads `project.config.json` at invocation time and substitutes `{{CONFIG.*}}` references

---

## Repo Structure

```
agent-bootstrap/                  ← this repo
├── bin/
│   └── bootstrap.js             ← CLI entry point (~300 lines, zero npm deps)
├── core/
│   └── implement-app/           ← generic skill ({{CONFIG.*}} substitutions)
│       ├── SKILL.md
│       ├── teams/
│       ├── pipelines/
│       ├── references/
│       └── templates/
├── docs/
│   └── design.md                ← full design spec
├── implement-app/               ← LOCAL REFERENCE ONLY — gitignored
│   ├── SKILL.md                 ← original <source-project> skill (source of truth for generalization)
│   ├── teams/
│   ├── pipelines/
│   ├── references/
│   └── templates/
├── .gitignore                   ← excludes implement-app/ and node_modules/
└── package.json
```

---

## Key Design Decisions

- **Distribution:** npm package, invoked via `npx agent-bootstrap@latest`
- **Output:** full skill directory copied into `.claude/skills/implement-app/` + `project.config.json`
- **Config model:** thin per-project `project.config.json`; core skill logic is versioned in the npm package
- **Monorepo/single-repo:** auto-detected; both supported
- **Integrations:** Jira and SonarQube are tiered opt-in (default YES); when disabled, skill conditionally omits those gates
- **Update path:** `--update` flag re-copies core files, preserves existing config
- **CLI deps:** zero npm dependencies — only Node.js built-ins (`fs`, `path`, `readline`, `child_process`)

---

## `project.config.json` Shape

```json
{
  "project": { "name": "...", "packageManager": "pnpm", "monorepo": true },
  "apps": [
    {
      "name": "admin",
      "path": "apps/admin",
      "port": 8000,
      "pnpmFilter": "@myco/admin",
      "devCommand": "pnpm run admin",
      "testCommand": "pnpm run test:admin",
      "lintCommand": "pnpm run --filter=@myco/admin lint:fix",
      "typecheckCommand": "pnpm run --filter=@myco/admin typecheck",
      "sonarPathPrefix": "apps/admin/src/"
    }
  ],
  "stack": { "framework": "react-admin", "buildTool": "vite", "testRunner": "vitest", "styling": "mui" },
  "integrations": {
    "jira": { "enabled": true, "baseUrl": "https://myco.atlassian.net", "projectKey": "PROJ" },
    "sonar": { "enabled": true, "projectKey": "myco_my-backoffice" }
  }
}
```

---

## What Needs To Be Built

1. **`bin/bootstrap.js`** — the CLI (Pass 1 file parsing, Pass 2 confirmation, Pass 3 integration prompts, file copy + config write)
2. **`core/implement-app/SKILL.md`** — generalized version of `implement-app/SKILL.md` with `{{CONFIG.*}}` substitutions and conditional `{{#if}}` blocks for Jira/SonarQube
3. **`core/implement-app/teams/`** — generalized team persona files
4. **`core/implement-app/pipelines/`** — generalized pipeline files
5. **`core/implement-app/references/`** — generalized reference docs (stack-agnostic)
6. **`core/implement-app/templates/`** — generic stubs (user replaces with project-specific ones)
7. **`package.json`** — with `bin` field pointing to `bin/bootstrap.js`, `type: "module"`

---

## Open Questions (from design.md)

1. Package name — `agent-bootstrap` is a placeholder, needs an available npm name
2. Config location — `project.config.json` inside skill dir vs `.claude/project.config.json`
3. Stack-specific reference docs — should bootstrap optionally generate stubs based on detected stack?
4. Auth state file paths for browser QA — omitted for now, add if Inspector Clouseau is included
5. `sonarPathPrefix` placement — per-app (current) vs global under `integrations.sonar`

---

## Dev Commands (once package.json exists)

```bash
node bin/bootstrap.js          # run CLI locally
node bin/bootstrap.js --update
node bin/bootstrap.js --reconfigure
```

---

## Notes for CLAUDE.md

- The `implement-app/` directory is a local reference only — never commit it, never modify it
- All generalization work happens in `core/implement-app/` — that's what gets published
- The CLI must have zero npm dependencies
- Keep `bin/bootstrap.js` under ~300 lines; split into `lib/` files if it grows
- Test manually against a real monorepo (pnpm + turbo) and a single-repo (npm) before releasing
