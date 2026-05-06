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
      // Visible sentinel so the user can find and fill these in by hand.
      return `<UNSET:${expr}>`;
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
  const afterValues = renderValues(afterIfs, config, warn);
  if (options.discoveryMap) {
    return renderDiscoverTags(afterValues, options.discoveryMap, warn);
  }
  return afterValues;
}

// DISCOVER tag matcher.
//
// Format:
//   <!-- DISCOVER:section-id
//     instruction body (free text — used as the per-section discovery prompt)
//   -->
//   FALLBACK CONTENT
//   <!-- /DISCOVER -->
//
// Section-id is kebab-case, max 80 chars. The instruction body and the
// closing tag are matched non-greedily so multiple tags can coexist in a
// single file.
const DISCOVER_RE =
  /<!--\s*DISCOVER:([a-z0-9][a-z0-9-]{0,79})\b([\s\S]*?)-->([\s\S]*?)<!--\s*\/DISCOVER\s*-->/g;

function renderDiscoverTags(text, discoveryMap, warn) {
  return text.replace(DISCOVER_RE, (_match, sectionId, _instruction, fallback) => {
    const value = discoveryMap[sectionId];
    if (typeof value === "string" && value !== "FALLBACK" && value.trim() !== "") {
      return value;
    }
    if (warn && discoveryMap !== null && discoveryMap !== undefined) {
      warn(`DISCOVER section '${sectionId}' fell back to ship-as-is content`);
    }
    return fallback.replace(/^\s*\n/, "").replace(/\n\s*$/, "\n");
  });
}

// Walk a directory tree collecting every DISCOVER tag (section-id + instruction).
// Used by lib/discover.js to assemble the prompt and validate the response.
function collectDiscoverTags(text) {
  const tags = [];
  const re = new RegExp(DISCOVER_RE.source, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    tags.push({
      sectionId: m[1],
      instruction: m[2].trim(),
    });
  }
  return tags;
}

module.exports = { render, resolvePath, renderDiscoverTags, collectDiscoverTags };
