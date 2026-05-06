import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

const DISCOVERY_TIMEOUT_MS = 5 * 60 * 1000;

export interface DiscoveryEntry {
  filename: string;
  instruction: string;
}

export const FRONTEND_DISCOVERIES: readonly DiscoveryEntry[] = [
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

export const BACKEND_DISCOVERIES: readonly DiscoveryEntry[] = [
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

export function checkClaudeInstalled(): boolean {
  const r = spawnSync("claude", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

export interface BuildPromptArgs {
  entries: readonly DiscoveryEntry[];
  cwd: string;
  stack: string | string[];
  apps: { name: string; path: string }[];
}

export function buildPrompt({ entries, cwd, stack, apps }: BuildPromptArgs): string {
  const sections = entries
    .map((e) => `[${e.filename}]\n${e.instruction}`)
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
    `For each filename below, read the relevant code and return a JSON`,
    `object mapping filename → derived markdown content. If you cannot`,
    `find sufficient examples in the codebase to derive a section,`,
    `return the literal string "FALLBACK" for that filename.`,
    ``,
    `Output ONLY a JSON object. No prose, no code fences, no commentary.`,
    `Keys are filenames (may include subdirectories like "patterns/forms.md");`,
    `values are markdown strings or "FALLBACK".`,
    ``,
    `Sections to derive:`,
    ``,
    sections,
  ].join("\n");
}

export type EnvelopeResult = { ok: true; text: string } | { ok: false; reason: string };

export function tryParseEnvelope(stdout: string): EnvelopeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { ok: false, reason: "envelope-not-json" };
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.result === "string") return { ok: true, text: obj.result };
    if (Array.isArray(obj.messages) && obj.messages.length > 0) {
      const last = obj.messages[obj.messages.length - 1] as { content?: unknown };
      if (last && typeof last.content === "string") return { ok: true, text: last.content };
    }
    return { ok: true, text: JSON.stringify(parsed) };
  }
  return { ok: false, reason: "envelope-shape-unexpected" };
}

export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export type SectionMap = Record<string, string>;
export type SectionMapResult = { ok: true; map: SectionMap } | { ok: false; reason: string };

export function parseSectionMap(text: string, expectedIds: string[]): SectionMapResult {
  const jsonStr = extractJsonObject(text);
  if (!jsonStr) return { ok: false, reason: "no-json-object-found" };
  let map: unknown;
  try {
    map = JSON.parse(jsonStr);
  } catch {
    return { ok: false, reason: "section-map-not-json" };
  }
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return { ok: false, reason: "section-map-not-object" };
  }
  const obj = map as Record<string, unknown>;
  const clean: SectionMap = {};
  for (const id of expectedIds) {
    const v = obj[id];
    clean[id] = typeof v === "string" ? v : "FALLBACK";
  }
  return { ok: true, map: clean };
}

interface SpawnResult {
  ok: boolean;
  reason?: string;
  stderr?: string;
  stdout?: string;
}

function spawnClaude(prompt: string, log?: (msg: string) => void): SpawnResult {
  log?.("Running claude (read-only). This may take 30–90 seconds…");
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

function writeDebugLog(projectRoot: string, stdout: string, stderr: string): string | null {
  try {
    fs.mkdirSync(path.join(projectRoot, ".claude"), { recursive: true });
    const logPath = path.join(projectRoot, ".claude", "agent-bootstrap-discovery.log");
    fs.writeFileSync(logPath, `--- stdout ---\n${stdout || ""}\n--- stderr ---\n${stderr || ""}\n`);
    return logPath;
  } catch {
    return null;
  }
}

export interface DerivedReferencesResult {
  written: string[];
  fallback: string[];
}

export function writeDerivedReferences(skillDir: string, map: SectionMap): DerivedReferencesResult {
  const written: string[] = [];
  const fallback: string[] = [];
  const referencesDir = path.join(skillDir, "references");
  for (const [filename, value] of Object.entries(map)) {
    if (typeof value !== "string" || value === "FALLBACK" || value.trim() === "") {
      fallback.push(filename);
      continue;
    }
    const dest = path.join(referencesDir, filename);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, value.endsWith("\n") ? value : value + "\n");
    written.push(filename);
  }
  return { written, fallback };
}

export interface RunDiscoveryArgs {
  stacks: string[];
  projectRoot: string;
  skillDir: string;
  apps: { name: string; path: string }[];
  log?: (msg: string) => void;
}

export type RunDiscoveryResult =
  | { ok: true; written: string[]; fallback: string[]; total: number }
  | { ok: false; reason: string; logPath?: string | null; stderr?: string };

export async function runDiscovery(args: RunDiscoveryArgs): Promise<RunDiscoveryResult> {
  const { stacks, projectRoot, skillDir, apps, log } = args;
  if (!checkClaudeInstalled()) return { ok: false, reason: "no-claude" };

  const entries: DiscoveryEntry[] = [];
  if (stacks.includes("frontend")) entries.push(...FRONTEND_DISCOVERIES);
  if (stacks.includes("backend")) entries.push(...BACKEND_DISCOVERIES);
  if (entries.length === 0) return { ok: false, reason: "no-entries" };

  log?.(`Will derive up to ${entries.length} reference file(s).`);

  const prompt = buildPrompt({ entries, cwd: projectRoot, stack: stacks, apps });
  const spawned = spawnClaude(prompt, log);
  if (!spawned.ok) {
    const logPath = writeDebugLog(projectRoot, spawned.stdout || "", spawned.stderr || "");
    return { ok: false, reason: spawned.reason || "spawn-failed", logPath, stderr: spawned.stderr };
  }

  const env = tryParseEnvelope(spawned.stdout || "");
  if (!env.ok) {
    const logPath = writeDebugLog(projectRoot, spawned.stdout || "", "");
    return { ok: false, reason: env.reason, logPath };
  }

  const expectedIds = entries.map((e) => e.filename);
  const parsed = parseSectionMap(env.text, expectedIds);
  if (!parsed.ok) {
    const logPath = writeDebugLog(projectRoot, spawned.stdout || "", env.text);
    return { ok: false, reason: parsed.reason, logPath };
  }

  const { written, fallback } = writeDerivedReferences(skillDir, parsed.map);
  return { ok: true, written, fallback, total: entries.length };
}

export interface SummarizeResult {
  derived: string[];
  fallback: string[];
  total: number;
}

export function summarize(result: RunDiscoveryResult): SummarizeResult {
  if (!result.ok) return { derived: [], fallback: [], total: 0 };
  return {
    derived: result.written || [],
    fallback: result.fallback || [],
    total: result.total || 0,
  };
}
