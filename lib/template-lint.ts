#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { enumerateMarkers, isDeclared } from "./schema";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates");
const SCAN_ROOTS = [TEMPLATES_DIR];

const TEXT_EXTS = new Set([".md", ".sh", ".tsx", ".ts", ".js", ".jsx", ".cs", ".sql", ".yml", ".yaml", ".json", ".example"]);
const SKIP_DIRS = new Set([".git", "node_modules"]);

interface BannedRule {
  regex: RegExp;
  kind: string;
  message: string;
  exceptions?: string[];
}

const BANNED: BannedRule[] = [
  { regex: /\bFlow24\b/,         kind: "source-project", message: "Source-project name 'Flow24' must not appear in templates" },
  { regex: /\bflow24\b/,         kind: "source-project", message: "'flow24' must not appear in templates" },
  { regex: /\bRetail24\b/,       kind: "source-project", message: "'Retail24' must not appear in templates" },
  { regex: /\bretail24\b/,       kind: "source-project", message: "'retail24' must not appear in templates" },
  { regex: /\bRT24\b/,           kind: "source-project", message: "Source-project Jira key 'RT24' must not appear (use {{CONFIG.integrations.jira.projectKey}})" },
  { regex: /\bapphuset\b/,       kind: "source-project", message: "'apphuset' workspace name must not appear" },
  { regex: /\b7peakssoftware\b/, kind: "source-project", message: "'7peakssoftware' must not appear" },
  { regex: /\bICPlan_/,          kind: "source-project", message: "Multi-region DB pattern 'ICPlan_*' must not appear" },

  { regex: /\bResources\.\w+/,        kind: "react-admin", message: "'Resources.X' enum reference must not appear (React-Admin specific)" },
  { regex: /\bListPageContainer\b/,   kind: "react-admin", message: "'ListPageContainer' must not appear (project-specific component)" },
  { regex: /\bDatagridConfigurable\b/,kind: "react-admin", message: "'DatagridConfigurable' must not appear" },
  { regex: /\buseDataProvider\b/,     kind: "react-admin", message: "'useDataProvider' must not appear (project-specific hook)",
    exceptions: ["templates/frontend/implement-app/teams/implementer.md"] },
  { regex: /\boperationCountry\b/,    kind: "react-admin", message: "'operationCountry' must not appear" },
  { regex: /_eq\b/,                   kind: "react-admin", message: "OData '_eq' filter suffix must not appear" },

  { regex: /\bBackOffice\.Api\b/,       kind: "dotnet-leak", message: "'BackOffice.Api' source-project namespace must not appear" },
  { regex: /\bFieldEmployee\.Api\b/,    kind: "dotnet-leak", message: "'FieldEmployee.Api' source-project namespace must not appear" },
  { regex: /\bCustomer\.Api\b/,         kind: "dotnet-leak", message: "'Customer.Api' source-project namespace must not appear" },
  { regex: /\bFlow24\.Workers\.\w+/,    kind: "dotnet-leak", message: "'Flow24.Workers.*' must not appear" },
  { regex: /\bAddBackOfficeApplicationServices\b/, kind: "dotnet-leak", message: "Source-project DI method must not appear" },
  { regex: /\bBuildBackOfficeEdm\b/,    kind: "dotnet-leak", message: "Source-project EDM method must not appear" },

  { regex: /\bpnpm run \w/,    kind: "hardcoded-pm", message: "Hardcoded 'pnpm run X' — use {{CONFIG.commands.X}}" },
  { regex: /\bpnpm test\b/,    kind: "hardcoded-pm", message: "Hardcoded 'pnpm test' — use {{CONFIG.commands.test}}" },
  { regex: /\bnpm run \w/,     kind: "hardcoded-pm", message: "Hardcoded 'npm run X' — use {{CONFIG.commands.X}}",
    exceptions: ["bin/bootstrap.js", "bin/bootstrap.ts"] },
  { regex: /\bnpm test\b/,     kind: "hardcoded-pm", message: "Hardcoded 'npm test' — use {{CONFIG.commands.test}}" },
  { regex: /\byarn run \w/,    kind: "hardcoded-pm", message: "Hardcoded 'yarn run X' — use {{CONFIG.commands.X}}" },
  { regex: /\byarn test\b/,    kind: "hardcoded-pm", message: "Hardcoded 'yarn test' — use {{CONFIG.commands.test}}" },
  { regex: /\bbun test\b/,     kind: "hardcoded-pm", message: "Hardcoded 'bun test' — use {{CONFIG.commands.test}}" },

  { regex: /^\s*\$?\s*vitest\b/m,  kind: "hardcoded-runner", message: "Hardcoded 'vitest' command — use {{CONFIG.commands.test}}" },
  { regex: /^\s*\$?\s*jest\b/m,    kind: "hardcoded-runner", message: "Hardcoded 'jest' command — use {{CONFIG.commands.test}}" },
  { regex: /\bdotnet test\b/,      kind: "hardcoded-runner", message: "Hardcoded 'dotnet test' — use {{CONFIG.commands.test}}",
    exceptions: ["templates/mcp/", "lib/"] },

  { regex: /\bapps\/admin\b/,     kind: "stack-leak", message: "'apps/admin' source-project path — use {{CONFIG.apps[0].path}}" },
  { regex: /\bapps\/employee\b/,  kind: "stack-leak", message: "'apps/employee' source-project path" },
  { regex: /\bapps\/customer\b/,  kind: "stack-leak", message: "'apps/customer' source-project path" },
  { regex: /\bpackages\/ui\b/,    kind: "stack-leak", message: "'packages/ui' source-project path" },
  { regex: /@yourorg\/\w/,        kind: "stack-leak", message: "'@yourorg/X' placeholder import — should be {{CONFIG.apps[0].pnpmFilter}} or stack-agnostic prose" },
  { regex: /@flow24\/\w/,         kind: "stack-leak", message: "'@flow24/X' source-project import" },

  { regex: /<!--\s*EDIT-ME\s*-->/,    kind: "deprecated", message: "EDIT-ME marker is from the previous architecture" },
  { regex: /<!--\s*DISCOVER:/,        kind: "deprecated", message: "DISCOVER tag mechanism was removed in v0.3" },
  { regex: /<UNSET:/,                 kind: "render-leak", message: "<UNSET:...> sentinel found in template (render bug)" },
];

interface LintError {
  file: string;
  line?: number;
  kind: string;
  message: string;
  excerpt?: string;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else if (TEXT_EXTS.has(path.extname(e.name)) || e.name.endsWith(".example")) {
      out.push(full);
    }
  }
  return out;
}

function relativize(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).replace(/\\/g, "/");
}

function isExempt(relPath: string, exceptions?: string[]): boolean {
  if (!exceptions) return false;
  return exceptions.some((ex) => relPath === ex || relPath.startsWith(ex.replace(/\/$/, "/")));
}

function lintFile(absPath: string): LintError[] {
  const errors: LintError[] = [];
  const relPath = relativize(absPath);
  let content: string;
  try {
    content = fs.readFileSync(absPath, "utf8");
  } catch {
    return [];
  }

  const markers = enumerateMarkers(content);
  for (const m of markers) {
    if (!isDeclared(m)) {
      errors.push({
        file: relPath,
        kind: "unknown-marker",
        message: `Unknown CONFIG path: {{${m}}} — declare it in lib/schema.ts`,
      });
    }
  }

  for (const ban of BANNED) {
    if (isExempt(relPath, ban.exceptions)) continue;
    const lines = content.split("\n");
    lines.forEach((line: string, i: number) => {
      if (ban.regex.test(line)) {
        errors.push({
          file: relPath,
          line: i + 1,
          kind: ban.kind,
          message: ban.message,
          excerpt: line.trim().slice(0, 120),
        });
      }
    });
  }

  return errors;
}

function main(): void {
  const files = SCAN_ROOTS.flatMap((r) => walk(r));
  const allErrors = files.flatMap(lintFile);

  if (allErrors.length === 0) {
    console.log(`✓ template-lint: ${files.length} files scanned, 0 issues`);
    process.exit(0);
  }

  const byKind: Record<string, LintError[]> = {};
  for (const e of allErrors) {
    (byKind[e.kind] ||= []).push(e);
  }

  console.error(`✗ template-lint: ${allErrors.length} issue(s) across ${files.length} files\n`);
  for (const [kind, list] of Object.entries(byKind)) {
    console.error(`── ${kind} (${list.length}) ──`);
    for (const e of list) {
      const loc = e.line ? `${e.file}:${e.line}` : e.file;
      console.error(`  ${loc}`);
      console.error(`    ${e.message}`);
      if (e.excerpt) console.error(`    │ ${e.excerpt}`);
    }
    console.error("");
  }
  process.exit(1);
}

if (require.main === module) main();

export { lintFile, walk, BANNED };
