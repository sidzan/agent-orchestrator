"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const DISCOVERY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const TEXT_EXTENSIONS = [".md", ".tsx", ".ts", ".cs", ".sql", ".sh"];

const FRONTEND_DISCOVERIES = [
  {
    filename: "patterns/list-pages.md",
    instruction:
      "Find: where list/index page components live in this codebase, the file-naming convention, the layout component(s) wrapping them, and the data-fetching pattern. Output: a markdown reference doc engineers should read before implementing a new list page. Include concrete file paths and 1-2 short code excerpts from real components in the codebase. If no list pages exist, return \"FALLBACK\".",
  },
  {
    filename: "patterns/forms.md",
    instruction:
      "Find: where form components live (create / edit / submit forms), the validation library used, how form state is managed, and how submission errors surface to the user. Output: a markdown reference with concrete file paths and a short canonical example from the codebase. If no forms exist, return \"FALLBACK\".",
  },
  {
    filename: "patterns/detail-pages.md",
    instruction:
      "Find: where detail / show / view pages live, how they fetch a single record by id, how they handle loading and not-found states, and any tab / section pattern. Output: a markdown reference with concrete paths. If no detail pages exist, return \"FALLBACK\".",
  },
  {
    filename: "patterns/api-to-feature.md",
    instruction:
      "Find: the steps an engineer in this codebase follows to take a new backend endpoint and surface it as a CRUD feature in the UI. Look at: where domain types live, how API/data wiring is registered, where routes/resources are declared, the per-feature folder shape, and any translation/i18n step. Output: a numbered markdown checklist of 5-10 concrete steps with paths from THIS codebase. Skip patterns from libraries the codebase does not import.",
  },
  {
    filename: "patterns/shared-components.md",
    instruction:
      "Find: which shared/common UI components exist, where they live, and how they are imported. Output: a markdown reference listing the most commonly-used shared components with their import paths and a one-line purpose for each. If no shared component library exists, return \"FALLBACK\".",
  },
  {
    filename: "patterns/testing.md",
    instruction:
      "Find: the test framework in use, the testing-library setup if any, file-naming convention for tests (*.test.tsx vs __tests__/), and a representative test for a component or hook. Output: a markdown reference with the conventions and one short canonical example. If no tests exist yet, return \"FALLBACK\".",
  },
  {
    filename: "conventions/file-layout.md",
    instruction:
      "Find: the directory structure under each app, where features live, where shared code lives, where tests live. Output: a markdown reference describing this codebase's layout conventions, with a tree-style example for a representative feature. Always derivable, never FALLBACK.",
  },
  {
    filename: "conventions/data-fetching.md",
    instruction:
      "Find: how this codebase fetches data — query libraries (TanStack Query, SWR, RTK Query, react-admin data provider, fetch wrappers), where API clients live, how loading/error states are handled. Output: short reference doc explaining the pattern with an example call site. If the codebase is greenfield with no data fetching yet, return \"FALLBACK\".",
  },
];

const BACKEND_DISCOVERIES = [
  {
    filename: "patterns/handlers.md",
    instruction:
      "Find: where request handlers / controllers / endpoints live, the naming convention, the dispatch pattern (MediatR / minimal APIs / controller actions), and a representative example. Output: a markdown reference with concrete file paths and one short example.",
  },
  {
    filename: "patterns/di-registration.md",
    instruction:
      "Find: how services are registered in dependency injection — which method, which file, which lifetime defaults. Output: a markdown reference with concrete examples from the codebase.",
  },
  {
    filename: "patterns/migrations.md",
    instruction:
      "Find: the migration tool (Flyway, EF Core migrations, Fluent Migrator), version-numbering convention, file location, and a representative example. Output: a markdown reference with concrete steps for adding a new migration. If no migrations have been added yet, return \"FALLBACK\".",
  },
  {
    filename: "patterns/integration-tests.md",
    instruction:
      "Find: the integration test framework, where test fixtures live, how the test database is set up/torn down, and a representative test. Output: a markdown reference with concrete paths and a short example. If no integration tests exist, return \"FALLBACK\".",
  },
  {
    filename: "conventions/project-layout.md",
    instruction:
      "Find: the .NET project structure (Api / Application / Domain / Infrastructure layering, or vertical-slice, etc.), which projects depend on which, and where each layer's code lives. Output: a markdown reference describing the layering with a tree of the src/ directory.",
  },
];

function checkClaudeInstalled() {
  const r = spawnSync("claude", ["--version"], { encoding: "utf8" });
  return r.status === 0;
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
  summarize,
  FRONTEND_DISCOVERIES,
  BACKEND_DISCOVERIES,
};
