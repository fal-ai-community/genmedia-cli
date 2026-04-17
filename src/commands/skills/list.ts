import { defineCommand } from "citty";
import { error, isJsonOutput, output } from "../../lib/output";
import {
  fetchIndex,
  getRegistryUrl,
  readInstalledManifest,
  type SkillsIndex,
} from "../../lib/skills-registry";
import { colors } from "../../lib/ui";

export default defineCommand({
  meta: {
    name: "list",
    description: "List skills available in the genmedia registry",
  },
  async run() {
    let index: SkillsIndex;
    try {
      index = await fetchIndex();
    } catch (e) {
      error(`Failed to fetch skills registry`, {
        url: getRegistryUrl(),
        message: (e as Error).message,
      });
    }

    const installed = readInstalledManifest(process.cwd());
    const installedNames = new Set(installed.skills.map((s) => s.name));

    const skills = index.skills.map((s) => ({
      name: s.name,
      description: s.description,
      files: s.files.length,
      installed: installedNames.has(s.name),
    }));

    if (isJsonOutput()) {
      output({ registry: getRegistryUrl(), skills });
      return;
    }

    process.stdout.write("\n");
    for (const s of skills) {
      const tag = s.installed
        ? colors.green("[installed]")
        : colors.dim("[available]");
      process.stdout.write(`  ${colors.bold(s.name)}  ${tag}\n`);
      process.stdout.write(`    ${colors.dim(s.description)}\n\n`);
    }
    process.stdout.write(
      `${colors.dim(`Install with: genmedia skills install <name>`)}\n\n`,
    );
  },
});
