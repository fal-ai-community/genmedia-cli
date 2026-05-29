import { execSync } from "node:child_process";

export interface ProcessNode {
  pid: number;
  ppid: number;
  comm: string;
}

export interface AgentMatch {
  pid: number;
  comm: string;
  agent: string;
}

// Known agent binaries. Matched against the basename of the process command
// (case-insensitive) so we tolerate full paths and the macOS habit of
// reporting `/Applications/.../foo` as comm.
const AGENT_PROCESS_PATTERNS: Array<{ re: RegExp; agent: string }> = [
  { re: /^claude(-code)?(\.exe)?$/i, agent: "claude-code" },
  { re: /^codex(\.exe)?$/i, agent: "codex" },
  { re: /^cursor(-agent)?(\.exe)?$/i, agent: "cursor-agent" },
  { re: /^(amp|ampcode)(\.exe)?$/i, agent: "amp" },
  { re: /^gemini(-cli)?(\.exe)?$/i, agent: "gemini-cli" },
  { re: /^(copilot(-cli)?|gh-copilot)(\.exe)?$/i, agent: "copilot-cli" },
  { re: /^opencode(\.exe)?$/i, agent: "opencode" },
  { re: /^aider(\.exe)?$/i, agent: "aider" },
  { re: /^cline(\.exe)?$/i, agent: "cline" },
];

// Extracts the executable name from a `ps -o comm=` value. Handles three
// shapes:
//   - Plain POSIX path:           `/usr/local/bin/claude`            → claude
//   - macOS app-bundle path:      `/Applications/Cursor.app/.../Cursor Helper` → Cursor
//   - macOS description (no `/`): `Cursor Helper (Plugin): extension-host`     → Cursor
//   - Windows path:               `C:\\bin\\codex.exe`                → codex.exe
//   - Bare name:                  `claude`                             → claude
// Strategy: take everything after the last `/` or `\`, then drop anything
// from the first whitespace onwards. Good enough to match against the
// known-agent pattern list without false positives.
export function commBasename(comm: string): string {
  const lastSlash = Math.max(comm.lastIndexOf("/"), comm.lastIndexOf("\\"));
  const tail = lastSlash >= 0 ? comm.slice(lastSlash + 1) : comm;
  const firstSpace = tail.search(/\s/);
  return firstSpace >= 0 ? tail.slice(0, firstSpace) : tail;
}

export function matchAgentProcess(comm: string): { agent: string } | null {
  const base = commBasename(comm);
  for (const { re, agent } of AGENT_PROCESS_PATTERNS) {
    if (re.test(base)) return { agent };
  }
  return null;
}

const PS_LINE_RE = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/;

export function parseProcessTable(raw: string): Map<number, ProcessNode> {
  const map = new Map<number, ProcessNode>();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const m = line.match(PS_LINE_RE);
    if (!m) continue;
    const pid = Number.parseInt(m[1], 10);
    const ppid = Number.parseInt(m[2], 10);
    const comm = m[3].trim();
    if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue;
    map.set(pid, { pid, ppid, comm });
  }
  return map;
}

let _cachedTable: Map<number, ProcessNode> | null = null;

// Reads `ps -e` once per process. Returns an empty map when unavailable
// (Windows, sandboxed environments, or if `ps` exits with an error).
export function readProcessTable(): Map<number, ProcessNode> {
  if (_cachedTable !== null) return _cachedTable;
  if (process.platform === "win32") {
    _cachedTable = new Map();
    return _cachedTable;
  }
  try {
    const out = execSync("ps -e -o pid=,ppid=,comm=", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
      timeout: 2000,
    });
    _cachedTable = parseProcessTable(out);
  } catch {
    _cachedTable = new Map();
  }
  return _cachedTable;
}

export function walkAncestors(
  table: Map<number, ProcessNode>,
  startPid: number,
  maxDepth = 16,
): ProcessNode[] {
  const out: ProcessNode[] = [];
  const seen = new Set<number>();
  let pid = startPid;
  for (let i = 0; i < maxDepth; i++) {
    if (seen.has(pid)) break;
    seen.add(pid);
    const node = table.get(pid);
    if (!node) break;
    out.push(node);
    if (node.ppid <= 1 || node.ppid === node.pid) break;
    pid = node.ppid;
  }
  return out;
}

export function findAgentAncestor(ancestors: ProcessNode[]): AgentMatch | null {
  for (const a of ancestors) {
    const m = matchAgentProcess(a.comm);
    if (m) {
      return { pid: a.pid, comm: a.comm, agent: m.agent };
    }
  }
  return null;
}

// Convenience: read the live process table and return the agent match (if
// any) starting from the given pid. Cached.
export function findAgentInTree(startPid: number): AgentMatch | null {
  const table = readProcessTable();
  if (table.size === 0) return null;
  const ancestors = walkAncestors(table, startPid);
  return findAgentAncestor(ancestors);
}
