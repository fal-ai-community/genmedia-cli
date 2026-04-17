#!/usr/bin/env bun
/**
 * Builds skills/index.json by walking skills/<name>/ directories.
 *
 * Each skill directory must contain a SKILL.md with YAML frontmatter
 * (`name` + `description`). All files in the directory are included in
 * the manifest with a sha256 hash so the CLI can verify integrity.
 *
 * Run with `--check` to fail if the on-disk index is stale.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const SKILLS_DIR = "skills";
const INDEX_FILE = join(SKILLS_DIR, "index.json");

interface SkillFile {
  path: string;
  sha256: string;
  bytes: number;
}

interface SkillEntry {
  name: string;
  description: string;
  files: SkillFile[];
}

interface SkillsIndex {
  version: 1;
  skills: SkillEntry[];
}

function sha256(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function walkFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkFiles(full, base));
    } else if (stat.isFile()) {
      out.push(relative(base, full));
    }
  }
  return out.sort();
}

function parseFrontmatter(source: string): {
  name?: string;
  description?: string;
} {
  if (!source.startsWith("---\n")) return {};
  const end = source.indexOf("\n---", 4);
  if (end === -1) return {};
  const block = source.slice(4, end);

  const out: Record<string, string> = {};
  const lines = block.split("\n");
  let currentKey: string | null = null;
  let foldedLines: string[] = [];

  const flushFolded = () => {
    if (currentKey !== null) {
      out[currentKey] = foldedLines.join(" ").trim();
      currentKey = null;
      foldedLines = [];
    }
  };

  for (const line of lines) {
    const keyMatch = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (keyMatch && !line.startsWith(" ")) {
      flushFolded();
      const [, key, rest] = keyMatch;
      if (rest === ">" || rest === ">-" || rest === "|") {
        currentKey = key;
        foldedLines = [];
      } else {
        out[key] = rest.trim();
      }
    } else if (currentKey !== null) {
      foldedLines.push(line.trim());
    }
  }
  flushFolded();

  return out;
}

function buildIndex(): SkillsIndex {
  const skills: SkillEntry[] = [];

  for (const entry of readdirSync(SKILLS_DIR).sort()) {
    const skillDir = join(SKILLS_DIR, entry);
    if (!statSync(skillDir).isDirectory()) continue;

    const skillFile = join(skillDir, "SKILL.md");
    let skillSource: string;
    try {
      skillSource = readFileSync(skillFile, "utf-8");
    } catch {
      throw new Error(`Missing SKILL.md in ${skillDir}`);
    }

    const { name, description } = parseFrontmatter(skillSource);
    if (!name) throw new Error(`${skillFile}: frontmatter is missing 'name'`);
    if (!description)
      throw new Error(`${skillFile}: frontmatter is missing 'description'`);
    if (name !== entry)
      throw new Error(
        `${skillFile}: frontmatter name '${name}' does not match directory '${entry}'`,
      );

    const files: SkillFile[] = walkFiles(skillDir).map((rel) => {
      const buf = readFileSync(join(skillDir, rel));
      return {
        path: rel,
        sha256: sha256(buf),
        bytes: buf.byteLength,
      };
    });

    skills.push({ name, description, files });
  }

  return { version: 1, skills };
}

function main(): void {
  const check = process.argv.includes("--check");
  const index = buildIndex();
  const serialized = `${JSON.stringify(index, null, 2)}\n`;

  if (check) {
    let current = "";
    try {
      current = readFileSync(INDEX_FILE, "utf-8");
    } catch {
      console.error(
        `${INDEX_FILE} is missing. Run: bun run scripts/build-skills-index.ts`,
      );
      process.exit(1);
    }
    if (current !== serialized) {
      console.error(
        `${INDEX_FILE} is stale. Run: bun run scripts/build-skills-index.ts`,
      );
      process.exit(1);
    }
    return;
  }

  writeFileSync(INDEX_FILE, serialized);
  console.log(
    `Wrote ${INDEX_FILE} — ${index.skills.length} skill${index.skills.length === 1 ? "" : "s"}`,
  );
}

main();
