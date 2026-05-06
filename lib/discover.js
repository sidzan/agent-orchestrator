"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { collectDiscoverTags } = require("./substitute");

const DISCOVERY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const TEXT_EXTENSIONS = [".md", ".tsx", ".ts", ".cs", ".sql", ".sh"];

function isTextFile(p) {
  return TEXT_EXTENSIONS.includes(path.extname(p));
}

function checkClaudeInstalled() {
  const r = spawnSync("claude", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

function walkTags(dir, tags = []) {
  if (!fs.existsSync(dir)) return tags;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkTags(full, tags);
    } else if (isTextFile(full)) {
      try {
        const text = fs.readFileSync(full, "utf8");
        const found = collectDiscoverTags(text);
        for (const t of found) {
          tags.push({ ...t, sourcePath: path.relative(process.cwd(), full) });
        }
      } catch {
        /* ignore unreadable files */
      }
    }
  }
  return tags;
}

function dedupeTags(tags) {
  const seen = new Map();
  for (const t of tags) {
    if (!seen.has(t.sectionId)) {
      seen.set(t.sectionId, t);
    }
  }
  return [...seen.values()];
}

function buildPrompt({ tags, cwd, stack, apps }) {
  const sections = tags
    .map((t) => `[${t.sectionId}]\n${t.instruction || "(no instruction provided)"}`)
    .join("\n\n");

  const stackLabel = Array.isArray(stack) ? stack.join(" + ") : stack;
  const appsLine =
    apps && apps.length
      ? apps.map((a) => `${a.name} at ${a.path}`).join(", ")
      : "(detected from cwd)";

  return [
    `You are scanning a ${stackLabel} codebase to derive project-specific implementation patterns.`,
    ``,
    `Repository root: ${cwd}`,
    `Detected stack:  ${stackLabel}`,
    `Apps to cover:   ${appsLine}`,
    ``,
    `For each section below, read the relevant code and return a JSON object`,
    `mapping section-id → derived content (markdown). If you cannot find`,
    `sufficient examples in the codebase to derive a section, return the`,
    `literal string "FALLBACK" for that section-id.`,
    ``,
    `Output ONLY a JSON object. No prose, no code fences, no commentary.`,
    `Keys are section-ids; values are markdown strings or "FALLBACK".`,
    ``,
    `Sections to derive:`,
    ``,
    sections,
  ].join("\n");
}

function tryParseEnvelope(stdout) {
  // `claude -p --output-format json` wraps the response in an envelope.
  // We accept either:
  //   - Direct JSON section map (older versions)
  //   - { result: "<assistant text>" } envelope
  //   - { messages: [{ content: "..." }] } shape
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { ok: false, reason: "envelope-not-json" };
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (typeof parsed.result === "string") return { ok: true, text: parsed.result };
    if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
      const last = parsed.messages[parsed.messages.length - 1];
      if (last && typeof last.content === "string") return { ok: true, text: last.content };
    }
    // Could already be the section map
    return { ok: true, text: JSON.stringify(parsed) };
  }
  return { ok: false, reason: "envelope-shape-unexpected" };
}

function extractJsonObject(text) {
  // Strip code fences, leading/trailing prose. Find the first `{` and the
  // matching `}` by depth-counting (string-aware).
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseSectionMap(text, expectedIds) {
  const jsonStr = extractJsonObject(text);
  if (!jsonStr) return { ok: false, reason: "no-json-object-found" };
  let map;
  try {
    map = JSON.parse(jsonStr);
  } catch {
    return { ok: false, reason: "section-map-not-json" };
  }
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return { ok: false, reason: "section-map-not-object" };
  }
  // Coerce all values to strings (undefined → "FALLBACK")
  const clean = {};
  for (const id of expectedIds) {
    const v = map[id];
    if (typeof v === "string") clean[id] = v;
    else clean[id] = "FALLBACK";
  }
  return { ok: true, map: clean };
}

function spawnClaude(prompt, log) {
  log && log("Running claude (read-only). This may take 30–90 seconds…");
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--allowed-tools",
    "Read,Glob,Grep",
    "--dangerously-skip-permissions",
  ];
  const r = spawnSync("claude", args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: DISCOVERY_TIMEOUT_MS,
  });
  if (r.status === null) {
    return { ok: false, reason: "timeout-or-killed", stderr: r.stderr || "" };
  }
  if (r.status !== 0) {
    return { ok: false, reason: "claude-nonzero-exit", stderr: r.stderr || "", stdout: r.stdout || "" };
  }
  return { ok: true, stdout: r.stdout || "" };
}

function writeDebugLog(projectRoot, stdout, stderr) {
  try {
    fs.mkdirSync(path.join(projectRoot, ".claude"), { recursive: true });
    const logPath = path.join(projectRoot, ".claude", "agent-bootstrap-discovery.log");
    fs.writeFileSync(
      logPath,
      `--- stdout ---\n${stdout || ""}\n--- stderr ---\n${stderr || ""}\n`
    );
    return logPath;
  } catch {
    return null;
  }
}

// Main entry. Returns one of:
//   { ok: true, map: {sectionId: derivedMd | "FALLBACK"}, tagCount }
//   { ok: false, reason: 'no-claude' | 'declined' | 'no-tags' | <other> }
async function runDiscovery({ templatesToInstall, projectRoot, stack, apps, log }) {
  if (!checkClaudeInstalled()) return { ok: false, reason: "no-claude" };

  // Collect every DISCOVER tag from the templates that will be installed.
  const allTags = [];
  for (const tdir of templatesToInstall) {
    walkTags(tdir, allTags);
  }
  const tags = dedupeTags(allTags);
  if (tags.length === 0) return { ok: false, reason: "no-tags" };

  log && log(`Found ${tags.length} DISCOVER section(s) across templates.`);

  const prompt = buildPrompt({ tags, cwd: projectRoot, stack, apps });
  const spawned = spawnClaude(prompt, log);
  if (!spawned.ok) {
    const logPath = writeDebugLog(projectRoot, spawned.stdout || "", spawned.stderr || "");
    return { ok: false, reason: spawned.reason, logPath, stderr: spawned.stderr };
  }

  const env = tryParseEnvelope(spawned.stdout);
  if (!env.ok) {
    const logPath = writeDebugLog(projectRoot, spawned.stdout, "");
    return { ok: false, reason: env.reason, logPath };
  }

  const expectedIds = tags.map((t) => t.sectionId);
  const parsed = parseSectionMap(env.text, expectedIds);
  if (!parsed.ok) {
    const logPath = writeDebugLog(projectRoot, spawned.stdout, env.text);
    return { ok: false, reason: parsed.reason, logPath };
  }

  return { ok: true, map: parsed.map, tagCount: tags.length };
}

function summarize(map) {
  const derived = [];
  const fallback = [];
  for (const [id, value] of Object.entries(map)) {
    if (typeof value === "string" && value !== "FALLBACK" && value.trim() !== "") {
      derived.push(id);
    } else {
      fallback.push(id);
    }
  }
  return { derived, fallback };
}

module.exports = {
  runDiscovery,
  checkClaudeInstalled,
  buildPrompt,
  parseSectionMap,
  tryParseEnvelope,
  extractJsonObject,
  walkTags,
  dedupeTags,
  summarize,
};
