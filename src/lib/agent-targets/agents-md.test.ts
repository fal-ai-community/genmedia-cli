import { describe, expect, test } from "bun:test";
import {
  mergeAgentsMd,
  renderAgentsBlock,
  stripAgentsBlock,
} from "./agents-md";
import type { SkillContent } from "./types";

const skill: SkillContent = {
  name: "genmedia",
  description: "Use genmedia for fal.ai things.",
  body: "# genmedia CLI\n\nDo things.",
  rawFrontmatter: "---\nname: genmedia\n---\n",
  files: [],
};

describe("renderAgentsBlock", () => {
  test("wraps body with BEGIN/END markers and a heading", () => {
    const out = renderAgentsBlock(skill);
    expect(out).toContain("<!-- BEGIN genmedia:genmedia -->");
    expect(out).toContain("<!-- END genmedia:genmedia -->");
    expect(out).toContain("## genmedia CLI");
    expect(out).toContain("Do things.");
  });
});

describe("mergeAgentsMd", () => {
  const block = renderAgentsBlock(skill);

  test("creates content when AGENTS.md is missing", () => {
    const out = mergeAgentsMd(null, block, "genmedia");
    expect(out.startsWith("<!-- BEGIN genmedia:genmedia -->")).toBe(true);
    expect(out.endsWith("\n")).toBe(true);
  });

  test("appends to non-empty file without our block", () => {
    const existing = "# Project AGENTS guide\n\nSome existing instructions.\n";
    const out = mergeAgentsMd(existing, block, "genmedia");
    expect(out.startsWith(existing.replace(/\n*$/, ""))).toBe(true);
    expect(out).toContain("<!-- BEGIN genmedia:genmedia -->");
  });

  test("replaces an existing block in place", () => {
    const old = renderAgentsBlock({ ...skill, body: "OLD CONTENT" });
    const surrounded = `## Pre\nKeep me\n\n${old}\n\n## Post\nKeep me too\n`;
    const updated = renderAgentsBlock({ ...skill, body: "NEW CONTENT" });
    const out = mergeAgentsMd(surrounded, updated, "genmedia");
    expect(out).toContain("Keep me");
    expect(out).toContain("Keep me too");
    expect(out).toContain("NEW CONTENT");
    expect(out).not.toContain("OLD CONTENT");
  });

  test("is idempotent — same input produces same output", () => {
    const once = mergeAgentsMd(null, block, "genmedia");
    const twice = mergeAgentsMd(once, block, "genmedia");
    expect(twice).toBe(once);
  });

  test("handles distinct skill blocks side by side", () => {
    const blockA = renderAgentsBlock({ ...skill, name: "alpha" });
    const blockB = renderAgentsBlock({ ...skill, name: "beta" });
    const step1 = mergeAgentsMd(null, blockA, "alpha");
    const step2 = mergeAgentsMd(step1, blockB, "beta");
    expect(step2).toContain("<!-- BEGIN genmedia:alpha -->");
    expect(step2).toContain("<!-- BEGIN genmedia:beta -->");
    const updatedA = renderAgentsBlock({
      ...skill,
      name: "alpha",
      body: "ALPHA UPDATED",
    });
    const step3 = mergeAgentsMd(step2, updatedA, "alpha");
    expect(step3).toContain("ALPHA UPDATED");
    expect(step3).toContain("<!-- BEGIN genmedia:beta -->");
  });
});

describe("stripAgentsBlock", () => {
  test("removes our block and preserves surrounding content", () => {
    const block = renderAgentsBlock(skill);
    const surrounded = `# Header\n\n${block}\n\n## Post\nKeep\n`;
    const { content, removed } = stripAgentsBlock(surrounded, "genmedia");
    expect(removed).toBe(true);
    expect(content).toContain("# Header");
    expect(content).toContain("Keep");
    expect(content).not.toContain("BEGIN genmedia:genmedia");
  });

  test("reports removed: false when our block is absent", () => {
    const { content, removed } = stripAgentsBlock(
      "# Just a regular file",
      "genmedia",
    );
    expect(removed).toBe(false);
    expect(content).toBe("# Just a regular file");
  });
});
