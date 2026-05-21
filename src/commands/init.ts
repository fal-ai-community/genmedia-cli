import { defineCommand } from "citty";
import type { AgentTargetKind, TargetOptions } from "../lib/agent-targets";
import { track } from "../lib/analytics";
import { isJsonOutput, output } from "../lib/output";
import { getIndex, installSkill } from "../lib/skills-install";
import { resolveSkillsBase } from "../lib/skills-registry";
import { colors, createSpinner, symbols } from "../lib/ui";

const DEFAULT_BUNDLE = ["genmedia"];

const VALID_TARGETS: readonly AgentTargetKind[] = [
  "claude",
  "cursor",
  "agents-md",
];

function parseTargetsFlag(
  raw: string | undefined,
): AgentTargetKind[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean) as AgentTargetKind[];
  for (const p of parts) {
    if (!VALID_TARGETS.includes(p)) {
      throw new Error(
        `Unknown target '${p}'. Valid targets: ${VALID_TARGETS.join(", ")}`,
      );
    }
  }
  return parts;
}

function buildTargetOptions(args: Record<string, unknown>): TargetOptions {
  const exclude: AgentTargetKind[] = [];
  if (args.claude === false) exclude.push("claude");
  if (args.cursor === false) exclude.push("cursor");
  if (args["agents-md"] === false) exclude.push("agents-md");
  const only = parseTargetsFlag(args.targets as string | undefined);
  return { only, exclude: exclude.length ? exclude : undefined };
}

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
    targets: {
      type: "string",
      description:
        "Comma-separated list of agent targets (claude, cursor, agents-md). Default: all.",
    },
    claude: {
      type: "boolean",
      default: true,
      description:
        "Write to .claude/skills/ (or .agents/skills/). Use --no-claude to skip.",
    },
    cursor: {
      type: "boolean",
      default: true,
      description:
        "Write the Cursor rule (.cursor/rules/<name>.mdc). Use --no-cursor to skip.",
    },
    "agents-md": {
      type: "boolean",
      default: true,
      description:
        "Append a fenced block to AGENTS.md. Use --no-agents-md to skip.",
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const targetOptions = buildTargetOptions(args as Record<string, unknown>);
    const spinner = createSpinner("Fetching registry…");
    spinner.start();

    const index = await getIndex();
    spinner.update("Installing default skills…");

    const results = [];
    for (const name of DEFAULT_BUNDLE) {
      const result = await installSkill(cwd, name, {
        force: Boolean(args.force),
        sharedIndex: index,
        spinner,
        targetOptions,
      });
      results.push(result);
      track("skills_installed", {
        name,
        status: result.status,
        force: Boolean(args.force),
        source: "init",
        targets: result.targets.map((t) => t.kind),
      });
    }

    spinner.succeed("Default skills installed");

    const skillsBase = resolveSkillsBase(cwd);

    if (isJsonOutput()) {
      output({
        skills: results.map((r) => ({
          name: r.name,
          status: r.status,
          installedDir: r.installedDir,
          targets: r.targets,
        })),
        skillsDir: skillsBase,
      });
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
      for (const t of r.targets) {
        for (const p of t.paths) {
          process.stdout.write(`      ${colors.dim(`→ ${t.kind}: ${p}`)}\n`);
        }
      }
    }
    process.stdout.write(
      `\n${colors.dim(
        `Tip: commit the written files so teammates and AI agents pick up the same skills.`,
      )}\n\n`,
    );
  },
});
