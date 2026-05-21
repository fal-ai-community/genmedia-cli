import { agentsMdTarget } from "./agents-md";
import { claudeTarget } from "./claude";
import { cursorTarget } from "./cursor";
import { parseFrontmatter } from "./frontmatter";
import type {
  AgentTarget,
  AgentTargetKind,
  SkillContent,
  TargetOptions,
} from "./types";

export const ALL_TARGETS: AgentTarget[] = [
  claudeTarget,
  cursorTarget,
  agentsMdTarget,
];

export function resolveTargets(
  cwd: string,
  opts: TargetOptions = {},
): AgentTarget[] {
  return ALL_TARGETS.filter((t) => t.enabled(cwd, opts));
}

const SKILL_MD_PATH = "SKILL.md";

export function buildSkillContent(
  name: string,
  description: string,
  files: Array<{ path: string; content: string }>,
): SkillContent {
  const skillMd = files.find((f) => f.path === SKILL_MD_PATH);
  if (!skillMd) {
    return {
      name,
      description,
      body: "",
      rawFrontmatter: "",
      files,
    };
  }
  const parsed = parseFrontmatter(skillMd.content);
  const resolvedDescription =
    parsed.fields.description?.trim() || description.trim();
  return {
    name,
    description: resolvedDescription,
    body: parsed.body,
    rawFrontmatter: parsed.raw,
    files,
  };
}

export type { AgentTarget, AgentTargetKind, SkillContent, TargetOptions };
