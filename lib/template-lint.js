#!/usr/bin/env node
"use strict";

/**
 * Template linter.
 *
 * Walks templates/ and the kernel skill files. For each text file:
 *   1. Extracts {{CONFIG.x.y}} markers and cross-checks against lib/schema.js.
 *      Unknown paths fail the lint.
 *   2. Greps for banned literals (project-shape leaks). The full list is below.
 *      Banned literals fail the lint unless explicitly listed in EXCEPTIONS.
 *   3. Flags deprecated markers (<!-- DISCOVER, EDIT-ME, <UNSET:).
 *
 * Run: `node lib/template-lint.js`. Exits 0 (clean) or 1 (issues found).
 *
 * The set of banned literals is curated to catch leaks *we have actually
 * shipped before* — every entry corresponds to a real bug from the v0.2 era.
 */

const fs = require("fs");
const path = require("path");
const { enumerateMarkers, isDeclared } = require("./schema");

const REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates");

// Files / paths the lint walks. Anything outside these trees is ignored.
const SCAN_ROOTS = [TEMPLATES_DIR];

const TEXT_EXTS = new Set([".md", ".sh", ".tsx", ".ts", ".js", ".jsx", ".cs", ".sql", ".yml", ".yaml", ".json", ".example"]);
const SKIP_DIRS = new Set([".git", "node_modules"]);

// ── Banned literals ────────────────────────────────────────────────────────
//
// Each entry: { regex, kind, message, exceptions: [glob-style file path matchers] }
//
// `regex` is matched against the raw file content. `exceptions` are file paths
// (relative to repo root) where the literal is allowed for legitimate reasons.

const BANNED = [
  // Source-project proper nouns (highest priority — these can't ever ship)
  { regex: /\bFlow24\b/,         kind: "source-project", message: "Source-project name 'Flow24' must not appear in templates" },
  { regex: /\bflow24\b/,         kind: "source-project", message: "'flow24' must not appear in templates" },
  { regex: /\bRetail24\b/,       kind: "source-project", message: "'Retail24' must not appear in templates" },
  { regex: /\bretail24\b/,       kind: "source-project", message: "'retail24' must not appear in templates" },
  { regex: /\bRT24\b/,           kind: "source-project", message: "Source-project Jira key 'RT24' must not appear (use {{CONFIG.integrations.jira.projectKey}})" },
  { regex: /\bapphuset\b/,       kind: "source-project", message: "'apphuset' workspace name must not appear" },
  { regex: /\b7peakssoftware\b/, kind: "source-project", message: "'7peakssoftware' must not appear" },
  { regex: /\bICPlan_/,          kind: "source-project", message: "Multi-region DB pattern 'ICPlan_*' must not appear" },

  // React-Admin / OData specifics
  { regex: /\bResources\.\w+/,        kind: "react-admin", message: "'Resources.X' enum reference must not appear (React-Admin specific)" },
  { regex: /\bListPageContainer\b/,   kind: "react-admin", message: "'ListPageContainer' must not appear (project-specific component)" },
  { regex: /\bDatagridConfigurable\b/,kind: "react-admin", message: "'DatagridConfigurable' must not appear" },
  { regex: /\buseDataProvider\b/,     kind: "react-admin", message: "'useDataProvider' must not appear (project-specific hook)",
    exceptions: ["templates/frontend/implement-app/teams/implementer.md"] },  // OK as illustrative example
  { regex: /\boperationCountry\b/,    kind: "react-admin", message: "'operationCountry' must not appear" },
  { regex: /_eq\b/,                   kind: "react-admin", message: "OData '_eq' filter suffix must not appear" },

  // .NET source-project specifics
  { regex: /\bBackOffice\.Api\b/,       kind: "dotnet-leak", message: "'BackOffice.Api' source-project namespace must not appear" },
  { regex: /\bFieldEmployee\.Api\b/,    kind: "dotnet-leak", message: "'FieldEmployee.Api' source-project namespace must not appear" },
  { regex: /\bCustomer\.Api\b/,         kind: "dotnet-leak", message: "'Customer.Api' source-project namespace must not appear" },
  { regex: /\bFlow24\.Workers\.\w+/,    kind: "dotnet-leak", message: "'Flow24.Workers.*' must not appear" },
  { regex: /\bAddBackOfficeApplicationServices\b/, kind: "dotnet-leak", message: "Source-project DI method must not appear" },
  { regex: /\bBuildBackOfficeEdm\b/,    kind: "dotnet-leak", message: "Source-project EDM method must not appear" },

  // Hardcoded package-manager commands (use {{CONFIG.commands.*}} instead)
  // Note: a bare 'pnpm' word can be valid prose ("install via pnpm"); we only flag commands.
  { regex: /\bpnpm run \w/,    kind: "hardcoded-pm", message: "Hardcoded 'pnpm run X' — use {{CONFIG.commands.X}}" },
  { regex: /\bpnpm test\b/,    kind: "hardcoded-pm", message: "Hardcoded 'pnpm test' — use {{CONFIG.commands.test}}" },
  { regex: /\bnpm run \w/,     kind: "hardcoded-pm", message: "Hardcoded 'npm run X' — use {{CONFIG.commands.X}}",
    exceptions: ["bin/bootstrap.js"] },  // post-install message OK
  { regex: /\bnpm test\b/,     kind: "hardcoded-pm", message: "Hardcoded 'npm test' — use {{CONFIG.commands.test}}" },
  { regex: /\byarn run \w/,    kind: "hardcoded-pm", message: "Hardcoded 'yarn run X' — use {{CONFIG.commands.X}}" },
  { regex: /\byarn test\b/,    kind: "hardcoded-pm", message: "Hardcoded 'yarn test' — use {{CONFIG.commands.test}}" },
  { regex: /\bbun test\b/,     kind: "hardcoded-pm", message: "Hardcoded 'bun test' — use {{CONFIG.commands.test}}" },

  // Hardcoded test runners (when used as a command, not a concept)
  { regex: /^\s*\$?\s*vitest\b/m,  kind: "hardcoded-runner", message: "Hardcoded 'vitest' command — use {{CONFIG.commands.test}}" },
  { regex: /^\s*\$?\s*jest\b/m,    kind: "hardcoded-runner", message: "Hardcoded 'jest' command — use {{CONFIG.commands.test}}" },
  { regex: /\bdotnet test\b/,      kind: "hardcoded-runner", message: "Hardcoded 'dotnet test' — use {{CONFIG.commands.test}}",
    exceptions: ["templates/mcp/", "lib/"] }, // OK in template comment / detection code

  // Stack-shape assumptions
  { regex: /\bapps\/admin\b/,     kind: "stack-leak", message: "'apps/admin' source-project path — use {{CONFIG.apps[0].path}}" },
  { regex: /\bapps\/employee\b/,  kind: "stack-leak", message: "'apps/employee' source-project path" },
  { regex: /\bapps\/customer\b/,  kind: "stack-leak", message: "'apps/customer' source-project path" },
  { regex: /\bpackages\/ui\b/,    kind: "stack-leak", message: "'packages/ui' source-project path" },
  { regex: /@yourorg\/\w/,        kind: "stack-leak", message: "'@yourorg/X' placeholder import — should be {{CONFIG.apps[0].pnpmFilter}} or stack-agnostic prose" },
  { regex: /@flow24\/\w/,         kind: "stack-leak", message: "'@flow24/X' source-project import" },

  // Deprecated / hand-edit markers
  { regex: /<!--\s*EDIT-ME\s*-->/,    kind: "deprecated", message: "EDIT-ME marker is from the previous architecture — references are now derived, not hand-edited stubs" },
  { regex: /<!--\s*DISCOVER:/,        kind: "deprecated", message: "DISCOVER tag mechanism was removed in v0.3 — use lib/discover.js FRONTEND/BACKEND_DISCOVERIES instead" },
  { regex: /<UNSET:/,                 kind: "render-leak", message: "<UNSET:...> sentinel found in template — this means a marker rendered into a template file (bug)" },
];

// ── Walker ─────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
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

function relativize(absPath) {
  return path.relative(REPO_ROOT, absPath).replace(/\\/g, "/");
}

function isExempt(relPath, exceptions) {
  if (!exceptions) return false;
  return exceptions.some((ex) => relPath === ex || relPath.startsWith(ex.replace(/\/$/, "/")));
}

function lintFile(absPath) {
  const errors = [];
  const relPath = relativize(absPath);
  let content;
  try {
    content = fs.readFileSync(absPath, "utf8");
  } catch {
    return [];
  }

  // 1. Marker validation
  const markers = enumerateMarkers(content);
  for (const m of markers) {
    if (!isDeclared(m)) {
      errors.push({
        file: relPath,
        kind: "unknown-marker",
        message: `Unknown CONFIG path: {{${m}}} — declare it in lib/schema.js`,
      });
    }
  }

  // 2. Banned literals
  for (const ban of BANNED) {
    if (isExempt(relPath, ban.exceptions)) continue;
    const lines = content.split("\n");
    lines.forEach((line, i) => {
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

function main() {
  const files = SCAN_ROOTS.flatMap((r) => walk(r));
  const allErrors = files.flatMap(lintFile);

  if (allErrors.length === 0) {
    console.log(`✓ template-lint: ${files.length} files scanned, 0 issues`);
    process.exit(0);
  }

  // Group by kind for readable output
  const byKind = {};
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

module.exports = { lintFile, walk, BANNED };
