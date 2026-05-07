import { defineCommand } from "citty";
import { track } from "../../lib/analytics";
import { isJsonOutput, output } from "../../lib/output";
import { installSkill } from "../../lib/skills-install";
import { colors } from "../../lib/ui";

export default defineCommand({
  meta: {
    name: "install",
    description: "Install a skill from the genmedia registry",
  },
  args: {
    name: {
      type: "positional",
      required: true,
      description: "Skill name",
    },
    force: {
      type: "boolean",
      description: "Reinstall even if the skill is already present",
    },
  },
  async run({ args }) {
    const result = await installSkill(process.cwd(), args.name, {
      force: Boolean(args.force),
    });

    track("skills_installed", {
      name: args.name,
      status: result.status,
      force: Boolean(args.force),
    });

    if (isJsonOutput()) {
      output(result);
      return;
    }

    if (result.status === "skipped") {
      return;
    }

    process.stdout.write("\n");
    process.stdout.write(
      `  ${colors.bold(result.name)}  ${colors.dim(`→ ${result.installedDir}`)}\n`,
    );
    process.stdout.write(
      `\n${colors.dim(`Commit ${result.installedDir} so teammates get the same skills.`)}\n\n`,
    );
  },
});
