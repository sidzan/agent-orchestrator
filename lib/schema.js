"use strict";

/**
 * The declared shape of CONFIG.
 *
 * Every {{CONFIG.x.y.z}} marker a kernel template can reference MUST be
 * declared here. The template linter rejects unknown paths; the renderer
 * rejects configs that don't satisfy this schema before any file is written.
 *
 * `type`         — the value's expected JS type
 * `source`       — where the value comes from at install time (informational)
 * `required`     — boolean: must always be present
 * `requiredWhen` — path to a boolean elsewhere in CONFIG; required only when that path is truthy
 * `default`      — fallback if the source produces nothing
 * `values`       — for `enum` types, the allowed values
 * `description`  — one-line human prose for the author guide
 * `itemShape`    — for `array`, the shape of each element (recursive sub-schema)
 */

const SCHEMA = {
  // ── Project metadata ────────────────────────────────────────────────────
  "project.name":           { type: "string",  source: "cwd-basename",         required: true,
                              description: "Project name (defaults to repo dir basename)" },
  "project.packageManager": { type: "enum",    source: "lockfile-detected",    required: true,
                              values: ["npm", "pnpm", "yarn", "bun", "none"],
                              description: "JS package manager (or 'none' for non-JS projects)" },
  "project.monorepo":       { type: "boolean", source: "workspace-detected",   required: true,
                              description: "True when pnpm-workspace.yaml / turbo.json / nx.json / workspaces is present" },

  // ── Apps (array; one entry per JS app, or one entry with path '.' for single-repo) ─
  "apps":                   { type: "array",   source: "workspace-detected",   required: false,
                              description: "Detected JS apps. Empty array for backend-only projects.",
                              itemShape: {
                                "name":             { type: "string", required: true },
                                "path":             { type: "string", required: true },
                                "port":             { type: "number", required: false, default: 3000 },
                                "pnpmFilter":       { type: "string", required: false },
                                "devCommand":       { type: "string", required: true },
                                "testCommand":      { type: "string", required: true },
                                "lintCommand":      { type: "string", required: true },
                                "typecheckCommand": { type: "string", required: true },
                                "buildCommand":     { type: "string", required: true },
                                "sonarPathPrefix":  { type: "string", required: false },
                              }},

  // ── Project-wide command shorthands (computed from primary app or backend defaults) ─
  "commands.dev":           { type: "string", source: "computed", required: true,
                              description: "Project's dev command (e.g. 'pnpm run admin' / 'dotnet run')" },
  "commands.test":          { type: "string", source: "computed", required: true,
                              description: "Project-wide test command" },
  "commands.lint":          { type: "string", source: "computed", required: true,
                              description: "Project-wide lint/format command" },
  "commands.typecheck":     { type: "string", source: "computed", required: true,
                              description: "Project-wide typecheck command (use 'commands.build' if no separate typecheck)" },
  "commands.build":         { type: "string", source: "computed", required: true,
                              description: "Project-wide build command" },

  // ── Stack metadata (frontend-only, optional) ────────────────────────────
  "stack.framework":        { type: "string",  source: "package-json-deps", required: false,
                              description: "Detected framework (react / react-admin / next / vue / angular / null)" },
  "stack.buildTool":        { type: "string",  source: "package-json-deps", required: false },
  "stack.testRunner":       { type: "string",  source: "package-json-deps", required: false },
  "stack.styling":          { type: "string",  source: "package-json-deps", required: false },

  // ── Backend metadata (C#-only, optional) ─────────────────────────────────
  "backend.solutionPath":   { type: "string",  source: "detected", required: false,
                              description: "Path to the .sln file relative to repo root" },
  "backend.projectName":    { type: "string",  source: "detected", required: false,
                              description: "Backend project name (from .sln basename)" },
  "backend.srcPath":        { type: "string",  source: "detected", required: false,
                              description: "Where C# source lives (e.g. 'src' or '.')" },
  "backend.testsPath":      { type: "string",  source: "detected", required: false,
                              description: "Where C# tests live, if a tests/ dir exists" },
  "backend.csprojCount":    { type: "number",  source: "detected", required: false },
  "backend.migrationTool":  { type: "enum",    source: "detected-or-prompted", required: false,
                              values: ["flyway", "efcore", "none"],
                              description: "Backend migration tool" },

  // ── Integrations: Jira ──────────────────────────────────────────────────
  "integrations.jira.enabled":    { type: "boolean", source: "prompted", required: true,
                                    description: "True if Jira integration was opted into" },
  "integrations.jira.baseUrl":    { type: "string",  source: "prompted",
                                    requiredWhen: "integrations.jira.enabled",
                                    description: "Atlassian base URL (e.g. https://yourco.atlassian.net)" },
  "integrations.jira.projectKey": { type: "string",  source: "prompted",
                                    requiredWhen: "integrations.jira.enabled",
                                    description: "Jira project key (e.g. PROJ)" },

  // ── Integrations: SonarQube ─────────────────────────────────────────────
  "integrations.sonar.enabled":    { type: "boolean", source: "prompted", required: true },
  "integrations.sonar.projectKey": { type: "string",  source: "prompted",
                                     requiredWhen: "integrations.sonar.enabled",
                                     description: "SonarQube project key" },

  // ── Browser QA (Inspector Clouseau) ──────────────────────────────────────
  "browserQA.enabled":         { type: "boolean", source: "computed", required: true,
                                 description: "True for frontend installs (Inspector Clouseau is unconditional)" },
  "browserQA.authStatePath":   { type: "string",  source: "prompted",
                                 requiredWhen: "browserQA.enabled",
                                 description: "Where agent-browser persists auth state (e.g. ~/.agent-browser)" },

  // ── Internal (set by the renderer at install time, not by config builders) ─
  "_resolvedSkillName":     { type: "string", source: "internal", required: false,
                              description: "The actual installed skill directory name after rename-on-conflict" },
};

// ── Helpers ────────────────────────────────────────────────────────────────

const MARKER_RE = /\{\{\s*(CONFIG(?:\.[\w$]+|\[\d+\])+)\s*\}\}/g;

/** Extract every {{CONFIG.x}} marker path from a string. Used by the linter. */
function enumerateMarkers(text) {
  const out = new Set();
  let m;
  // Reset lastIndex for safety
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(text)) !== null) {
    out.add(m[1]);
  }
  return [...out];
}

/** Normalize a marker path like CONFIG.apps[0].path → "apps.path" for schema lookup. */
function schemaPathOf(markerPath) {
  return markerPath
    .replace(/^CONFIG\.?/, "")
    .replace(/\[\d+\]/g, "")    // strip array indices for schema lookup
    .replace(/\[(\w+)\]/g, "$1") // bracket-name → dot-name (rare)
    .replace(/\.\./g, ".");
}

/** Check whether a marker path is declared. Handles array item paths like apps[0].name. */
function isDeclared(markerPath) {
  // Direct match: "project.name" → SCHEMA["project.name"]
  const direct = schemaPathOf(markerPath);
  if (SCHEMA[direct]) return true;

  // Array item: marker is "apps[0].name" → schema check "apps" + itemShape "name"
  const arrayMatch = markerPath.match(/^CONFIG\.([\w$]+)\[\d+\]\.(.+)$/);
  if (arrayMatch) {
    const [, arrName, sub] = arrayMatch;
    const arr = SCHEMA[arrName];
    if (arr && arr.type === "array" && arr.itemShape) {
      // sub may be a single field or a nested dotted path
      const subTop = sub.split(".")[0];
      if (arr.itemShape[subTop]) return true;
    }
  }
  return false;
}

/** Resolve a marker path against a config object. */
function resolveMarker(config, markerPath) {
  const parts = markerPath
    .replace(/^CONFIG\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur = config;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Get a value at a dotted path from a config object (for `requiredWhen` checks). */
function getByPath(obj, path) {
  return resolveMarker(obj, "CONFIG." + path);
}

/** Validate a config object against the schema. Returns { ok, errors }. */
function validate(config) {
  const errors = [];

  for (const [path, decl] of Object.entries(SCHEMA)) {
    const value = getByPath(config, path);
    const isMissing = value === undefined || value === null;

    // Determine if this path is required
    let required = !!decl.required;
    if (!required && decl.requiredWhen) {
      required = !!getByPath(config, decl.requiredWhen);
    }

    if (isMissing) {
      if (required) {
        errors.push({ path, kind: "missing", message: `required CONFIG.${path} is missing` });
      }
      continue;
    }

    // Type check
    const ok = checkType(value, decl);
    if (!ok) {
      errors.push({
        path,
        kind: "type",
        message: `CONFIG.${path} has wrong type: expected ${describeType(decl)}, got ${typeof value}${Array.isArray(value) ? " (array)" : ""}`,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

function checkType(value, decl) {
  switch (decl.type) {
    case "string":  return typeof value === "string";
    case "number":  return typeof value === "number" && !Number.isNaN(value);
    case "boolean": return typeof value === "boolean";
    case "enum":    return typeof value === "string" && decl.values.includes(value);
    case "array":   return Array.isArray(value);
    case "object":  return value && typeof value === "object" && !Array.isArray(value);
    default:        return true;
  }
}

function describeType(decl) {
  if (decl.type === "enum") return `enum<${decl.values.join("|")}>`;
  return decl.type;
}

module.exports = {
  SCHEMA,
  enumerateMarkers,
  isDeclared,
  resolveMarker,
  validate,
  schemaPathOf,
};
