import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentTargetKind,
  ALL_TARGETS,
  buildSkillContent,
  resolveTargets,
  type TargetOptions,
} from "./agent-targets";
import { error } from "./output";
import {
  fetchIndex,
  fetchSkillFile,
  findSkill,
  getRegistryUrl,
  type InstalledSkill,
  type InstalledTarget,
  readInstalledManifest,
  removeInstalled,
  removeSkillDir,
  resolveSkillsBase,
  type SkillsIndex,
  sha256,
  upsertInstalled,
  writeInstalledManifest,
} from "./skills-registry";
import { colors, createSpinner, symbols } from "./ui";

const DEFAULT_MANIFEST_BASE = ".claude/skills";

export interface InstallOptions {
  force?: boolean;
  silent?: boolean;
  sharedIndex?: SkillsIndex;
  spinner?: ReturnType<typeof createSpinner>;
  targetOptions?: TargetOptions;
}

export interface InstallTargetResult {
  kind: AgentTargetKind;
  paths: string[];
}

export interface InstallResult {
  name: string;
  status: "installed" | "updated" | "skipped";
  installedDir: string;
  files: string[];
  targets: InstallTargetResult[];
}

export async function getIndex(): Promise<SkillsIndex> {
  try {
    return await fetchIndex();
  } catch (e) {
    error(`Could not reach skills registry`, {
      url: getRegistryUrl(),
      message: (e as Error).message,
    });
  }
}

function manifestBase(cwd: string): string {
  const resolved = resolveSkillsBase(cwd);
  if (resolved) return resolved;
  mkdirSync(join(cwd, DEFAULT_MANIFEST_BASE), { recursive: true });
  return DEFAULT_MANIFEST_BASE;
}

export async function installSkill(
  cwd: string,
  name: string,
  options: InstallOptions = {},
): Promise<InstallResult> {
  const spinner = options.spinner ?? createSpinner();
  const ownSpinner = !options.spinner;
  if (ownSpinner && !options.silent) spinner.start(`Fetching registry…`);

  const index = options.sharedIndex ?? (await getIndex());
  const entry = findSkill(index, name);
  if (!entry) {
    if (ownSpinner) spinner.fail(`Unknown skill: ${name}`);
    error(`Skill '${name}' not found in registry`, {
      available: index.skills.map((s) => s.name),
    });
  }

  let manifest = readInstalledManifest(cwd);
  const already = manifest.skills.some((s) => s.name === name);
  if (already && !options.force) {
    if (ownSpinner) spinner.stop();
    if (!options.silent) {
      spinner.log(
        `${colors.yellow(symbols.warning)} ${name} already installed (use --force to reinstall)`,
      );
    }
    const previous = manifest.skills.find((s) => s.name === name);
    return {
      name,
      status: "skipped",
      installedDir: `${manifestBase(cwd)}/${name}`,
      files: entry.files.map((f) => f.path),
      targets:
        previous?.targets?.map((t) => ({ kind: t.kind, paths: t.paths })) ?? [],
    };
  }

  if (!options.silent) spinner.update(`Downloading ${name}…`);

  const files: Array<{ path: string; content: string }> = [];
  for (const f of entry.files) {
    const content = await fetchSkillFile(name, f.path);
    const got = sha256(content);
    if (got !== f.sha256) {
      if (ownSpinner) spinner.fail(`Checksum mismatch for ${name}/${f.path}`);
      error(
        `Integrity check failed for ${name}/${f.path}. The registry index may be stale.`,
        { expected: f.sha256, actual: got },
      );
    }
    files.push({ path: f.path, content });
  }

  const skill = buildSkillContent(name, entry.description, files);

  const enabledTargets = resolveTargets(cwd, options.targetOptions ?? {});
  const targetWrites: InstalledTarget[] = [];
  for (const target of enabledTargets) {
    const result = await target.write(cwd, skill);
    targetWrites.push({
      kind: result.kind,
      paths: result.paths,
      sha256: result.sha256,
    });
  }

  const base = manifestBase(cwd);
  const claudeWrite = targetWrites.find((t) => t.kind === "claude");

  const record: InstalledSkill = {
    name: entry.name,
    description: entry.description,
    files: claudeWrite?.paths ?? entry.files.map((f) => f.path),
    sha256:
      claudeWrite?.sha256 ??
      Object.fromEntries(entry.files.map((f) => [f.path, f.sha256])),
    installedAt: new Date().toISOString(),
    source: `${getRegistryUrl()}/${name}`,
    targets: targetWrites,
  };
  manifest = upsertInstalled(manifest, record);
  writeInstalledManifest(cwd, base, manifest);

  if (ownSpinner && !options.silent) {
    spinner.succeed(
      `${already ? "Updated" : "Installed"} ${colors.bold(name)}`,
    );
  } else if (!options.silent) {
    const targetSummary = targetWrites.map((t) => t.kind).join(", ");
    spinner.log(
      `  ${colors.green(symbols.success)} ${colors.bold(name)}  ${colors.dim(targetSummary)}`,
    );
  }

  return {
    name,
    status: already ? "updated" : "installed",
    installedDir: `${base}/${name}`,
    files: entry.files.map((f) => f.path),
    targets: targetWrites.map((t) => ({ kind: t.kind, paths: t.paths })),
  };
}

export interface UninstallResult {
  removed: boolean;
  installedDir: string | null;
  targets: InstallTargetResult[];
}

export async function uninstallSkill(
  cwd: string,
  name: string,
): Promise<UninstallResult> {
  const base = resolveSkillsBase(cwd);
  let manifest = readInstalledManifest(cwd);
  const entry = manifest.skills.find((s) => s.name === name);

  const removed: InstallTargetResult[] = [];

  if (entry?.targets && entry.targets.length > 0) {
    for (const t of entry.targets) {
      const target = ALL_TARGETS.find((x) => x.kind === t.kind);
      if (!target) continue;
      const result = await target.remove(cwd, name);
      if (result.paths.length > 0) {
        removed.push({ kind: result.kind, paths: result.paths });
      }
    }
  } else if (base) {
    const fileRemoved = removeSkillDir(cwd, base, name);
    if (fileRemoved) {
      removed.push({ kind: "claude", paths: [`${base}/${name}`] });
    }
  }

  manifest = removeInstalled(manifest, name);
  if (base) {
    writeInstalledManifest(cwd, base, manifest);
  } else if (existsSync(join(cwd, DEFAULT_MANIFEST_BASE))) {
    writeInstalledManifest(cwd, DEFAULT_MANIFEST_BASE, manifest);
  }

  return {
    removed: Boolean(entry) || removed.length > 0,
    installedDir: base ? `${base}/${name}` : null,
    targets: removed,
  };
}
