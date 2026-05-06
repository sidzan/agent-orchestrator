import * as fs from "fs";
import * as path from "path";

const FRONTEND_FRAMEWORK_DEPS = [
  "react",
  "react-admin",
  "next",
  "@remix-run/react",
  "vue",
  "@angular/core",
];

const FRONTEND_BUILD_TOOL_DEPS = ["vite", "webpack", "next", "turbopack"];
const FRONTEND_TEST_RUNNER_DEPS = ["vitest", "jest", "@playwright/test", "cypress"];
const FRONTEND_STYLING_DEPS = ["tailwindcss", "@mui/material", "styled-components", "@emotion/react"];

const LOCKFILE_TO_PACKAGE_MANAGER: Record<string, string> = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
  "bun.lockb": "bun",
};

const MAX_CSPROJ_SCAN = 200;
const SKIP_DIRS = new Set([
  "node_modules", "bin", "obj", "dist", "build", ".git", ".claude", "coverage", "vendor", "target",
]);

function readJsonSafe(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function detectPackageManager(root: string): string {
  for (const [lockfile, pm] of Object.entries(LOCKFILE_TO_PACKAGE_MANAGER)) {
    if (exists(path.join(root, lockfile))) return pm;
  }
  return "npm";
}

type MonorepoTool = "pnpm-workspaces" | "turbo" | "nx" | "npm-workspaces" | null;

function detectMonorepo(root: string, rootPkg: Record<string, unknown> | null): MonorepoTool {
  if (exists(path.join(root, "pnpm-workspace.yaml"))) return "pnpm-workspaces";
  if (exists(path.join(root, "turbo.json"))) return "turbo";
  if (exists(path.join(root, "nx.json"))) return "nx";
  if (rootPkg && rootPkg.workspaces) return "npm-workspaces";
  return null;
}

function readPnpmWorkspaces(root: string): string[] {
  const file = path.join(root, "pnpm-workspace.yaml");
  if (!exists(file)) return [];
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/);
  const packages: string[] = [];
  let inPackages = false;
  for (const line of lines) {
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const m = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/);
      if (m) packages.push(m[1].trim());
      else if (/^\S/.test(line)) inPackages = false;
    }
  }
  return packages;
}

function expandWorkspaceGlob(root: string, pattern: string): string[] {
  const trimmed = pattern.replace(/\/\*\*?\/?$/, "").replace(/\/\*$/, "");
  const dir = path.join(root, trimmed);
  if (!exists(dir)) return [];
  if (!pattern.includes("*")) {
    return exists(path.join(dir, "package.json")) ? [dir] : [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name))
    .filter((p) => exists(path.join(p, "package.json")));
}

function parsePort(devScript: string | undefined): number | null {
  if (!devScript) return null;
  const m = devScript.match(/--port[ =](\d{2,5})/) || devScript.match(/-p[ =](\d{2,5})/);
  return m ? Number(m[1]) : null;
}

export interface AppStack {
  framework: string | null;
  buildTool: string | null;
  testRunner: string | null;
  styling: string | null;
}

function inferStack(deps: Record<string, unknown>): AppStack {
  const allDeps = Object.keys(deps || {});
  const has = (name: string) => allDeps.includes(name);
  return {
    framework: FRONTEND_FRAMEWORK_DEPS.find(has) || null,
    buildTool: FRONTEND_BUILD_TOOL_DEPS.find(has) || null,
    testRunner: FRONTEND_TEST_RUNNER_DEPS.find(has) || null,
    styling: FRONTEND_STYLING_DEPS.find(has) || null,
  };
}

export interface AppEntry {
  name: string;
  path: string;
  port: number;
  pnpmFilter: string | null;
  devCommand: string;
  testCommand: string;
  lintCommand: string;
  typecheckCommand: string;
  buildCommand: string;
  sonarPathPrefix: string;
  stack: AppStack;
  selected?: boolean;
}

function buildAppEntry(appDir: string, root: string): AppEntry | null {
  const pkg = readJsonSafe(path.join(appDir, "package.json"));
  if (!pkg) return null;
  const scripts = (pkg.scripts || {}) as Record<string, string>;
  const rel = path.relative(root, appDir) || ".";
  const port = parsePort(scripts.dev) || 3000;
  const deps = {
    ...((pkg.dependencies || {}) as Record<string, unknown>),
    ...((pkg.devDependencies || {}) as Record<string, unknown>),
  };
  const name = (pkg.name as string) || path.basename(appDir);
  return {
    name,
    path: rel,
    port,
    pnpmFilter: name || null,
    devCommand: scripts.dev ? `pnpm --filter ${name || rel} dev` : "pnpm dev",
    testCommand: scripts.test ? `pnpm --filter ${name || rel} test` : "pnpm test",
    lintCommand: scripts.lint ? `pnpm --filter ${name || rel} lint` : "pnpm lint",
    typecheckCommand: scripts.typecheck ? `pnpm --filter ${name || rel} typecheck` : "pnpm typecheck",
    buildCommand: scripts.build ? `pnpm --filter ${name || rel} build` : "pnpm build",
    sonarPathPrefix: `${rel === "." ? "" : rel + "/"}src/`,
    stack: inferStack(deps),
    selected: true,
  };
}

export interface FrontendDetection {
  detected: true;
  packageManager: string;
  monorepo: boolean;
  monorepoTool: MonorepoTool;
  apps: AppEntry[];
}

export function detectFrontend(root: string): FrontendDetection | null {
  const rootPkg = readJsonSafe(path.join(root, "package.json"));
  if (!rootPkg) return null;
  const monorepo = detectMonorepo(root, rootPkg);
  const packageManager = detectPackageManager(root);

  const appDirs = new Set<string>();
  if (monorepo === "pnpm-workspaces") {
    for (const pat of readPnpmWorkspaces(root)) {
      for (const d of expandWorkspaceGlob(root, pat)) appDirs.add(d);
    }
  } else if (monorepo === "npm-workspaces") {
    const ws = Array.isArray(rootPkg.workspaces)
      ? (rootPkg.workspaces as string[])
      : ((rootPkg.workspaces as { packages?: string[] } | undefined)?.packages || []);
    for (const pat of ws) {
      for (const d of expandWorkspaceGlob(root, pat)) appDirs.add(d);
    }
  }

  let apps: AppEntry[];
  if (appDirs.size === 0) {
    const single = buildAppEntry(root, root);
    apps = single ? [single] : [];
  } else {
    apps = [...appDirs]
      .map((d) => buildAppEntry(d, root))
      .filter((x): x is AppEntry => x !== null);
  }

  const reactish = apps.some((a) => {
    const pkg = readJsonSafe(path.join(root, a.path, "package.json")) || {};
    const allDeps = {
      ...((pkg.dependencies || {}) as Record<string, unknown>),
      ...((pkg.devDependencies || {}) as Record<string, unknown>),
    };
    return FRONTEND_FRAMEWORK_DEPS.some((d) => d in allDeps);
  });

  if (!reactish) return null;
  return {
    detected: true,
    packageManager,
    monorepo: !!monorepo,
    monorepoTool: monorepo,
    apps,
  };
}

function walkForExt(dir: string, exts: string[], found: string[] = [], depth = 0): string[] {
  if (found.length >= MAX_CSPROJ_SCAN || depth > 6) return found;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const e of entries) {
    if (found.length >= MAX_CSPROJ_SCAN) break;
    if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkForExt(full, exts, found, depth + 1);
    } else if (exts.some((x) => e.name.endsWith(x))) {
      found.push(full);
    }
  }
  return found;
}

function readCsprojPackages(file: string): string[] {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return [...raw.matchAll(/<PackageReference\s+Include="([^"]+)"/g)].map((m) => m[1]);
  } catch {
    return [];
  }
}

export interface BackendDetection {
  detected: true;
  solutionPath: string | null;
  csprojCount: number;
  projectName: string;
  srcPath: string;
  testsPath: string | null;
  migrationTool: "flyway" | "efcore" | null;
  needsMigrationToolPrompt: boolean;
  defaults: { testCommand: string; buildCommand: string; lintCommand: string };
}

export function detectBackend(root: string): BackendDetection | null {
  const slns = walkForExt(root, [".sln"]);
  const csprojs = walkForExt(root, [".csproj"]);
  if (slns.length === 0 && csprojs.length === 0) return null;

  const allPackages = new Set<string>();
  for (const f of csprojs.slice(0, 50)) {
    for (const p of readCsprojPackages(f)) allPackages.add(p);
  }

  let migrationTool: "flyway" | "efcore" | null = null;
  if (exists(path.join(root, "flyway.conf"))) migrationTool = "flyway";
  else if ([...allPackages].some((p) => p.startsWith("Microsoft.EntityFrameworkCore"))) migrationTool = "efcore";

  const projectName =
    slns.length > 0
      ? path.basename(slns[0], ".sln")
      : path.basename(csprojs[0] || root, ".csproj");

  return {
    detected: true,
    solutionPath: slns[0] ? path.relative(root, slns[0]) : null,
    csprojCount: csprojs.length,
    projectName,
    srcPath: exists(path.join(root, "src")) ? "src" : ".",
    testsPath: exists(path.join(root, "tests")) ? "tests" : null,
    migrationTool,
    needsMigrationToolPrompt: migrationTool === null,
    defaults: { testCommand: "dotnet test", buildCommand: "dotnet build", lintCommand: "dotnet format" },
  };
}

export interface DetectionResult {
  root: string;
  frontend: FrontendDetection | null;
  backend: BackendDetection | null;
}

export function detect(root: string): DetectionResult {
  return {
    root,
    frontend: detectFrontend(root),
    backend: detectBackend(root),
  };
}
