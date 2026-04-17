import { defineCommand } from "citty";
import { isJsonOutput, output } from "../../lib/output";
import { uninstallSkill } from "../../lib/skills-install";
import { colors, symbols } from "../../lib/ui";

export default defineCommand({
  meta: {
    name: "remove",
    description: "Remove an installed skill",
  },
  args: {
    name: {
      type: "positional",
      required: true,
      description: "Skill name to remove",
    },
  },
  async run({ args }) {
    const { removed, links } = uninstallSkill(process.cwd(), args.name);

    if (isJsonOutput()) {
      output({ name: args.name, removed, links });
      return;
    }

    if (!removed) {
      process.stdout.write(
        `\n  ${colors.yellow(symbols.warning)} ${colors.bold(args.name)} is not installed\n\n`,
      );
      return;
    }

    process.stdout.write(
      `\n  ${colors.green(symbols.success)} removed ${colors.bold(args.name)}\n\n`,
    );
  },
});
