export interface ParsedFrontmatter {
  fields: Record<string, string>;
  body: string;
  raw: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(text: string): ParsedFrontmatter {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) {
    return { fields: {}, body: text, raw: "" };
  }
  return {
    fields: parseSimpleYaml(m[1]),
    body: text.slice(m[0].length),
    raw: m[0],
  };
}

function parseSimpleYaml(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2];

    if (rest === ">" || rest === ">-" || rest === "|" || rest === "|-") {
      const block: string[] = [];
      i++;
      let blockIndent: string | null = null;
      while (i < lines.length) {
        const next = lines[i];
        if (!next.trim()) {
          block.push("");
          i++;
          continue;
        }
        const indentMatch = /^(\s+)/.exec(next);
        if (!indentMatch) break;
        if (blockIndent === null) blockIndent = indentMatch[1];
        if (!next.startsWith(blockIndent)) break;
        block.push(next.slice(blockIndent.length));
        i++;
      }
      const folded = rest.startsWith(">");
      fields[key] = folded
        ? block.join(" ").replace(/\s+/g, " ").trim()
        : block.join("\n").trim();
    } else {
      fields[key] = stripQuotes(rest.trim());
      i++;
    }
  }
  return fields;
}

function stripQuotes(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}
