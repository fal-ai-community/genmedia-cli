export type AgentTargetKind = "claude" | "cursor" | "agents-md";

export interface SkillContent {
  name: string;
  description: string;
  body: string;
  rawFrontmatter: string;
  files: Array<{ path: string; content: string }>;
}

export interface TargetWriteResult {
  kind: AgentTargetKind;
  paths: string[];
  sha256: Record<string, string>;
}

export interface TargetRemoveResult {
  kind: AgentTargetKind;
  paths: string[];
}

export interface TargetOptions {
  only?: AgentTargetKind[];
  exclude?: AgentTargetKind[];
}

export interface AgentTarget {
  kind: AgentTargetKind;
  enabled(cwd: string, opts: TargetOptions): boolean;
  write(cwd: string, skill: SkillContent): Promise<TargetWriteResult>;
  remove(cwd: string, skillName: string): Promise<TargetRemoveResult>;
}
