import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const DEFAULT_REGISTRY_URL =
  "https://raw.githubusercontent.com/fal-ai-community/genmedia-cli/refs/heads/main/skills";

export const AGENT_ROOTS = [".agents", ".claude"] as const;
const SKILLS_SUBDIR = "skills";
const INSTALLED_MANIFEST_FILE = ".installed.json";

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

export function resolveSkillsBase(cwd: string): string | null {
  for (const root of AGENT_ROOTS) {
    if (existsSync(join(cwd, root))) {
      return join(root, SKILLS_SUBDIR);
    }
  }
  return null;
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
  base: string,
  skill: string,
  files: Array<{ path: string; content: string }>,
): string {
  const skillRoot = join(cwd, base, skill);
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

export function removeSkillDir(
  cwd: string,
  base: string,
  skill: string,
): boolean {
  const skillRoot = join(cwd, base, skill);
  if (!existsSync(skillRoot)) return false;
  rmSync(skillRoot, { recursive: true, force: true });
  return true;
}

export function readInstalledManifest(cwd: string): InstalledManifest {
  const base = resolveSkillsBase(cwd);
  if (!base) return { version: 1, skills: [] };
  const path = join(cwd, base, INSTALLED_MANIFEST_FILE);
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
  base: string,
  manifest: InstalledManifest,
): void {
  const path = join(cwd, base, INSTALLED_MANIFEST_FILE);
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

export function findSkill(
  index: SkillsIndex,
  name: string,
): SkillEntry | undefined {
  return index.skills.find((s) => s.name === name);
}
