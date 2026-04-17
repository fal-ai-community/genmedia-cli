import { defineCommand } from "citty";
import { isJsonOutput, output } from "../lib/output";
import { getIndex, installSkill } from "../lib/skills-install";
import { SKILLS_DIR } from "../lib/skills-registry";
import { colors, createSpinner, symbols } from "../lib/ui";

const DEFAULT_BUNDLE = ["genmedia", "genmedia-ref"];

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

    const results: Array<{ name: string; status: string }> = [];
    for (const name of DEFAULT_BUNDLE) {
      const result = await installSkill(cwd, name, {
        force: Boolean(args.force),
        sharedIndex: index,
        spinner,
      });
      results.push({ name, status: result.status });
    }

    spinner.succeed("Default skills installed");

    if (isJsonOutput()) {
      output({ skills: results, skillsDir: SKILLS_DIR });
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
    process.stdout.write(
      `\n${colors.dim(`Tip: commit ${SKILLS_DIR}/ and the symlinks so teammates get the same skills.`)}\n\n`,
    );
  },
});
