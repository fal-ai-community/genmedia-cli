import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const DEFAULT_REGISTRY_URL =
  "https://raw.githubusercontent.com/fal-ai-community/genmedia-cli/refs/heads/main/skills";
const DEFAULT_AGENT_LINKS = [".claude/skills"];

export const SKILLS_DIR = ".agents/skills";
export const INSTALLED_MANIFEST = join(SKILLS_DIR, ".installed.json");

export interface SkillFileEntry {
  path: string;
  sha256: string;
  bytes: number;
}

export interface SkillEntry {
  name: string;
  description: string;
  files: SkillFileEntry[];
}

export interface SkillsIndex {
  version: 1;
  skills: SkillEntry[];
}

export interface InstalledSkill {
  name: string;
  description: string;
  files: string[];
  sha256: Record<string, string>;
  installedAt: string;
  source: string;
  agentLinks: Array<{ path: string; kind: "symlink" | "junction" | "copy" }>;
}

export interface InstalledManifest {
  version: 1;
  skills: InstalledSkill[];
}

export function getRegistryUrl(): string {
  return (process.env.GENMEDIA_SKILLS_URL ?? DEFAULT_REGISTRY_URL).replace(
    /\/+$/,
    "",
  );
}

export function getAgentLinkPaths(): string[] {
  const env = process.env.GENMEDIA_AGENT_LINKS;
  if (!env) return DEFAULT_AGENT_LINKS;
  return env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "genmedia-cli" },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  return res.text();
}

export async function fetchIndex(): Promise<SkillsIndex> {
  const url = `${getRegistryUrl()}/index.json`;
  const body = await fetchText(url);
  try {
    return JSON.parse(body) as SkillsIndex;
  } catch {
    throw new Error(`Invalid index.json at ${url}`);
  }
}

export async function fetchSkillFile(
  skill: string,
  file: string,
): Promise<string> {
  return fetchText(`${getRegistryUrl()}/${skill}/${file}`);
}

export function sha256(body: string): string {
  return createHash("sha256").update(body, "utf-8").digest("hex");
}

function resolveInsideRoot(root: string, relPath: string): string {
  const absRoot = resolve(root);
  const target = resolve(absRoot, relPath);
  const rel = relative(absRoot, target);
  if (rel.startsWith("..") || rel === "" || resolve(target) !== target) {
    throw new Error(`Refusing to write outside skill dir: ${relPath}`);
  }
  return target;
}

export function writeSkillFiles(
  cwd: string,
  skill: string,
  files: Array<{ path: string; content: string }>,
): string {
  const skillRoot = join(cwd, SKILLS_DIR, skill);
  if (existsSync(skillRoot)) {
    rmSync(skillRoot, { recursive: true, force: true });
  }
  mkdirSync(skillRoot, { recursive: true });

  for (const file of files) {
    const dest = resolveInsideRoot(skillRoot, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.content, "utf-8");
  }
  return skillRoot;
}

export function removeSkillDir(cwd: string, skill: string): boolean {
  const skillRoot = join(cwd, SKILLS_DIR, skill);
  if (!existsSync(skillRoot)) return false;
  rmSync(skillRoot, { recursive: true, force: true });
  return true;
}

export function readInstalledManifest(cwd: string): InstalledManifest {
  const path = join(cwd, INSTALLED_MANIFEST);
  if (!existsSync(path)) return { version: 1, skills: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as InstalledManifest;
    if (parsed.version !== 1 || !Array.isArray(parsed.skills)) {
      return { version: 1, skills: [] };
    }
    return parsed;
  } catch {
    return { version: 1, skills: [] };
  }
}

export function writeInstalledManifest(
  cwd: string,
  manifest: InstalledManifest,
): void {
  const path = join(cwd, INSTALLED_MANIFEST);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

export function upsertInstalled(
  manifest: InstalledManifest,
  entry: InstalledSkill,
): InstalledManifest {
  const skills = manifest.skills.filter((s) => s.name !== entry.name);
  skills.push(entry);
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { ...manifest, skills };
}

export function removeInstalled(
  manifest: InstalledManifest,
  name: string,
): InstalledManifest {
  return {
    ...manifest,
    skills: manifest.skills.filter((s) => s.name !== name),
  };
}

export interface LinkResult {
  path: string;
  kind: "symlink" | "junction" | "copy";
}

function copyDirSync(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

export function linkSkillForAgent(
  cwd: string,
  skill: string,
  linkPath: string,
): LinkResult {
  const source = resolve(cwd, SKILLS_DIR, skill);
  const target = resolve(cwd, linkPath, skill);

  mkdirSync(dirname(target), { recursive: true });

  if (existsSync(target)) {
    try {
      unlinkSync(target);
    } catch {
      rmSync(target, { recursive: true, force: true });
    }
  }

  const relSource = relative(dirname(target), source);

  if (process.platform === "win32") {
    try {
      symlinkSync(source, target, "junction");
      return { path: join(linkPath, skill), kind: "junction" };
    } catch {
      copyDirSync(source, target);
      return { path: join(linkPath, skill), kind: "copy" };
    }
  }

  try {
    symlinkSync(relSource, target, "dir");
    try {
      chmodSync(target, 0o755);
    } catch {
      // chmod of a symlink target is best-effort
    }
    return { path: join(linkPath, skill), kind: "symlink" };
  } catch {
    copyDirSync(source, target);
    return { path: join(linkPath, skill), kind: "copy" };
  }
}

export function removeAgentLink(
  cwd: string,
  skill: string,
  linkPath: string,
): boolean {
  const target = resolve(cwd, linkPath, skill);
  if (!existsSync(target)) return false;
  try {
    unlinkSync(target);
  } catch {
    rmSync(target, { recursive: true, force: true });
  }
  return true;
}

export function findSkill(
  index: SkillsIndex,
  name: string,
): SkillEntry | undefined {
  return index.skills.find((s) => s.name === name);
}
