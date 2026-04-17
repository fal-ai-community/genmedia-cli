import { error } from "./output";
import {
  fetchIndex,
  fetchSkillFile,
  findSkill,
  getAgentLinkPaths,
  getRegistryUrl,
  type InstalledSkill,
  type LinkResult,
  linkSkillForAgent,
  readInstalledManifest,
  removeAgentLink,
  removeInstalled,
  removeSkillDir,
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
  agentLinks: LinkResult[];
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
      agentLinks: [],
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

  writeSkillFiles(cwd, name, files);
  const agentLinks = getAgentLinkPaths().map((p) =>
    linkSkillForAgent(cwd, name, p),
  );

  const record: InstalledSkill = {
    name: entry.name,
    description: entry.description,
    files: entry.files.map((f) => f.path),
    sha256: Object.fromEntries(entry.files.map((f) => [f.path, f.sha256])),
    installedAt: new Date().toISOString(),
    source: `${getRegistryUrl()}/${name}`,
    agentLinks,
  };
  manifest = upsertInstalled(manifest, record);
  writeInstalledManifest(cwd, manifest);

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
    agentLinks,
    files: entry.files.map((f) => f.path),
  };
}

export function uninstallSkill(
  cwd: string,
  name: string,
): { removed: boolean; links: string[] } {
  let manifest = readInstalledManifest(cwd);
  const entry = manifest.skills.find((s) => s.name === name);
  const removedLinks: string[] = [];

  for (const link of entry?.agentLinks ?? []) {
    const parts = link.path.split("/");
    const basePath = parts.slice(0, -1).join("/");
    if (removeAgentLink(cwd, name, basePath)) {
      removedLinks.push(link.path);
    }
  }

  const fileRemoved = removeSkillDir(cwd, name);
  manifest = removeInstalled(manifest, name);
  writeInstalledManifest(cwd, manifest);

  return { removed: Boolean(entry) || fileRemoved, links: removedLinks };
}
