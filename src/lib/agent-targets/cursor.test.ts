import { describe, expect, test } from "bun:test";
import { renderCursorRule } from "./cursor";
import type { SkillContent } from "./types";

const skill: SkillContent = {
  name: "genmedia",
  description: "Use the genmedia CLI to run fal.ai models.",
  body: "# genmedia CLI\n\nDo things.",
  rawFrontmatter: "---\nname: genmedia\n---\n",
  files: [],
};

describe("renderCursorRule", () => {
  test("emits Cursor frontmatter with description, empty globs, alwaysApply: false", () => {
    const out = renderCursorRule(skill);
    const lines = out.split("\n");
    expect(lines[0]).toBe("---");
    expect(lines[1]).toBe(
      'description: "Use the genmedia CLI to run fal.ai models."',
    );
    expect(lines[2]).toBe("globs:");
    expect(lines[3]).toBe("alwaysApply: false");
    expect(lines[4]).toBe("---");
    expect(out).toContain("# genmedia CLI");
  });

  test("collapses multi-line description to a single line", () => {
    const multi: SkillContent = {
      ...skill,
      description: "Line one\n  Line two\n  Line three",
    };
    const out = renderCursorRule(multi);
    expect(out).toContain('description: "Line one Line two Line three"');
  });

  test("escapes double quotes in description", () => {
    const tricky: SkillContent = {
      ...skill,
      description: 'has "quotes" inside',
    };
    const out = renderCursorRule(tricky);
    expect(out).toContain('description: "has \\"quotes\\" inside"');
  });
});
