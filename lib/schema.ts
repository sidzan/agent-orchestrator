/**
 * The declared shape of CONFIG.
 *
 * Every {{CONFIG.x.y.z}} marker a kernel template can reference MUST be
 * declared here. The template linter rejects unknown paths; the renderer
 * rejects configs that don't satisfy this schema before any file is written.
 */

export type SchemaType = "string" | "number" | "boolean" | "enum" | "array" | "object";

export interface FieldDecl {
  type: SchemaType;
  source?: string;
  required?: boolean;
  requiredWhen?: string;
  default?: unknown;
  values?: readonly string[];
  description?: string;
  itemShape?: Record<string, FieldDecl>;
}

export type Schema = Record<string, FieldDecl>;

export const SCHEMA: Schema = {
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

  // ── Project-wide command shorthands ─────────────────────────────────────
  "commands.dev":           { type: "string", source: "computed", required: true,
                              description: "Project's dev command" },
  "commands.test":          { type: "string", source: "computed", required: true,
                              description: "Project-wide test command" },
  "commands.lint":          { type: "string", source: "computed", required: true,
                              description: "Project-wide lint/format command" },
  "commands.typecheck":     { type: "string", source: "computed", required: true,
                              description: "Project-wide typecheck command" },
  "commands.build":         { type: "string", source: "computed", required: true,
                              description: "Project-wide build command" },

  // ── Stack metadata (frontend-only, optional) ────────────────────────────
  "stack.framework":        { type: "string",  source: "package-json-deps", required: false },
  "stack.buildTool":        { type: "string",  source: "package-json-deps", required: false },
  "stack.testRunner":       { type: "string",  source: "package-json-deps", required: false },
  "stack.styling":          { type: "string",  source: "package-json-deps", required: false },

  // ── Backend metadata (C#-only, optional) ─────────────────────────────────
  "backend.solutionPath":   { type: "string",  source: "detected", required: false },
  "backend.projectName":    { type: "string",  source: "detected", required: false },
  "backend.srcPath":        { type: "string",  source: "detected", required: false },
  "backend.testsPath":      { type: "string",  source: "detected", required: false },
  "backend.csprojCount":    { type: "number",  source: "detected", required: false },
  "backend.migrationTool":  { type: "enum",    source: "detected-or-prompted", required: false,
                              values: ["flyway", "efcore", "none"],
                              description: "Backend migration tool" },

  // ── Integrations: Jira ──────────────────────────────────────────────────
  "integrations.jira.enabled":    { type: "boolean", source: "prompted", required: true },
  "integrations.jira.baseUrl":    { type: "string",  source: "prompted",
                                    requiredWhen: "integrations.jira.enabled" },
  "integrations.jira.projectKey": { type: "string",  source: "prompted",
                                    requiredWhen: "integrations.jira.enabled" },

  // ── Integrations: SonarQube ─────────────────────────────────────────────
  "integrations.sonar.enabled":    { type: "boolean", source: "prompted", required: true },
  "integrations.sonar.projectKey": { type: "string",  source: "prompted",
                                     requiredWhen: "integrations.sonar.enabled" },

  // ── Browser QA (Inspector Clouseau) ──────────────────────────────────────
  "browserQA.enabled":         { type: "boolean", source: "computed", required: true },
  "browserQA.authStatePath":   { type: "string",  source: "prompted",
                                 requiredWhen: "browserQA.enabled" },

  // ── Internal ────────────────────────────────────────────────────────────
  "_resolvedSkillName":     { type: "string", source: "internal", required: false,
                              description: "The actual installed skill directory name after rename-on-conflict" },
};

const MARKER_RE = /\{\{\s*(CONFIG(?:\.[\w$]+|\[\d+\])+)\s*\}\}/g;

export function enumerateMarkers(text: string): string[] {
  const out = new Set<string>();
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(text)) !== null) {
    out.add(m[1]);
  }
  return [...out];
}

export function schemaPathOf(markerPath: string): string {
  return markerPath
    .replace(/^CONFIG\.?/, "")
    .replace(/\[\d+\]/g, "")
    .replace(/\[(\w+)\]/g, "$1")
    .replace(/\.\./g, ".");
}

export function isDeclared(markerPath: string): boolean {
  const direct = schemaPathOf(markerPath);
  if (SCHEMA[direct]) return true;

  const arrayMatch = markerPath.match(/^CONFIG\.([\w$]+)\[\d+\]\.(.+)$/);
  if (arrayMatch) {
    const [, arrName, sub] = arrayMatch;
    const arr = SCHEMA[arrName];
    if (arr && arr.type === "array" && arr.itemShape) {
      const subTop = sub.split(".")[0];
      if (arr.itemShape[subTop]) return true;
    }
  }
  return false;
}

export function resolveMarker(config: unknown, markerPath: string): unknown {
  const parts = markerPath
    .replace(/^CONFIG\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur: unknown = config;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function getByPath(obj: unknown, path: string): unknown {
  return resolveMarker(obj, "CONFIG." + path);
}

export interface ValidationError {
  path: string;
  kind: "missing" | "type";
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

export function validate(config: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  for (const [path, decl] of Object.entries(SCHEMA)) {
    const value = getByPath(config, path);
    const isMissing = value === undefined || value === null;

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

    if (!checkType(value, decl)) {
      errors.push({
        path,
        kind: "type",
        message: `CONFIG.${path} has wrong type: expected ${describeType(decl)}, got ${typeof value}${Array.isArray(value) ? " (array)" : ""}`,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

function checkType(value: unknown, decl: FieldDecl): boolean {
  switch (decl.type) {
    case "string":  return typeof value === "string";
    case "number":  return typeof value === "number" && !Number.isNaN(value);
    case "boolean": return typeof value === "boolean";
    case "enum":    return typeof value === "string" && (decl.values?.includes(value) ?? false);
    case "array":   return Array.isArray(value);
    case "object":  return !!value && typeof value === "object" && !Array.isArray(value);
    default:        return true;
  }
}

function describeType(decl: FieldDecl): string {
  if (decl.type === "enum") return `enum<${decl.values?.join("|")}>`;
  return decl.type;
}
