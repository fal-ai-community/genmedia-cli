import { defineCommand } from "citty";
import { isJsonOutput, output } from "../../lib/output";
import { getIndex, installSkill } from "../../lib/skills-install";
import { readInstalledManifest } from "../../lib/skills-registry";
import { colors, symbols } from "../../lib/ui";

export default defineCommand({
  meta: {
    name: "update",
    description: "Re-fetch installed skills (or a specific one)",
  },
  args: {
    name: {
      type: "positional",
      required: false,
      description: "Skill name (omit to update all installed skills)",
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const manifest = readInstalledManifest(cwd);
    const targets = args.name
      ? [args.name]
      : manifest.skills.map((s) => s.name);

    if (targets.length === 0) {
      if (isJsonOutput()) {
        output({ updated: [] });
      } else {
        process.stdout.write(
          `\n  ${colors.dim("No skills installed. Try:")} genmedia skills install <name>\n\n`,
        );
      }
      return;
    }

    const index = await getIndex();
    const updated: Array<{ name: string; status: string }> = [];

    for (const name of targets) {
      const result = await installSkill(cwd, name, {
        force: true,
        sharedIndex: index,
      });
      updated.push({ name, status: result.status });
    }

    if (isJsonOutput()) {
      output({ updated });
      return;
    }

    process.stdout.write("\n");
    for (const u of updated) {
      process.stdout.write(
        `  ${colors.green(symbols.success)} ${colors.bold(u.name)}  ${colors.dim(u.status)}\n`,
      );
    }
    process.stdout.write("\n");
  },
});
