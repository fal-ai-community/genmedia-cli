import { defineCommand } from "citty";
import type { AgentTargetKind, TargetOptions } from "../../lib/agent-targets";
import { track } from "../../lib/analytics";
import { isJsonOutput, output } from "../../lib/output";
import { installSkill } from "../../lib/skills-install";
import { colors } from "../../lib/ui";

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
    const targetOptions = buildTargetOptions(args as Record<string, unknown>);
    const result = await installSkill(process.cwd(), args.name, {
      force: Boolean(args.force),
      targetOptions,
    });

    track("skills_installed", {
      name: args.name,
      status: result.status,
      force: Boolean(args.force),
      targets: result.targets.map((t) => t.kind),
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
    for (const t of result.targets) {
      for (const p of t.paths) {
        process.stdout.write(`      ${colors.dim(`→ ${t.kind}: ${p}`)}\n`);
      }
    }
    process.stdout.write(
      `\n${colors.dim(`Commit the written files so teammates get the same skills.`)}\n\n`,
    );
  },
});
