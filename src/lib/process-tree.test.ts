import { describe, expect, test } from "bun:test";
import {
  commBasename,
  findAgentAncestor,
  matchAgentProcess,
  parseProcessTable,
  walkAncestors,
} from "./process-tree";

describe("commBasename", () => {
  test("returns the basename of a path-like comm", () => {
    expect(commBasename("/usr/local/bin/claude")).toBe("claude");
    expect(commBasename("/Applications/Cursor.app/Contents/MacOS/Cursor")).toBe(
      "Cursor",
    );
  });

  test("strips trailing args / descriptions after the executable name", () => {
    expect(
      commBasename(
        "/Applications/Cursor.app/Contents/Frameworks/Cursor Helper.app/Contents/MacOS/Cursor Helper",
      ),
    ).toBe("Cursor");
    expect(commBasename("/usr/bin/zsh -l")).toBe("zsh");
  });

  test("falls back to the first token when there is no path separator (macOS comm descriptions)", () => {
    // What `ps -e -o comm=` actually returns for a Cursor extension-host
    // process on macOS — no path, just a setproctitle description.
    expect(
      commBasename("Cursor Helper (Plugin): extension-host  falgen-cli [1-7]"),
    ).toBe("Cursor");
  });

  test("handles bare names", () => {
    expect(commBasename("claude")).toBe("claude");
    expect(commBasename("codex")).toBe("codex");
  });

  test("handles Windows-style backslash paths", () => {
    expect(commBasename("C:\\bin\\codex.exe")).toBe("codex.exe");
  });
});

describe("matchAgentProcess", () => {
  test("recognizes known agent binaries by basename", () => {
    expect(matchAgentProcess("/usr/local/bin/claude")).toEqual({
      agent: "claude-code",
    });
    expect(matchAgentProcess("claude-code")).toEqual({ agent: "claude-code" });
    expect(matchAgentProcess("/Users/me/.local/bin/codex")).toEqual({
      agent: "codex",
    });
    expect(matchAgentProcess("cursor-agent")).toEqual({
      agent: "cursor-agent",
    });
    expect(matchAgentProcess("/usr/bin/amp")).toEqual({ agent: "amp" });
    expect(matchAgentProcess("ampcode")).toEqual({ agent: "amp" });
    expect(matchAgentProcess("aider")).toEqual({ agent: "aider" });
  });

  test("is case-insensitive", () => {
    expect(matchAgentProcess("/usr/bin/CLAUDE")).toEqual({
      agent: "claude-code",
    });
  });

  test("tolerates the .exe suffix (Windows-style)", () => {
    expect(matchAgentProcess("C:\\bin\\codex.exe")).not.toBe(null);
  });

  test("returns null for unrelated processes", () => {
    expect(matchAgentProcess("/bin/zsh")).toBe(null);
    expect(matchAgentProcess("/usr/local/bin/genmedia")).toBe(null);
    expect(matchAgentProcess("node")).toBe(null);
  });
});

describe("parseProcessTable", () => {
  test("parses standard `ps -e -o pid=,ppid=,comm=` output", () => {
    const raw = [
      "  100    1 /usr/sbin/init",
      "  500  100 /bin/zsh",
      "  600  500 /usr/local/bin/claude",
      "  700  600 /bin/sh",
      "  800  700 /usr/local/bin/genmedia",
    ].join("\n");
    const table = parseProcessTable(raw);
    expect(table.size).toBe(5);
    expect(table.get(800)).toEqual({
      pid: 800,
      ppid: 700,
      comm: "/usr/local/bin/genmedia",
    });
    expect(table.get(600)?.comm).toBe("/usr/local/bin/claude");
  });

  test("handles spaces inside comm (macOS multi-word descriptions)", () => {
    const raw = "  500  100 Cursor Helper (Plugin): extension-host";
    const table = parseProcessTable(raw);
    expect(table.get(500)?.comm).toBe("Cursor Helper (Plugin): extension-host");
  });

  test("ignores empty and malformed lines", () => {
    const raw = ["", "garbage", "  100    1 init", "  abc   1 nope"].join("\n");
    const table = parseProcessTable(raw);
    expect(table.size).toBe(1);
    expect(table.get(100)?.comm).toBe("init");
  });
});

describe("walkAncestors", () => {
  test("walks parent chain until init", () => {
    const table = parseProcessTable(
      [
        "  100    1 init",
        "  500  100 /bin/zsh",
        "  600  500 /usr/local/bin/claude",
        "  700  600 /bin/sh",
        "  800  700 /usr/local/bin/genmedia",
      ].join("\n"),
    );
    const ancestors = walkAncestors(table, 800);
    expect(ancestors.map((a) => a.pid)).toEqual([800, 700, 600, 500, 100]);
  });

  test("stops at maxDepth", () => {
    const table = parseProcessTable(
      ["1 0 init", "2 1 a", "3 2 b", "4 3 c", "5 4 d"].join("\n"),
    );
    const ancestors = walkAncestors(table, 5, 2);
    expect(ancestors.map((a) => a.pid)).toEqual([5, 4]);
  });

  test("stops cleanly when a pid is missing", () => {
    const table = parseProcessTable(["100 0 init", "500 999 zsh"].join("\n"));
    const ancestors = walkAncestors(table, 500);
    expect(ancestors.map((a) => a.pid)).toEqual([500]);
  });
});

describe("findAgentAncestor", () => {
  test("picks the nearest known agent in the chain", () => {
    const table = parseProcessTable(
      [
        "100 0 init",
        "500 100 /bin/zsh",
        "600 500 /usr/local/bin/claude",
        "700 600 /bin/sh",
        "800 700 /usr/local/bin/genmedia",
      ].join("\n"),
    );
    const ancestors = walkAncestors(table, 800);
    const match = findAgentAncestor(ancestors);
    expect(match).toEqual({
      pid: 600,
      comm: "/usr/local/bin/claude",
      agent: "claude-code",
    });
  });

  test("returns null when no ancestor is a known agent", () => {
    const table = parseProcessTable(
      [
        "100 0 init",
        "500 100 /bin/zsh",
        "700 500 /bin/sh",
        "800 700 /usr/local/bin/genmedia",
      ].join("\n"),
    );
    const ancestors = walkAncestors(table, 800);
    expect(findAgentAncestor(ancestors)).toBe(null);
  });

  test("matches even when the agent is several shells away (the Claude Code case)", () => {
    // Simulates Claude Code spawning a fresh subshell per Bash tool call. The
    // direct parent of `genmedia` is a short-lived sh; the stable anchor is
    // claude itself, three hops up.
    const table = parseProcessTable(
      [
        "100 0 init",
        "500 100 /bin/zsh",
        "600 500 /usr/local/bin/claude",
        "1701 600 /bin/sh",
        "1702 1701 /bin/sh",
        "1703 1702 /usr/local/bin/genmedia",
      ].join("\n"),
    );
    const ancestors = walkAncestors(table, 1703);
    const match = findAgentAncestor(ancestors);
    expect(match?.agent).toBe("claude-code");
    expect(match?.pid).toBe(600);
  });
});
