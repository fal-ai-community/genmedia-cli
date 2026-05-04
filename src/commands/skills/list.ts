import { defineCommand } from "citty";
import { error, isJsonOutput, output } from "../../lib/output";
import {
  fetchIndex,
  getRegistryUrl,
  getSkillsApiUrl,
  readInstalledManifest,
  type SkillEntry,
  searchSkillsApi,
} from "../../lib/skills-registry";
import { colors } from "../../lib/ui";

interface ListedSkill {
  name: string;
  description: string;
  files: number;
  installed: boolean;
  score?: number;
}

export default defineCommand({
  meta: {
    name: "list",
    description: "List skills available in the genmedia registry",
  },
  args: {
    query: {
      type: "positional",
      required: false,
      description: "Full-text search query (filters by name and description)",
    },
  },
  async run({ args }) {
    const query = (args.query ?? "").toString().trim();
    const installed = readInstalledManifest(process.cwd());
    const installedNames = new Set(installed.skills.map((s) => s.name));

    let skills: ListedSkill[];
    let source: string;

    if (query) {
      try {
        const result = await searchSkillsApi(query);
        source = getSkillsApiUrl();
        skills = result.skills.map((s) => ({
          name: s.name,
          description: s.description,
          files: s.files.length,
          installed: installedNames.has(s.name),
          score: s.score,
        }));
      } catch (e) {
        error(`Failed to search skills registry`, {
          url: `${getSkillsApiUrl()}?q=${encodeURIComponent(query)}`,
          message: (e as Error).message,
        });
      }
    } else {
      try {
        const index = await fetchIndex();
        source = getRegistryUrl();
        skills = index.skills.map((s: SkillEntry) => ({
          name: s.name,
          description: s.description,
          files: s.files.length,
          installed: installedNames.has(s.name),
        }));
      } catch (e) {
        error(`Failed to fetch skills registry`, {
          url: getRegistryUrl(),
          message: (e as Error).message,
        });
      }
    }

    if (isJsonOutput()) {
      output({ registry: source, query, count: skills.length, skills });
      return;
    }

    process.stdout.write("\n");
    if (skills.length === 0) {
      process.stdout.write(
        `  ${colors.dim(`No skills match "${query}".`)}\n\n`,
      );
      return;
    }
    for (const s of skills) {
      const tag = s.installed
        ? colors.green("[installed]")
        : colors.dim("[available]");
      process.stdout.write(`  ${colors.bold(s.name)}  ${tag}\n`);
      process.stdout.write(`    ${colors.dim(s.description)}\n\n`);
    }
    process.stdout.write(
      `${colors.dim(`Install with: genmedia skills install <name>`)}\n\n`,
    );
  },
});
