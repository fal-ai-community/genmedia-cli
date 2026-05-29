import { createHash } from "node:crypto";
import { getCallerInfo } from "./caller";
import {
  type AgentMatch,
  findAgentAncestor as findAgentInAncestors,
  findAgentInTree,
  type ProcessNode,
} from "./process-tree";

export type SessionSource =
  | "override"
  | "agent-env"
  | "process-tree"
  | "terminal-env"
  | "fallback";

export interface SessionContext {
  id: string;
  source: SessionSource;
  agent: string | null;
  agentHost: string | null;
  anchor: string;
  startedAt: number;
}

// Inputs we read from the environment (extracted for pure testing).
export interface SessionEnv {
  GENMEDIA_SESSION_ID?: string;
  CODEX_THREAD_ID?: string;
  CLAUDE_SESSION_ID?: string;
  AMP_THREAD_ID?: string;
  CURSOR_TRACE_ID?: string;
  TERM_SESSION_ID?: string;
  ITERM_SESSION_ID?: string;
  WT_SESSION?: string;
  TMUX_PANE?: string;
}

export interface SessionInputs {
  env: SessionEnv;
  ppid: number;
  agent: string | null;
  // Optional pre-computed ancestor chain (closest parent first). If provided
  // and any element matches a known agent process, that PID becomes the
  // session anchor. Tests pass synthetic chains; the live entrypoint walks
  // `/bin/ps -e` lazily.
  ancestors?: ProcessNode[];
}

export interface SessionResolution {
  id: string;
  source: SessionSource;
  anchor: string;
}

const AGENT_SESSION_KEYS = [
  "CODEX_THREAD_ID",
  "CLAUDE_SESSION_ID",
  "AMP_THREAD_ID",
  "CURSOR_TRACE_ID",
] as const satisfies readonly (keyof SessionEnv)[];

const TERMINAL_SESSION_KEYS = [
  "TERM_SESSION_ID",
  "ITERM_SESSION_ID",
  "WT_SESSION",
  "TMUX_PANE",
] as const satisfies readonly (keyof SessionEnv)[];

function firstNonEmpty(
  env: SessionEnv,
  keys: readonly (keyof SessionEnv)[],
): string | null {
  for (const key of keys) {
    const v = env[key];
    if (v !== undefined && v !== "") return v;
  }
  return null;
}

// Hashes any raw signal into a stable, filesystem-safe 12-char slug. We never
// embed user-controlled strings directly in paths.
export function hashSessionAnchor(anchor: string): string {
  return createHash("sha1").update(anchor).digest("hex").slice(0, 12);
}

export function resolveSession(inputs: SessionInputs): SessionResolution {
  const { env, ppid, agent, ancestors } = inputs;

  const override = env.GENMEDIA_SESSION_ID;
  if (override !== undefined && override !== "") {
    return {
      id: hashSessionAnchor(override),
      source: "override",
      anchor: override,
    };
  }

  const agentSignal = firstNonEmpty(env, AGENT_SESSION_KEYS);
  if (agentSignal !== null) {
    return {
      id: hashSessionAnchor(agentSignal),
      source: "agent-env",
      anchor: agentSignal,
    };
  }

  // Process-tree walk. Critical for agents that spawn a fresh subprocess per
  // tool call (Claude Code's Bash tool is the canonical example), where
  // `process.ppid` differs every invocation but the agent process itself
  // lives for the entire conversation. Using the agent PID as the anchor
  // keeps all runs from one Claude/Codex/Cursor session in the same gallery.
  let agentMatch: AgentMatch | null = null;
  if (ancestors !== undefined) {
    agentMatch = findAgentInAncestors(ancestors);
  }
  if (agentMatch !== null) {
    const anchor = `${agentMatch.agent}:${agentMatch.pid}`;
    return {
      id: hashSessionAnchor(anchor),
      source: "process-tree",
      anchor,
    };
  }

  const terminalSignal = firstNonEmpty(env, TERMINAL_SESSION_KEYS);
  if (terminalSignal !== null) {
    return {
      id: hashSessionAnchor(terminalSignal),
      source: "terminal-env",
      anchor: terminalSignal,
    };
  }

  // PPID-based fallback: stable when the parent shell lives across multiple
  // genmedia invocations. Not reliable for agents that spawn a transient
  // shell per tool call — those should match the process-tree tier above.
  const anchor = `${agent ?? "user"}:${ppid}`;
  return {
    id: hashSessionAnchor(anchor),
    source: "fallback",
    anchor,
  };
}

function readSessionEnv(): SessionEnv {
  return {
    GENMEDIA_SESSION_ID: process.env.GENMEDIA_SESSION_ID,
    CODEX_THREAD_ID: process.env.CODEX_THREAD_ID,
    CLAUDE_SESSION_ID: process.env.CLAUDE_SESSION_ID,
    AMP_THREAD_ID: process.env.AMP_THREAD_ID,
    CURSOR_TRACE_ID: process.env.CURSOR_TRACE_ID,
    TERM_SESSION_ID: process.env.TERM_SESSION_ID,
    ITERM_SESSION_ID: process.env.ITERM_SESSION_ID,
    WT_SESSION: process.env.WT_SESSION,
    TMUX_PANE: process.env.TMUX_PANE,
  };
}

function shouldWalkProcessTree(env: SessionEnv): boolean {
  if (env.GENMEDIA_SESSION_ID) return false;
  if (env.CODEX_THREAD_ID) return false;
  if (env.CLAUDE_SESSION_ID) return false;
  if (env.AMP_THREAD_ID) return false;
  if (env.CURSOR_TRACE_ID) return false;
  return true;
}

let _cached: SessionContext | null = null;

export function getSessionContext(): SessionContext {
  if (_cached !== null) return _cached;
  const caller = getCallerInfo();
  const env = readSessionEnv();

  // Lazy `ps -e` walk: only fork it when no explicit session env is set,
  // because the higher-priority tiers would short-circuit before reading
  // the ancestor chain anyway.
  const agentMatch = shouldWalkProcessTree(env)
    ? findAgentInTree(process.ppid ?? 0)
    : null;
  // resolveSession expects an ancestors array; collapse the lazy lookup
  // into a one-element synthetic chain (the matched agent), which makes
  // findAgentAncestor return it immediately.
  const ancestors = agentMatch
    ? [{ pid: agentMatch.pid, ppid: 0, comm: agentMatch.comm }]
    : undefined;

  const resolution = resolveSession({
    env,
    ppid: process.ppid ?? 0,
    agent: caller.agent,
    ancestors,
  });
  _cached = {
    id: resolution.id,
    source: resolution.source,
    anchor: resolution.anchor,
    agent: caller.agent,
    agentHost: caller.agentHost,
    startedAt: Date.now(),
  };
  return _cached;
}

export function getSessionId(): string {
  return getSessionContext().id;
}
