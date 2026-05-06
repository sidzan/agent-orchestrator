import * as fs from "fs";
import * as path from "path";
import { SCHEMA, FieldDecl, validate, resolveMarker, isDeclared, ValidationError } from "./schema";

const VALUE_RE = /\{\{\s*(CONFIG(?:\.[\w$]+|\[\d+\])+)\s*\}\}/g;
const IF_OPEN_RE = /\{\{\s*#if\s+(CONFIG(?:\.[\w$]+|\[\d+\])+)\s*\}\}/;
const IF_CLOSE = "{{/if}}";
const ELSE_TAG = "{{#else}}";

const TEXT_EXTS = new Set([
  ".md", ".sh", ".tsx", ".ts", ".js", ".jsx", ".cs", ".sql",
  ".yml", ".yaml", ".json", ".example", ".txt",
]);

export function isTextFile(filePath: string): boolean {
  if (TEXT_EXTS.has(path.extname(filePath))) return true;
  const base = path.basename(filePath);
  if (base.startsWith(".") || !base.includes(".")) return true;
  return false;
}

export type RenderErrorKind =
  | "config-validation"
  | "missing"
  | "type"
  | "unknown-marker"
  | "unresolved-marker"
  | "leftover-marker"
  | "unset-sentinel"
  | "undeclared-marker"
  | "unmatched-if"
  | "write";

export interface RenderIssue {
  kind: RenderErrorKind;
  file?: string;
  path?: string;
  message: string;
}

export class RenderError extends Error {
  errors: RenderIssue[];
  constructor(message: string, errors: RenderIssue[]) {
    super(message);
    this.errors = errors;
  }
}

// ── Conditional rendering ──────────────────────────────────────────────────

interface CloseInfo {
  closeIdx: number;
  elseIdx: number;
}

function findMatchingClose(text: string, startIdx: number): CloseInfo {
  let i = startIdx;
  let depth = 1;
  let elseIdx = -1;
  while (i < text.length) {
    const nextOpen = text.indexOf("{{#if", i);
    const nextClose = text.indexOf(IF_CLOSE, i);
    const nextElse = text.indexOf(ELSE_TAG, i);
    if (nextClose === -1) return { closeIdx: -1, elseIdx: -1 };
    const candidates = [
      { type: "open", idx: nextOpen },
      { type: "close", idx: nextClose },
      { type: "else", idx: nextElse },
    ].filter((c) => c.idx !== -1);
    candidates.sort((a, b) => a.idx - b.idx);
    const next = candidates[0];
    if (next.type === "open") {
      depth += 1;
      i = next.idx + 5;
    } else if (next.type === "else") {
      if (depth === 1 && elseIdx === -1) elseIdx = next.idx;
      i = next.idx + ELSE_TAG.length;
    } else {
      depth -= 1;
      if (depth === 0) return { closeIdx: next.idx, elseIdx };
      i = next.idx + IF_CLOSE.length;
    }
  }
  return { closeIdx: -1, elseIdx: -1 };
}

function renderConditionals(text: string, config: unknown, errors: RenderIssue[]): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const m = rest.match(IF_OPEN_RE);
    if (!m || m.index === undefined) {
      out += rest;
      break;
    }
    out += rest.slice(0, m.index);
    const expr = m[1];
    const afterOpen = i + m.index + m[0].length;
    const { closeIdx, elseIdx } = findMatchingClose(text, afterOpen);
    if (closeIdx === -1) {
      errors.push({ kind: "unmatched-if", message: `unmatched {{#if ${expr}}}` });
      out += rest.slice(m.index);
      break;
    }
    const ifBody = elseIdx !== -1 ? text.slice(afterOpen, elseIdx) : text.slice(afterOpen, closeIdx);
    const elseBody = elseIdx !== -1 ? text.slice(elseIdx + ELSE_TAG.length, closeIdx) : "";
    const value = resolveMarker(config, expr);
    const branch = value ? ifBody : elseBody;
    out += renderConditionals(branch, config, errors);
    i = closeIdx + IF_CLOSE.length;
  }
  return out;
}

// ── Value substitution ─────────────────────────────────────────────────────

function declarationFor(markerPath: string): FieldDecl | null {
  const direct = markerPath.replace(/^CONFIG\.?/, "").replace(/\[\d+\]/g, "");
  if (SCHEMA[direct]) return SCHEMA[direct];
  const arr = markerPath.match(/^CONFIG\.([\w$]+)\[\d+\]\.(.+)$/);
  if (arr) {
    const [, name, sub] = arr;
    const top = SCHEMA[name];
    if (top && top.itemShape) {
      const subTop = sub.split(".")[0];
      return top.itemShape[subTop] || null;
    }
  }
  return null;
}

function renderValues(text: string, config: unknown, errors: RenderIssue[]): string {
  return text.replace(VALUE_RE, (_match: string, expr: string) => {
    if (!isDeclared(expr)) {
      errors.push({ kind: "unknown-marker", message: `Unknown CONFIG path: {{${expr}}} — declare it in lib/schema.ts` });
      return `<UNDECLARED:${expr}>`;
    }
    const value = resolveMarker(config, expr);
    if (value === undefined || value === null) {
      const decl = declarationFor(expr);
      if (decl && decl.requiredWhen) {
        const gate = resolveMarker(config, "CONFIG." + decl.requiredWhen);
        if (!gate) {
          const m = expr.match(/CONFIG\.([\w]+\.[\w]+)\./);
          const intName = m ? m[1].split(".")[1] : "integration";
          return `(${intName}-disabled)`;
        }
      }
      errors.push({ kind: "unresolved-marker", message: `Marker ${expr} could not be resolved against config` });
      return `<UNSET:${expr}>`;
    }
    return String(value);
  });
}

// ── Audit ──────────────────────────────────────────────────────────────────

function auditRendered(content: string, relativePath: string, errors: RenderIssue[]): void {
  const m = content.match(/\{\{[^}]*\}\}/);
  if (m) {
    errors.push({
      kind: "leftover-marker",
      file: relativePath,
      message: `Leftover unrendered marker: ${m[0]}`,
    });
  }
  const unset = content.match(/<UNSET:[^>]+>/);
  if (unset) {
    errors.push({
      kind: "unset-sentinel",
      file: relativePath,
      message: `<UNSET> sentinel rendered into output: ${unset[0]} — config is missing a value templates need`,
    });
  }
  const undecl = content.match(/<UNDECLARED:[^>]+>/);
  if (undecl) {
    errors.push({
      kind: "undeclared-marker",
      file: relativePath,
      message: `<UNDECLARED> sentinel rendered: ${undecl[0]} — template references a CONFIG path not in lib/schema.ts`,
    });
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface RenderFileOptions {
  skipValidation?: boolean;
  relativePath?: string;
}

export interface RenderFileResult {
  ok: boolean;
  content: string | null;
  errors: RenderIssue[];
}

export function renderFile(text: string, config: unknown, options: RenderFileOptions = {}): RenderFileResult {
  const errors: RenderIssue[] = [];
  const skipValidation = options.skipValidation === true;
  const relativePath = options.relativePath || "<inline>";

  if (!skipValidation) {
    const v = validate(config);
    if (!v.ok) {
      return {
        ok: false,
        content: null,
        errors: v.errors.map((e: ValidationError) => ({ ...e, file: relativePath, kind: e.kind as RenderErrorKind })),
      };
    }
  }

  const afterIfs = renderConditionals(text, config, errors);
  const afterValues = renderValues(afterIfs, config, errors);
  auditRendered(afterValues, relativePath, errors);

  return {
    ok: errors.length === 0,
    content: afterValues,
    errors,
  };
}

interface SourceEntry {
  absolutePath: string;
  relativePath: string;
}

function walkTree(dir: string, base = dir, out: SourceEntry[] = []): SourceEntry[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkTree(full, base, out);
    } else {
      out.push({
        absolutePath: full,
        relativePath: path.relative(base, full),
      });
    }
  }
  return out;
}

export interface RenderedFile {
  relativePath: string;
  content: string | Buffer;
  mode: "text" | "binary";
}

export interface RenderTreeResult {
  ok: boolean;
  files: RenderedFile[];
  errors: RenderIssue[];
}

export function renderTree(templateDir: string, config: unknown): RenderTreeResult {
  const v = validate(config);
  if (!v.ok) {
    return {
      ok: false,
      files: [],
      errors: v.errors.map((e: ValidationError) => ({ ...e, kind: "config-validation" as RenderErrorKind })),
    };
  }

  const files: RenderedFile[] = [];
  const errors: RenderIssue[] = [];
  const sources = walkTree(templateDir);

  for (const f of sources) {
    if (isTextFile(f.absolutePath)) {
      const raw = fs.readFileSync(f.absolutePath, "utf8");
      const r = renderFile(raw, config, { skipValidation: true, relativePath: f.relativePath });
      if (!r.ok) {
        errors.push(...r.errors.map((e) => ({ ...e, file: e.file || f.relativePath })));
        continue;
      }
      files.push({ relativePath: f.relativePath, content: r.content!, mode: "text" });
    } else {
      const buf = fs.readFileSync(f.absolutePath);
      files.push({ relativePath: f.relativePath, content: buf, mode: "binary" });
    }
  }

  return { ok: errors.length === 0, files, errors };
}

export interface WriteTreeResult {
  ok: boolean;
  written: string[];
  error?: Error;
}

/** Atomically write a rendered tree under destDir. Rolls back on failure. */
export function writeTree(destDir: string, files: RenderedFile[]): WriteTreeResult {
  const written: string[] = [];
  try {
    fs.mkdirSync(destDir, { recursive: true });
    for (const f of files) {
      const dest = path.join(destDir, f.relativePath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.content);
      written.push(dest);
    }
    return { ok: true, written };
  } catch (e) {
    for (const w of written) {
      try { fs.unlinkSync(w); } catch { /* ignore */ }
    }
    return { ok: false, error: e as Error, written: [] };
  }
}
