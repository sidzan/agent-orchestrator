# agent-bootstrap

Drop a project-tailored multi-agent orchestration skill into any **React (TypeScript)** or **C# / .NET** project, in one command.

```bash
npx agent-bootstrap@latest
```

The CLI inspects your project, asks a few questions, and writes a fresh, fully-rendered Claude Code skill into `.claude/skills/`. No template markers, no runtime config file, no surprises.

---

## What it installs

When you pick **frontend** (React/TS):

```
.claude/skills/
├── implement-app/         orchestrator (gates G0–G10, named team personas, pipelines, EDIT-ME architecture references)
├── jira-tracking/         shared support skill — creates Gherkin tickets, posts gate checkpoints
├── create-pull-request/   shared support skill — Bitbucket / GitHub PR workflow
└── sonar-fix/             shared support skill — SonarQube triage + fix
```

When you pick **backend** (C#):

```
.claude/skills/
├── implement-backend/     orchestrator (TDD-first, separate test-writer + implementer + verifier personas)
├── jira-tracking/
├── create-pull-request/
└── sonar-fix/
```

Optional, prompted at install:

- **`.claude/hooks/`** — `lint-on-save.sh`, `worktree-setup.sh`, `enforce-task-update.sh`
- **`.mcp.json.example`** — MCP servers used by the orchestrator (Atlassian + Bitbucket; Lokalise on frontend)

---

## How it works

1. **Detect** — silent file inspection. React detection looks at `package.json` deps, lockfiles, and workspace files (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, etc.). C# detection scans for `*.sln` and `*.csproj` recursively, and probes Flyway / EF Core to pick the right migration reference.
2. **Confirm** — print inferred values; you press Enter to accept or edit inline. Multi-app monorepos let you deselect apps you don't want covered.
3. **Integrations** — Jira (Y/n), SonarQube (Y/n), hooks (Y/n), MCP template (Y/n). All default to YES.
4. **Render** — install-time substitution. The CLI fills in your project's commands, paths, ports, and project keys, and conditionally omits gate steps for any integration you declined. Installed files are concrete and editable; they read like hand-written content.

If `.claude/skills/<name>/` already exists, the CLI **never overwrites or merges** — it asks for a new name (default suggestion `<name>-v2`) and cascades the rename through internal references.

---

## Stacks supported (v1)

| Stack | Detection | Output |
|---|---|---|
| React (TypeScript) | `package.json` + React deps + lockfile + optional workspace files | `implement-app` |
| C# / .NET | `*.sln` OR any `*.csproj` recursively; Flyway / EF Core probed | `implement-backend` |
| Mixed monorepo | Both signal sets in distinct directories | Both orchestrators; shared support skills written once |
| Anything else | — | **Hard abort** with detected-signal summary |

---

## After install

The CLI prints a tailored next-steps block. For frontend installs, it asks you to also install [Vercel's `agent-browser` skill](https://github.com/vercel-labs/agent-browser) which the Inspector Clouseau persona uses for browser QA:

```bash
npx skills add vercel-labs/agent-browser
npm i -g agent-browser
```

Then copy the generated `.mcp.json.example` to `.mcp.json` and fill in your secrets.

---

## Editing the skill

Installed skills are yours. Edit them. The architecture reference docs (`references/arch-*.md`) ship with **EDIT-ME** headers — they are starter patterns derived from a React-Admin + OData project; replace the contents with your stack's conventions. The orchestrator's contract is "agents read `arch-list-patterns.md` before implementing a list view" — keep that contract, change the contents.

---

## Updates

There is no `--update` mode in v1. To pull in newer templates, re-run `npx agent-bootstrap@latest`. The rename-on-conflict policy gives you a fresh `<name>-v2/` you can hand-merge with your old install.

---

## Constraints

- Zero npm dependencies. Pure Node.js (`fs`, `path`, `readline`, `child_process`).
- `bin/bootstrap.js` stays small (~300 lines); logic that overflows lives in `lib/`.

---

## Repo layout

```
agent-bootstrap/
├── bin/bootstrap.js
├── lib/
│   ├── detect.js          stack detection
│   ├── prompts.js         readline prompts
│   ├── substitute.js      {{CONFIG.*}} + {{#if}} renderer
│   └── install.js         file copy + write
├── templates/
│   ├── frontend/implement-app/
│   ├── backend/implement-backend/
│   ├── shared/{jira-tracking, create-pull-request, sonar-fix}/
│   ├── hooks/{lint-on-save, worktree-setup, enforce-task-update}.sh
│   └── mcp/mcp.json.example.{frontend,backend}
└── docs/design.md         design spec (authoritative)
```

---

## License

MIT.
