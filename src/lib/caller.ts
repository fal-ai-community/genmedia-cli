import { randomUUID } from "node:crypto";

export interface CallerInfo {
  agent: string | null;
  agentVersion: string | null;
  agentHost: string | null;
  ci: boolean;
  ciProvider: string | null;
  githubActions: boolean;
  isTty: boolean;
  invocationId: string;
}

const VALID_AGENT_NAME = /^[a-zA-Z0-9_-]+$/;

function envSet(key: string): boolean {
  const v = process.env[key];
  return v !== undefined && v !== "";
}

function envValue(key: string): string {
  return process.env[key] ?? "";
}

// Splits a raw agent string into name and optional version. Accepts either a
// bare slug ("codex") or an underscore-suffixed form ("claude-code_2-1-132_agent")
// that some agents use to embed metadata. Returns null if the leading segment
// doesn't match the safe-name regex.
function parseAgentName(
  raw: string,
): { name: string; version: string | null } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const [head, ...rest] = trimmed.split("_");
  if (!VALID_AGENT_NAME.test(head)) return null;
  return { name: head, version: rest.length > 0 ? rest.join("_") : null };
}

function detectAgent(): { agent: string | null; agentVersion: string | null } {
  // Genmedia-specific override — first so users can self-attribute over any
  // ambient signal.
  const override = envValue("GENMEDIA_USER_AGENT");
  if (override) {
    const parsed = parseAgentName(override);
    if (parsed) return { agent: parsed.name, agentVersion: parsed.version };
  }

  // Generic AI_AGENT — set by Claude Code today, intended to be usable by any
  // agent. Validated to keep header-unsafe values out of telemetry.
  const aiAgent = envValue("AI_AGENT");
  if (aiAgent) {
    const parsed = parseAgentName(aiAgent);
    if (parsed) return { agent: parsed.name, agentVersion: parsed.version };
  }

  // Tool-specific signals. Order matters: more specific matches first.

  // Amp sets both AGENT=amp and CLAUDECODE=1, so check AGENT first.
  if (envValue("AGENT") === "amp") return { agent: "amp", agentVersion: null };

  // OpenAI Codex CLI — leaks CODEX_SANDBOX / CODEX_CI / CODEX_THREAD_ID
  // (per cli/cli internal/agents/detect.go and Codex codex-rs source).
  if (
    envSet("CODEX_SANDBOX") ||
    envSet("CODEX_CI") ||
    envSet("CODEX_THREAD_ID")
  ) {
    return { agent: "codex", agentVersion: null };
  }

  if (envSet("GEMINI_CLI")) {
    return { agent: "gemini-cli", agentVersion: null };
  }

  if (envSet("COPILOT_CLI")) {
    return { agent: "copilot-cli", agentVersion: null };
  }

  if (envSet("OPENCODE")) {
    return { agent: "opencode", agentVersion: null };
  }

  if (envSet("CURSOR_AGENT")) {
    return { agent: "cursor-agent", agentVersion: null };
  }

  if (envSet("AIDER_VERSION") || envSet("AIDER_MODEL")) {
    return {
      agent: "aider",
      agentVersion: envValue("AIDER_VERSION") || null,
    };
  }

  if (envSet("CLINE")) return { agent: "cline", agentVersion: null };
  if (envSet("CONTINUE_GLOBAL_DIR")) {
    return { agent: "continue", agentVersion: null };
  }
  if (envSet("ZED_TERM")) return { agent: "zed", agentVersion: null };

  // Claude Code — last because Amp also sets CLAUDECODE=1. Newer releases
  // dropped CLAUDECODE in favor of CLAUDE_CODE_ENTRYPOINT; accept either.
  if (envSet("CLAUDECODE") || envSet("CLAUDE_CODE_ENTRYPOINT")) {
    return { agent: "claude-code", agentVersion: null };
  }

  return { agent: null, agentVersion: null };
}

const TERM_PROGRAM_MAP: Record<string, string> = {
  vscode: "vscode",
  "iTerm.app": "iterm",
  Apple_Terminal: "apple-terminal",
  WarpTerminal: "warp",
  ghostty: "ghostty",
  Hyper: "hyper",
  tabby: "tabby",
  WezTerm: "wezterm",
  alacritty: "alacritty",
  kitty: "kitty",
};

function detectAgentHost(): string | null {
  // Cursor forks VSCode and inherits TERM_PROGRAM=vscode, so detect it
  // separately from its CLI marker.
  if (envSet("CURSOR_CLI")) return "cursor";

  const term = envValue("TERM_PROGRAM");
  if (!term) return null;
  return TERM_PROGRAM_MAP[term] ?? term.toLowerCase();
}

function detectCi(): {
  ci: boolean;
  ciProvider: string | null;
  githubActions: boolean;
} {
  const githubActions = envValue("GITHUB_ACTIONS") === "true";

  let ciProvider: string | null = null;
  if (githubActions) ciProvider = "github_actions";
  else if (envSet("GITLAB_CI")) ciProvider = "gitlab_ci";
  else if (envSet("CIRCLECI")) ciProvider = "circleci";
  else if (envSet("BUILDKITE")) ciProvider = "buildkite";
  else if (envSet("JENKINS_URL")) ciProvider = "jenkins";
  else if (envSet("TRAVIS")) ciProvider = "travis";
  else if (envSet("APPVEYOR")) ciProvider = "appveyor";
  else if (envSet("CIRRUS_CI")) ciProvider = "cirrus_ci";
  else if (envSet("TF_BUILD")) ciProvider = "azure_pipelines";
  else if (envSet("TEAMCITY_VERSION")) ciProvider = "teamcity";

  // Same generic heuristic as cli/cli internal/ci/ci.go, plus any specific
  // provider match above.
  const ci =
    ciProvider !== null ||
    envSet("CI") ||
    envSet("BUILD_NUMBER") ||
    envSet("RUN_ID");

  return { ci, ciProvider, githubActions };
}

let _cached: CallerInfo | null = null;

export function getCallerInfo(): CallerInfo {
  if (_cached) return _cached;
  const { agent, agentVersion } = detectAgent();
  const { ci, ciProvider, githubActions } = detectCi();
  _cached = {
    agent,
    agentVersion,
    agentHost: detectAgentHost(),
    ci,
    ciProvider,
    githubActions,
    isTty: Boolean(process.stdout.isTTY),
    invocationId: randomUUID(),
  };
  return _cached;
}
