import { join } from "node:path";
import {
  removeSkillDir,
  resolveSkillsBase,
  sha256,
  writeSkillFiles,
} from "../skills-registry";
import type {
  AgentTarget,
  SkillContent,
  TargetOptions,
  TargetRemoveResult,
  TargetWriteResult,
} from "./types";

const CLAUDE_DEFAULT_BASE = ".claude/skills";

function pickBase(cwd: string): string {
  return resolveSkillsBase(cwd) ?? CLAUDE_DEFAULT_BASE;
}

export const claudeTarget: AgentTarget = {
  kind: "claude",

  enabled(_cwd, opts: TargetOptions) {
    if (opts.only && !opts.only.includes("claude")) return false;
    if (opts.exclude?.includes("claude")) return false;
    return true;
  },

  async write(cwd, skill: SkillContent): Promise<TargetWriteResult> {
    const base = pickBase(cwd);
    writeSkillFiles(cwd, base, skill.name, skill.files);

    const paths: string[] = [];
    const hashes: Record<string, string> = {};
    for (const f of skill.files) {
      const rel = join(base, skill.name, f.path);
      paths.push(rel);
      hashes[rel] = sha256(f.content);
    }
    return { kind: "claude", paths, sha256: hashes };
  },

  async remove(cwd, skillName): Promise<TargetRemoveResult> {
    const base = pickBase(cwd);
    const removed = removeSkillDir(cwd, base, skillName);
    return {
      kind: "claude",
      paths: removed ? [join(base, skillName)] : [],
    };
  },
};
