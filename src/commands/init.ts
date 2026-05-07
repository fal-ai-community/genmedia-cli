import { defineCommand } from "citty";
import { track } from "../lib/analytics";
import { isJsonOutput, output } from "../lib/output";
import { getIndex, installSkill } from "../lib/skills-install";
import { resolveSkillsBase } from "../lib/skills-registry";
import { colors, createSpinner, symbols } from "../lib/ui";

const DEFAULT_BUNDLE = ["genmedia"];

export default defineCommand({
  meta: {
    name: "init",
    description:
      "Install the default genmedia skill bundle (alias for `skills install`)",
  },
  args: {
    force: {
      type: "boolean",
      description: "Reinstall even if the skills are already present",
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const spinner = createSpinner("Fetching registry…");
    spinner.start();

    const index = await getIndex();
    spinner.update("Installing default skills…");

    const results: Array<{
      name: string;
      status: string;
      installedDir: string;
    }> = [];
    for (const name of DEFAULT_BUNDLE) {
      const result = await installSkill(cwd, name, {
        force: Boolean(args.force),
        sharedIndex: index,
        spinner,
      });
      results.push({
        name,
        status: result.status,
        installedDir: result.installedDir,
      });
      track("skills_installed", {
        name,
        status: result.status,
        force: Boolean(args.force),
        source: "init",
      });
    }

    spinner.succeed("Default skills installed");

    const skillsBase = resolveSkillsBase(cwd);

    if (isJsonOutput()) {
      output({ skills: results, skillsDir: skillsBase });
      return;
    }

    process.stdout.write("\n");
    for (const r of results) {
      const icon =
        r.status === "skipped"
          ? colors.yellow(symbols.warning)
          : colors.green(symbols.success);
      process.stdout.write(
        `  ${icon} ${colors.bold(r.name)}  ${colors.dim(r.status)}\n`,
      );
    }
    if (skillsBase) {
      process.stdout.write(
        `\n${colors.dim(`Tip: commit ${skillsBase}/ so teammates get the same skills.`)}\n\n`,
      );
    } else {
      process.stdout.write("\n");
    }
  },
});
