import { defineCommand } from "citty";
import { isJsonOutput, output } from "../../lib/output";
import { installSkill } from "../../lib/skills-install";
import { SKILLS_DIR } from "../../lib/skills-registry";
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

    if (isJsonOutput()) {
      output({
        ...result,
        skillsDir: SKILLS_DIR,
      });
      return;
    }

    if (result.status === "skipped") {
      return;
    }

    process.stdout.write("\n");
    process.stdout.write(
      `  ${colors.bold(result.name)}  ${colors.dim(`→ ${SKILLS_DIR}/${result.name}`)}\n`,
    );
    for (const link of result.agentLinks) {
      process.stdout.write(
        `    ${colors.dim(`↳ ${link.path} (${link.kind})`)}\n`,
      );
    }
    process.stdout.write(
      `\n${colors.dim("Commit .agents/ and the symlinks so teammates get the same skills.")}\n\n`,
    );
  },
});
