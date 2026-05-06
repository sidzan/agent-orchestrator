"use strict";

/**
 * In-memory template renderer with schema validation and render-time audit.
 *
 * Two entry points:
 *   renderTree(templateDir, config, options) → { ok, files, errors }
 *   renderFile(text, config, options)        → { ok, content, errors }
 *
 * The renderer never writes to disk. Callers (lib/install.js) write atomically
 * after auditing the full in-memory tree.
 *
 * Render passes:
 *   1. Validate `config` against the declared schema (lib/schema.js).
 *   2. For each file, run conditional blocks ({{#if x}}...{{/if}}, with
 *      optional {{#else}} branch).
 *   3. Substitute value markers ({{CONFIG.x.y}}).
 *   4. Audit each rendered file:
 *      - leftover {{ or }} → marker rendering bug → fail
 *      - <UNSET:...> sentinel → unresolved required path → fail
 *
 * Binary files (non-text) are passed through unchanged.
 */

const fs = require("fs");
const path = require("path");
const { SCHEMA, validate, resolveMarker, isDeclared } = require("./schema");

const VALUE_RE = /\{\{\s*(CONFIG(?:\.[\w$]+|\[\d+\])+)\s*\}\}/g;
const IF_OPEN_RE = /\{\{\s*#if\s+(CONFIG(?:\.[\w$]+|\[\d+\])+)\s*\}\}/;
const IF_CLOSE = "{{/if}}";
const ELSE_TAG = "{{#else}}";

const TEXT_EXTS = new Set([".md", ".sh", ".tsx", ".ts", ".js", ".jsx", ".cs", ".sql", ".yml", ".yaml", ".json", ".example", ".txt"]);

function isTextFile(filePath) {
  if (TEXT_EXTS.has(path.extname(filePath))) return true;
  const base = path.basename(filePath);
  if (base.startsWith(".") || !base.includes(".")) return true;
  return false;
}

class RenderError extends Error {
  constructor(message, errors) {
    super(message);
    this.errors = errors || [];
  }
}

// ── Conditional rendering ──────────────────────────────────────────────────

function findMatchingClose(text, startIdx) {
  let i = startIdx;
  let depth = 1;
  let elseIdx = -1;
  while (i < text.length) {
    const nextOpen = text.indexOf("{{#if", i);
    const nextClose = text.indexOf(IF_CLOSE, i);
    const nextElse = text.indexOf(ELSE_TAG, i);
    if (nextClose === -1) return { closeIdx: -1, elseIdx: -1 };
    const candidates = [
      { type: "open",  idx: nextOpen },
      { type: "close", idx: nextClose },
      { type: "else",  idx: nextElse },
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

function renderConditionals(text, config, errors) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const m = rest.match(IF_OPEN_RE);
    if (!m) {
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
    const ifBody  = elseIdx !== -1 ? text.slice(afterOpen, elseIdx) : text.slice(afterOpen, closeIdx);
    const elseBody = elseIdx !== -1 ? text.slice(elseIdx + ELSE_TAG.length, closeIdx) : "";
    const value = resolveMarker(config, expr);
    const branch = value ? ifBody : elseBody;
    out += renderConditionals(branch, config, errors);
    i = closeIdx + IF_CLOSE.length;
  }
  return out;
}

// ── Value substitution ─────────────────────────────────────────────────────

/** Schema lookup for a marker's declaration, accounting for array-item paths. */
function declarationFor(markerPath) {
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

function renderValues(text, config, errors) {
  return text.replace(VALUE_RE, (_, expr) => {
    if (!isDeclared(expr)) {
      errors.push({ kind: "unknown-marker", message: `Unknown CONFIG path: {{${expr}}} — declare it in lib/schema.js` });
      return `<UNDECLARED:${expr}>`;
    }
    const value = resolveMarker(config, expr);
    if (value === undefined || value === null) {
      // Gated-optional path: if its `requiredWhen` is false, this is an
      // intentionally-disabled integration. Substitute a visible placeholder
      // so the user can grep for "(disabled" later, but don't fail audit.
      const decl = declarationFor(expr);
      if (decl && decl.requiredWhen) {
        const gate = resolveMarker(config, "CONFIG." + decl.requiredWhen);
        if (!gate) {
          // Derive a friendly placeholder from the integration name
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

function auditRendered(content, relativePath, errors) {
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
      message: `<UNDECLARED> sentinel rendered: ${undecl[0]} — template references a CONFIG path not in lib/schema.js`,
    });
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

function renderFile(text, config, options = {}) {
  const errors = [];
  const skipValidation = options.skipValidation === true;
  const relativePath = options.relativePath || "<inline>";

  if (!skipValidation) {
    const v = validate(config);
    if (!v.ok) return { ok: false, content: null, errors: v.errors.map((e) => ({ ...e, file: relativePath })) };
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

function walkTree(dir, base = dir, out = []) {
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

function renderTree(templateDir, config, options = {}) {
  const v = validate(config);
  if (!v.ok) {
    return { ok: false, files: [], errors: v.errors.map((e) => ({ ...e, kind: "config-validation" })) };
  }

  const files = [];
  const errors = [];
  const sources = walkTree(templateDir);

  for (const f of sources) {
    if (isTextFile(f.absolutePath)) {
      const raw = fs.readFileSync(f.absolutePath, "utf8");
      const r = renderFile(raw, config, { skipValidation: true, relativePath: f.relativePath });
      if (!r.ok) {
        errors.push(...r.errors.map((e) => ({ ...e, file: e.file || f.relativePath })));
        continue;
      }
      files.push({ relativePath: f.relativePath, content: r.content, mode: "text" });
    } else {
      // Binary — pass through
      const buf = fs.readFileSync(f.absolutePath);
      files.push({ relativePath: f.relativePath, content: buf, mode: "binary" });
    }
  }

  return {
    ok: errors.length === 0,
    files,
    errors,
  };
}

/** Atomically write a rendered tree under destDir. Rolls back on failure. */
function writeTree(destDir, files) {
  const written = [];
  try {
    fs.mkdirSync(destDir, { recursive: true });
    for (const f of files) {
      const dest = path.join(destDir, f.relativePath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (f.mode === "binary") {
        fs.writeFileSync(dest, f.content);
      } else {
        fs.writeFileSync(dest, f.content);
      }
      written.push(dest);
    }
    return { ok: true, written };
  } catch (e) {
    // Roll back what we just wrote
    for (const w of written) {
      try { fs.unlinkSync(w); } catch {}
    }
    return { ok: false, error: e, written: [] };
  }
}

module.exports = {
  renderFile,
  renderTree,
  writeTree,
  RenderError,
  isTextFile,
};
