import { describe, expect, test } from "bun:test";
import { parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  test("returns empty fields when no frontmatter present", () => {
    const { fields, body, raw } = parseFrontmatter("# Just a body");
    expect(fields).toEqual({});
    expect(body).toBe("# Just a body");
    expect(raw).toBe("");
  });

  test("parses simple key: value pairs", () => {
    const text = "---\nname: genmedia\nversion: 1\n---\n\nbody here";
    const { fields, body } = parseFrontmatter(text);
    expect(fields.name).toBe("genmedia");
    expect(fields.version).toBe("1");
    expect(body).toBe("\nbody here");
  });

  test("folds `>` block scalars to a single line", () => {
    const text = [
      "---",
      "description: >",
      "  Use the genmedia CLI to search,",
      "  run, and manage models.",
      "---",
      "",
      "body",
    ].join("\n");
    const { fields } = parseFrontmatter(text);
    expect(fields.description).toBe(
      "Use the genmedia CLI to search, run, and manage models.",
    );
  });

  test("preserves `|` literal scalars line-by-line", () => {
    const text = [
      "---",
      "notes: |",
      "  line 1",
      "  line 2",
      "---",
      "",
      "body",
    ].join("\n");
    const { fields } = parseFrontmatter(text);
    expect(fields.notes).toBe("line 1\nline 2");
  });

  test("strips quotes from quoted values", () => {
    const text = '---\nname: "quoted"\n---\n';
    const { fields } = parseFrontmatter(text);
    expect(fields.name).toBe("quoted");
  });
});
