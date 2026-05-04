import MiniSearch from "minisearch";

const DEFAULT_REGISTRY_URL =
  "https://raw.githubusercontent.com/fal-ai-community/skills/refs/heads/main/skills";

const INDEX_REVALIDATE_SECONDS = 60;

export interface SkillFileEntry {
  path: string;
  sha256: string;
  bytes: number;
}

export interface SkillEntry {
  name: string;
  description: string;
  files: SkillFileEntry[];
}

export interface SkillsIndex {
  version: 1;
  skills: SkillEntry[];
}

export interface SkillSearchResult extends SkillEntry {
  score: number;
}

export function getRegistryUrl(): string {
  return (process.env.GENMEDIA_SKILLS_URL ?? DEFAULT_REGISTRY_URL).replace(
    /\/+$/,
    "",
  );
}

export async function fetchSkillsIndex(): Promise<SkillsIndex> {
  const url = `${getRegistryUrl()}/index.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "genmedia-web" },
    next: { revalidate: INDEX_REVALIDATE_SECONDS },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as SkillsIndex;
  if (body.version !== 1 || !Array.isArray(body.skills)) {
    throw new Error(`Invalid skills index at ${url}`);
  }
  return body;
}

function buildIndex(skills: SkillEntry[]): MiniSearch<SkillEntry> {
  const ms = new MiniSearch<SkillEntry>({
    idField: "name",
    fields: ["name", "description"],
    storeFields: ["name", "description", "files"],
    searchOptions: {
      boost: { name: 3 },
      fuzzy: 0.2,
      prefix: true,
      combineWith: "AND",
    },
  });
  ms.addAll(skills);
  return ms;
}

export function searchSkills(
  index: SkillsIndex,
  query: string,
): SkillSearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return index.skills
      .map((s) => ({ ...s, score: 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const ms = buildIndex(index.skills);
  return ms.search(trimmed).map((hit) => ({
    name: hit.name as string,
    description: hit.description as string,
    files: hit.files as SkillFileEntry[],
    score: hit.score,
  }));
}
