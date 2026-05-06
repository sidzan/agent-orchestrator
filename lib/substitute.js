"use strict";

// Tiny template renderer.
//
// Supports two constructs:
//   1) Value markers:    {{CONFIG.path.to.value}}        → resolved against `config`
//   2) Conditionals:     {{#if CONFIG.x.enabled}} ... {{/if}}
//                        {{#if CONFIG.x.enabled}} ... {{#else}} ... {{/if}}
//
// Conditionals can be nested. If the path resolves to a falsy value, the block
// is omitted (or the {{#else}} branch is rendered).
//
// Path resolution supports dotted paths and bracket-indexed array access:
//   CONFIG.apps[0].path  → config.apps[0].path
//
// Anything that fails to resolve renders as empty string and prints a warning.

const VALUE_RE = /\{\{\s*(CONFIG(?:\.[\w$]+|\[\d+\])+)\s*\}\}/g;
const IF_OPEN_RE = /\{\{\s*#if\s+(CONFIG(?:\.[\w$]+|\[\d+\])+)\s*\}\}/;
const IF_CLOSE = "{{/if}}";
const ELSE_TAG = "{{#else}}";

function resolvePath(config, expr) {
  // expr looks like: CONFIG.foo.bar[0].baz
  const parts = expr
    .replace(/^CONFIG/, "")
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

function renderValues(text, config, warn) {
  return text.replace(VALUE_RE, (_, expr) => {
    const value = resolvePath(config, expr);
    if (value === undefined || value === null) {
      if (warn) warn(`unresolved marker: ${expr}`);
      return "";
    }
    return String(value);
  });
}

function findMatchingClose(text, startIdx) {
  // Given text starting at the position right after an opening {{#if ...}},
  // find the index of the matching {{/if}} accounting for nested ifs and
  // the optional {{#else}} marker at the same nesting depth.
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

function renderConditionals(text, config, warn) {
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
      if (warn) warn(`unmatched {{#if ${expr}}}`);
      out += rest.slice(m.index);
      break;
    }
    const ifBody =
      elseIdx !== -1 ? text.slice(afterOpen, elseIdx) : text.slice(afterOpen, closeIdx);
    const elseBody =
      elseIdx !== -1 ? text.slice(elseIdx + ELSE_TAG.length, closeIdx) : "";
    const value = resolvePath(config, expr);
    const branch = value ? ifBody : elseBody;
    out += renderConditionals(branch, config, warn);
    i = closeIdx + IF_CLOSE.length;
  }
  return out;
}

function render(text, config, options = {}) {
  const warn = options.warn || (() => {});
  const afterIfs = renderConditionals(text, config, warn);
  return renderValues(afterIfs, config, warn);
}

module.exports = { render, resolvePath };
