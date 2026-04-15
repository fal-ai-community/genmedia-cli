import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { isJsonOutput, output } from "../lib/output";
import { colors, symbols } from "../lib/ui";
import { GENMEDIA_REF_SKILL, GENMEDIA_WORKFLOW_SKILL } from "../skills/index";

const COMMANDS_DIR = ".claude/commands";

const SKILLS: Array<{ filename: string; content: string; label: string }> = [
  {
    filename: "genmedia-ref.md",
    content: GENMEDIA_REF_SKILL,
    label: "Background reference (auto-loaded by Claude)",
  },
  {
    filename: "genmedia.md",
    content: GENMEDIA_WORKFLOW_SKILL,
    label: "Workflow skill (/genmedia)",
  },
];

function printLine(line = ""): void {
  process.stdout.write(`${line}\n`);
}

export default defineCommand({
  meta: {
    name: "init",
    description: "Install Claude Code skills for genmedia into this project",
  },
  args: {
    force: {
      type: "boolean",
      description: "Overwrite existing skill files",
    },
  },
  async run({ args }) {
    const commandsDir = join(process.cwd(), COMMANDS_DIR);

    if (!existsSync(commandsDir)) {
      mkdirSync(commandsDir, { recursive: true });
    }

    const created: string[] = [];
    const skipped: string[] = [];

    for (const skill of SKILLS) {
      const dest = join(commandsDir, skill.filename);
      const relPath = `${COMMANDS_DIR}/${skill.filename}`;

      if (existsSync(dest) && !args.force) {
        skipped.push(relPath);
        continue;
      }

      writeFileSync(dest, skill.content, "utf-8");
      created.push(relPath);
    }

    if (isJsonOutput()) {
      output({ created, skipped });
      return;
    }

    if (created.length > 0) {
      printLine();
      for (const skill of SKILLS) {
        const relPath = `${COMMANDS_DIR}/${skill.filename}`;
        if (created.includes(relPath)) {
          printLine(
            `  ${colors.green(symbols.success)} ${colors.bold(relPath)}  ${colors.dim(skill.label)}`,
          );
        }
      }
      printLine();
      printLine(
        `${colors.dim("Tip: commit these files so all teammates (and agents) get the skills.")}`,
      );
      printLine();
    }

    if (skipped.length > 0) {
      for (const path of skipped) {
        printLine(
          `  ${colors.yellow(symbols.warning)} ${path}  ${colors.dim("already exists — use --force to overwrite")}`,
        );
      }
      if (created.length === 0) printLine();
    }
  },
});
