import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../skills-registry";
import type {
  AgentTarget,
  SkillContent,
  TargetOptions,
  TargetRemoveResult,
  TargetWriteResult,
} from "./types";

const AGENTS_MD = "AGENTS.md";

function beginMarker(skillName: string): string {
  return `<!-- BEGIN genmedia:${skillName} -->`;
}
function endMarker(skillName: string): string {
  return `<!-- END genmedia:${skillName} -->`;
}

export function renderAgentsBlock(skill: SkillContent): string {
  const begin = beginMarker(skill.name);
  const end = endMarker(skill.name);
  const heading =
    skill.name === "genmedia" ? "## genmedia CLI" : `## ${skill.name}`;
  const body = skill.body.trim();
  return `${begin}\n${heading}\n\n${body}\n${end}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mergeAgentsMd(
  existing: string | null,
  block: string,
  skillName: string,
): string {
  const begin = escapeRegex(beginMarker(skillName));
  const end = escapeRegex(endMarker(skillName));
  const blockRe = new RegExp(`${begin}[\\s\\S]*?${end}`);

  if (existing === null || existing === "") {
    return `${block}\n`;
  }
  if (blockRe.test(existing)) {
    return existing.replace(blockRe, block);
  }
  const sep = existing.endsWith("\n\n")
    ? ""
    : existing.endsWith("\n")
      ? "\n"
      : "\n\n";
  return `${existing}${sep}${block}\n`;
}

export function stripAgentsBlock(
  existing: string,
  skillName: string,
): { content: string; removed: boolean } {
  const begin = escapeRegex(beginMarker(skillName));
  const end = escapeRegex(endMarker(skillName));
  const blockRe = new RegExp(`\\n*${begin}[\\s\\S]*?${end}\\n*`);
  if (!blockRe.test(existing)) return { content: existing, removed: false };
  const next = existing.replace(blockRe, "\n");
  return {
    content: next.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, ""),
    removed: true,
  };
}

export const agentsMdTarget: AgentTarget = {
  kind: "agents-md",

  enabled(_cwd, opts: TargetOptions) {
    if (opts.only && !opts.only.includes("agents-md")) return false;
    if (opts.exclude?.includes("agents-md")) return false;
    return true;
  },

  async write(cwd, skill: SkillContent): Promise<TargetWriteResult> {
    const abs = join(cwd, AGENTS_MD);
    const existing = existsSync(abs) ? readFileSync(abs, "utf-8") : null;
    const block = renderAgentsBlock(skill);
    const next = mergeAgentsMd(existing, block, skill.name);
    writeFileSync(abs, next, "utf-8");
    return {
      kind: "agents-md",
      paths: [AGENTS_MD],
      sha256: { [AGENTS_MD]: sha256(next) },
    };
  },

  async remove(cwd, skillName): Promise<TargetRemoveResult> {
    const abs = join(cwd, AGENTS_MD);
    if (!existsSync(abs)) return { kind: "agents-md", paths: [] };
    const existing = readFileSync(abs, "utf-8");
    const { content, removed } = stripAgentsBlock(existing, skillName);
    if (!removed) return { kind: "agents-md", paths: [] };
    if (content.trim() === "") {
      // No other content — leave the file with our last fingerprint removed but don't delete it,
      // since the user may not have created it.
      writeFileSync(abs, "", "utf-8");
    } else {
      writeFileSync(abs, content, "utf-8");
    }
    return { kind: "agents-md", paths: [AGENTS_MD] };
  },
};
