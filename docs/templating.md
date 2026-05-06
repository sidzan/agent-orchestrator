# Templating Guide

How the kernel templates are authored, validated, and rendered. Read this before editing anything under `templates/`.

---

## TL;DR

```bash
npm test    # before every commit. Runs lint + snapshot tests.
```

The lint catches:
- `{{CONFIG.x.y}}` markers that aren't declared in `lib/schema.js`
- Banned literals (`pnpm test`, `Flow24`, `Resources.ts`, `apps/admin`, etc.)
- Deprecated markers (`<!-- DISCOVER`, `EDIT-ME`, `<UNSET:`)

Snapshot tests render every template against four canonical configs (npm-single, pnpm-monorepo, dotnet-flyway, dotnet-efcore) and compare to known-good output. Drift fails the test.

---

## The schema

`lib/schema.js` is the single source of truth for the variable shape. Every `{{CONFIG.x.y}}` marker a template can use MUST be declared here.

```js
const SCHEMA = {
  "project.name":           { type: "string", source: "cwd-basename", required: true },
  "project.packageManager": { type: "enum",   values: ["npm","pnpm","yarn","bun","none"], required: true },
  "commands.test":          { type: "string", source: "computed", required: true,
                              description: "Project-wide test command" },
  "integrations.jira.projectKey": { type: "string", source: "prompted",
                                    requiredWhen: "integrations.jira.enabled" },
  ...
};
```

Fields:

| Field          | Meaning |
|----------------|---------|
| `type`         | `string`, `number`, `boolean`, `enum`, `array`, `object` |
| `source`       | Informational: where the value comes from at install time (cwd-basename, lockfile-detected, package-json, prompted, computed, internal) |
| `required`     | Always required to be present in config |
| `requiredWhen` | Path to a boolean elsewhere in CONFIG; required only when that path is true |
| `default`      | Fallback used by detection if no value is found |
| `values`       | For `enum` types, the allowed values |
| `description`  | One-line human prose. Goes in the author docs. |
| `itemShape`    | For `array` types, the shape of each element |

### Marker syntax in templates

```markdown
The test command is `{{CONFIG.commands.test}}`.

{{#if CONFIG.integrations.jira.enabled}}
This block is only rendered when Jira is enabled.
The project key is `{{CONFIG.integrations.jira.projectKey}}`.
{{#else}}
Jira integration is disabled.
{{/if}}

The first app's path is `{{CONFIG.apps[0].path}}`.
```

- Value markers: `{{CONFIG.x.y.z}}` or `{{CONFIG.apps[0].field}}`
- Conditionals: `{{#if CONFIG.x.enabled}}…{{/if}}` or with `{{#else}}` branch
- Conditionals can be nested

### When a marker is gated

If a marker's schema declares `requiredWhen: "integrations.jira.enabled"`, and at install time `integrations.jira.enabled` is `false`, the renderer substitutes a visible placeholder like `(jira-disabled)` rather than crashing.

This means **a template can use a Jira marker outside an `{{#if}}` block** and the install will not fail when Jira is disabled — it'll just render the placeholder.

That said, prefer wrapping integration-specific *content* in `{{#if}}` blocks: it produces cleaner output for users who declined the integration.

---

## Banned literals

These cannot appear in `templates/`. The linter rejects them.

### Source-project leaks (highest priority)

These were the cause of every "wtf" bug in the v0.2 era. They cannot ship to anyone, ever.

| Banned | Why |
|--------|-----|
| `Flow24`, `flow24` | Source-project name |
| `Retail24`, `retail24` | Source-project name |
| `RT24` | Source-project Jira key |
| `apphuset` | Source-project Bitbucket workspace |
| `7peakssoftware` | Source-project Atlassian site |
| `ICPlan_*` | Source-project multi-region DB pattern |

### React-Admin / OData specifics

These leak the source project's frontend stack. Use `{{CONFIG.commands.*}}` and `{{CONFIG.apps[0].path}}`, or stack-agnostic prose.

| Banned | Replacement |
|--------|-------------|
| `Resources.X` (enum reference) | "the resource registration site" |
| `ListPageContainer` | "the project's list-page wrapper" |
| `DatagridConfigurable` | "the project's datagrid component" |
| `useDataProvider` | "the data-fetching layer" (one exception: `templates/frontend/implement-app/teams/implementer.md` uses it as an illustrative example) |
| `operationCountry` | (project-specific concept; do not appear) |
| `_eq` (filter suffix) | (OData-specific; do not appear) |

### .NET source-project specifics

| Banned | Why |
|--------|-----|
| `BackOffice.Api`, `FieldEmployee.Api`, `Customer.Api` | Source-project namespaces |
| `Flow24.Workers.*` | Source-project namespace |
| `AddBackOfficeApplicationServices`, `BuildBackOfficeEdm` | Source-project DI methods |

### Hardcoded package-manager commands

Use `{{CONFIG.commands.*}}` instead.

| Banned | Replacement |
|--------|-------------|
| `pnpm run X`, `pnpm test`, `pnpm install` | `{{CONFIG.commands.X}}` |
| `npm run X`, `npm test` | `{{CONFIG.commands.X}}` (one exception: `bin/bootstrap.js` uses `npm i -g agent-browser` literally — it's a real command, not project-specific) |
| `yarn run X`, `yarn test` | `{{CONFIG.commands.X}}` |
| `bun test` | `{{CONFIG.commands.test}}` |

### Hardcoded test runners (when used as a command)

| Banned | Replacement |
|--------|-------------|
| `vitest` (as command, e.g. `$ vitest`) | `{{CONFIG.commands.test}}` |
| `jest` (as command) | `{{CONFIG.commands.test}}` |
| `dotnet test` | `{{CONFIG.commands.test}}` (exception: `templates/mcp/` and `lib/` may reference it descriptively) |

The names of these tools (e.g. "vitest tests" as a noun phrase) are fine. Only command-line invocations are banned.

### Stack-shape assumptions

| Banned | Replacement |
|--------|-------------|
| `apps/admin`, `apps/employee`, `apps/customer` | `{{CONFIG.apps[0].path}}` |
| `packages/ui` | "the shared component library" or `{{CONFIG.apps[0].path}}/...` |
| `@yourorg/X`, `@flow24/X` | `{{CONFIG.apps[0].pnpmFilter}}` or stack-agnostic prose |

### Deprecated markers (from earlier architectures)

| Banned | Why |
|--------|-----|
| `<!-- EDIT-ME -->` | The previous architecture shipped EDIT-ME starter files. References are now derived at install time, not hand-edited stubs. |
| `<!-- DISCOVER:id ... -->` | The previous section-level discovery mechanism. Replaced by `lib/discover.js` `FRONTEND/BACKEND_DISCOVERIES`. |
| `<UNSET:...>` | Render-leak sentinel — should never appear in source. |

---

## How to add a new variable

Say you want to add `{{CONFIG.project.repoUrl}}` (e.g. for the post-install message to print a link).

1. **Declare it in `lib/schema.js`:**
   ```js
   "project.repoUrl": { type: "string", source: "git-config-detected", required: false,
                        description: "Repo URL parsed from `git remote get-url origin`" },
   ```

2. **Populate it in detection** (e.g. `lib/detect.js`) and/or in the config builders inside `bin/bootstrap.js`.

3. **Use it in templates** — `{{CONFIG.project.repoUrl}}`. The linter will pass; the renderer will substitute.

4. **Run `npm test`.** If you forgot to populate it, the snapshot test will fail with `<UNSET:CONFIG.project.repoUrl>`.

5. **Update snapshots** if intentional: `npm run test:snapshot:update`.

---

## How to add a new template file

1. Drop it under `templates/<frontend|backend|shared|hooks|mcp>/<...>/`.
2. Use only `{{CONFIG.x}}` markers declared in the schema.
3. Avoid banned literals — the linter will tell you on `npm test`.
4. Run `npm test`. If it passes, commit.

---

## How to add a new discovery target

`lib/discover.js` has two static lists: `FRONTEND_DISCOVERIES` and `BACKEND_DISCOVERIES`. Each entry is `{ filename, instruction }`. Adding a new entry adds it to the per-stack discovery prompt.

```js
{
  filename: "patterns/auth.md",
  instruction:
    "Find: how the codebase handles authentication. Output: a markdown reference with concrete file paths and a short canonical example. If no auth exists, return \"FALLBACK\".",
}
```

The bootstrap CLI sends all entries in one Claude call; Claude returns a `{filename: content}` map; non-FALLBACK entries are written under `<skillDir>/references/<filename>`.

No template or schema change is required to add a discovery target — the `references/` directory is populated dynamically.

---

## CI / pre-commit

Recommended: add `npm test` as a pre-commit hook (e.g. via `husky` or a vanilla Git hook). CI should run `npm test` on every PR.

The repo deliberately ships zero npm dependencies — the linter and snapshot test are pure Node. Whatever pre-commit / CI infrastructure the user prefers can drive `npm test`.
