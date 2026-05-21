import { defineCommand } from "citty";
import { track } from "../../lib/analytics";
import { error, isJsonOutput, output } from "../../lib/output";
import {
  getSkillsApiUrl,
  readInstalledManifest,
  searchSkillsApi,
} from "../../lib/skills-registry";
import { colors } from "../../lib/ui";

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
    const installedNames = new Set(
      readInstalledManifest(process.cwd()).skills.map((s) => s.name),
    );

    let result: Awaited<ReturnType<typeof searchSkillsApi>>;
    try {
      result = await searchSkillsApi(query);
    } catch (e) {
      track("skills_searched", { query, ok: false });
      error(`Failed to fetch skills registry`, {
        url: `${getSkillsApiUrl()}${query ? `?q=${encodeURIComponent(query)}` : ""}`,
        message: (e as Error).message,
      });
    }

    const skills = result.skills.map((s) => ({
      name: s.name,
      description: s.description,
      files: s.files.length,
      installed: installedNames.has(s.name),
      score: s.score,
    }));

    track("skills_searched", {
      query,
      ok: true,
      resultCount: skills.length,
    });

    if (isJsonOutput()) {
      output({
        registry: getSkillsApiUrl(),
        query,
        count: skills.length,
        skills,
      });
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
