import { error } from "./output";
import {
  AGENT_ROOTS,
  fetchIndex,
  fetchSkillFile,
  findSkill,
  getRegistryUrl,
  type InstalledSkill,
  readInstalledManifest,
  removeInstalled,
  removeSkillDir,
  resolveSkillsBase,
  type SkillsIndex,
  sha256,
  upsertInstalled,
  writeInstalledManifest,
  writeSkillFiles,
} from "./skills-registry";
import { colors, createSpinner, symbols } from "./ui";

export interface InstallOptions {
  force?: boolean;
  silent?: boolean;
  sharedIndex?: SkillsIndex;
  spinner?: ReturnType<typeof createSpinner>;
}

export interface InstallResult {
  name: string;
  status: "installed" | "updated" | "skipped";
  installedDir: string;
  files: string[];
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

function requireSkillsBase(cwd: string): string {
  const base = resolveSkillsBase(cwd);
  if (!base) {
    error(
      `No agent directory found. Create '${AGENT_ROOTS[0]}/' or '${AGENT_ROOTS[1]}/' in this project and try again.`,
      { checked: AGENT_ROOTS.map((r) => `${r}/`) },
    );
  }
  return base;
}

export async function installSkill(
  cwd: string,
  name: string,
  options: InstallOptions = {},
): Promise<InstallResult> {
  const base = requireSkillsBase(cwd);

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
    if (ownSpinner) {
      spinner.stop();
    }
    if (!options.silent) {
      spinner.log(
        `${colors.yellow(symbols.warning)} ${name} already installed (use --force to reinstall)`,
      );
    }
    return {
      name,
      status: "skipped",
      installedDir: `${base}/${name}`,
      files: entry.files.map((f) => f.path),
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

  writeSkillFiles(cwd, base, name, files);

  const record: InstalledSkill = {
    name: entry.name,
    description: entry.description,
    files: entry.files.map((f) => f.path),
    sha256: Object.fromEntries(entry.files.map((f) => [f.path, f.sha256])),
    installedAt: new Date().toISOString(),
    source: `${getRegistryUrl()}/${name}`,
  };
  manifest = upsertInstalled(manifest, record);
  writeInstalledManifest(cwd, base, manifest);

  if (ownSpinner && !options.silent) {
    spinner.succeed(
      `${already ? "Updated" : "Installed"} ${colors.bold(name)}`,
    );
  } else if (!options.silent) {
    spinner.log(
      `  ${colors.green(symbols.success)} ${colors.bold(name)}  ${colors.dim(`${files.length} file${files.length === 1 ? "" : "s"}`)}`,
    );
  }

  return {
    name,
    status: already ? "updated" : "installed",
    installedDir: `${base}/${name}`,
    files: entry.files.map((f) => f.path),
  };
}

export function uninstallSkill(
  cwd: string,
  name: string,
): { removed: boolean; installedDir: string | null } {
  const base = resolveSkillsBase(cwd);
  if (!base) {
    return { removed: false, installedDir: null };
  }

  let manifest = readInstalledManifest(cwd);
  const entry = manifest.skills.find((s) => s.name === name);

  const fileRemoved = removeSkillDir(cwd, base, name);
  manifest = removeInstalled(manifest, name);
  writeInstalledManifest(cwd, base, manifest);

  return {
    removed: Boolean(entry) || fileRemoved,
    installedDir: `${base}/${name}`,
  };
}
