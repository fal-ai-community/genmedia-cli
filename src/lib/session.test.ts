import { describe, expect, test } from "bun:test";
import type { ProcessNode } from "./process-tree";
import { hashSessionAnchor, resolveSession } from "./session";

function makeAncestors(rows: Array<[number, number, string]>): ProcessNode[] {
  return rows.map(([pid, ppid, comm]) => ({ pid, ppid, comm }));
}

describe("resolveSession", () => {
  test("explicit override beats everything", () => {
    const out = resolveSession({
      env: {
        GENMEDIA_SESSION_ID: "manual-1",
        CODEX_THREAD_ID: "codex-x",
        TERM_SESSION_ID: "term-y",
      },
      ppid: 1234,
      agent: "codex",
    });
    expect(out.source).toBe("override");
    expect(out.anchor).toBe("manual-1");
    expect(out.id).toBe(hashSessionAnchor("manual-1"));
  });

  test("Codex thread id is used when no override is set", () => {
    const out = resolveSession({
      env: { CODEX_THREAD_ID: "thread-abc", TERM_SESSION_ID: "term-y" },
      ppid: 99,
      agent: "codex",
    });
    expect(out.source).toBe("agent-env");
    expect(out.anchor).toBe("thread-abc");
    expect(out.id).toBe(hashSessionAnchor("thread-abc"));
  });

  test("Claude session id is honored", () => {
    const out = resolveSession({
      env: { CLAUDE_SESSION_ID: "claude-abc" },
      ppid: 99,
      agent: "claude-code",
    });
    expect(out.source).toBe("agent-env");
    expect(out.anchor).toBe("claude-abc");
  });

  test("first agent-env key wins (CODEX_THREAD_ID before CLAUDE_SESSION_ID)", () => {
    const out = resolveSession({
      env: { CODEX_THREAD_ID: "codex-1", CLAUDE_SESSION_ID: "claude-1" },
      ppid: 99,
      agent: null,
    });
    expect(out.anchor).toBe("codex-1");
  });

  test("falls back to terminal session id when no agent env is set", () => {
    const out = resolveSession({
      env: { TERM_SESSION_ID: "iterm-7" },
      ppid: 99,
      agent: null,
    });
    expect(out.source).toBe("terminal-env");
    expect(out.anchor).toBe("iterm-7");
  });

  test("process-tree match beats terminal-env (closes the Claude Code subshell gap)", () => {
    // Two genmedia invocations have *different* PPIDs and *different*
    // transient subshells, but both walk up to the same claude PID — they
    // must resolve to the same session id.
    const a = resolveSession({
      env: { TERM_SESSION_ID: "iterm-7" },
      ppid: 1701,
      agent: "claude-code",
      ancestors: makeAncestors([
        [1701, 600, "/bin/sh"],
        [600, 500, "/usr/local/bin/claude"],
        [500, 1, "/bin/zsh"],
      ]),
    });
    const b = resolveSession({
      env: { TERM_SESSION_ID: "iterm-7" },
      ppid: 9999,
      agent: "claude-code",
      ancestors: makeAncestors([
        [9999, 600, "/bin/sh"],
        [600, 500, "/usr/local/bin/claude"],
        [500, 1, "/bin/zsh"],
      ]),
    });
    expect(a.source).toBe("process-tree");
    expect(a.anchor).toBe("claude-code:600");
    expect(b.id).toBe(a.id);
  });

  test("process-tree honors codex / cursor / amp basenames", () => {
    expect(
      resolveSession({
        env: {},
        ppid: 1,
        agent: null,
        ancestors: makeAncestors([
          [50, 10, "/bin/sh"],
          [10, 1, "/usr/local/bin/codex"],
        ]),
      }).anchor,
    ).toBe("codex:10");
    expect(
      resolveSession({
        env: {},
        ppid: 1,
        agent: null,
        ancestors: makeAncestors([
          [50, 10, "/bin/sh"],
          [10, 1, "/usr/local/bin/cursor-agent"],
        ]),
      }).anchor,
    ).toBe("cursor-agent:10");
    expect(
      resolveSession({
        env: {},
        ppid: 1,
        agent: null,
        ancestors: makeAncestors([
          [50, 10, "/bin/sh"],
          [10, 1, "/usr/local/bin/ampcode"],
        ]),
      }).anchor,
    ).toBe("amp:10");
  });

  test("agent-env still beats process-tree (explicit signals are stronger)", () => {
    const out = resolveSession({
      env: { CODEX_THREAD_ID: "thread-z" },
      ppid: 5,
      agent: "codex",
      ancestors: makeAncestors([[10, 1, "/usr/local/bin/codex"]]),
    });
    expect(out.source).toBe("agent-env");
    expect(out.anchor).toBe("thread-z");
  });

  test("process-tree falls through to terminal-env when no known agent is in the chain", () => {
    const out = resolveSession({
      env: { TERM_SESSION_ID: "iterm-7" },
      ppid: 5,
      agent: null,
      ancestors: makeAncestors([
        [5, 4, "/bin/sh"],
        [4, 1, "/bin/zsh"],
      ]),
    });
    expect(out.source).toBe("terminal-env");
    expect(out.anchor).toBe("iterm-7");
  });

  test("uses TMUX_PANE when iTerm/WT are absent", () => {
    const out = resolveSession({
      env: { TMUX_PANE: "%42" },
      ppid: 99,
      agent: null,
    });
    expect(out.source).toBe("terminal-env");
    expect(out.anchor).toBe("%42");
  });

  test("PPID + agent fallback when no env signals exist", () => {
    const out = resolveSession({
      env: {},
      ppid: 1234,
      agent: "claude-code",
    });
    expect(out.source).toBe("fallback");
    expect(out.anchor).toBe("claude-code:1234");
    expect(out.id).toBe(hashSessionAnchor("claude-code:1234"));
  });

  test("fallback uses 'user' when no agent is detected", () => {
    const out = resolveSession({
      env: {},
      ppid: 4242,
      agent: null,
    });
    expect(out.anchor).toBe("user:4242");
  });

  test("empty string env vars are treated as absent", () => {
    const out = resolveSession({
      env: {
        GENMEDIA_SESSION_ID: "",
        CODEX_THREAD_ID: "",
        TERM_SESSION_ID: "term-1",
      },
      ppid: 1,
      agent: null,
    });
    expect(out.source).toBe("terminal-env");
    expect(out.anchor).toBe("term-1");
  });

  test("hashed id is filesystem-safe and 12 characters long", () => {
    const out = resolveSession({
      env: { GENMEDIA_SESSION_ID: "anything with /slashes and spaces" },
      ppid: 1,
      agent: null,
    });
    expect(out.id).toMatch(/^[a-f0-9]{12}$/);
  });

  test("same anchor produces the same id deterministically", () => {
    const a = resolveSession({
      env: { GENMEDIA_SESSION_ID: "stable" },
      ppid: 1,
      agent: null,
    });
    const b = resolveSession({
      env: { GENMEDIA_SESSION_ID: "stable" },
      ppid: 2,
      agent: "different",
    });
    expect(a.id).toBe(b.id);
  });
});
