import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256 } from "../skills-registry";
import type {
  AgentTarget,
  SkillContent,
  TargetOptions,
  TargetRemoveResult,
  TargetWriteResult,
} from "./types";

const CURSOR_RULES_DIR = ".cursor/rules";

function rulePath(skillName: string): string {
  return join(CURSOR_RULES_DIR, `${skillName}.mdc`);
}

function escapeYamlDouble(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function renderCursorRule(skill: SkillContent): string {
  const description = skill.description.replace(/\s+/g, " ").trim();
  const lines = [
    "---",
    `description: "${escapeYamlDouble(description)}"`,
    "globs:",
    "alwaysApply: false",
    "---",
    "",
    skill.body.trimEnd(),
    "",
  ];
  return lines.join("\n");
}

export const cursorTarget: AgentTarget = {
  kind: "cursor",

  enabled(_cwd, opts: TargetOptions) {
    if (opts.only && !opts.only.includes("cursor")) return false;
    if (opts.exclude?.includes("cursor")) return false;
    return true;
  },

  async write(cwd, skill: SkillContent): Promise<TargetWriteResult> {
    const rel = rulePath(skill.name);
    const abs = join(cwd, rel);
    mkdirSync(dirname(abs), { recursive: true });
    const content = renderCursorRule(skill);
    writeFileSync(abs, content, "utf-8");
    return {
      kind: "cursor",
      paths: [rel],
      sha256: { [rel]: sha256(content) },
    };
  },

  async remove(cwd, skillName): Promise<TargetRemoveResult> {
    const rel = rulePath(skillName);
    const abs = join(cwd, rel);
    if (!existsSync(abs)) return { kind: "cursor", paths: [] };
    rmSync(abs);
    return { kind: "cursor", paths: [rel] };
  },
};
