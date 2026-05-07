import type { NextRequest } from "next/server";
import { trackServer } from "@/lib/analytics";
import {
  fetchSkillsIndex,
  getRegistryUrl,
  searchSkills,
  SkillsIndex,
} from "@/lib/skills";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? "";
  const limitParam = params.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : null;

  let index: SkillsIndex;
  try {
    index = await fetchSkillsIndex();
  } catch (err) {
    trackServer("skills_searched", { query, ok: false });
    return Response.json(
      {
        error: "skills registry unavailable",
        registry: getRegistryUrl(),
        message: (err as Error).message,
      },
      { status: 502 },
    );
  }

  const matches = searchSkills(index, query);
  const skills =
    limit && Number.isFinite(limit) && limit > 0
      ? matches.slice(0, limit)
      : matches;

  trackServer("skills_searched", {
    query,
    ok: true,
    resultCount: skills.length,
    totalSkills: index.skills.length,
  });

  return Response.json(
    {
      registry: getRegistryUrl(),
      query,
      count: skills.length,
      total: index.skills.length,
      skills,
    },
    {
      headers: {
        "cache-control":
          "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
