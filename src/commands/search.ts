import { defineCommand } from "citty";
import { PLATFORM_BASE, platformHeaders } from "../lib/api";
import { error, output } from "../lib/output";

export default defineCommand({
  meta: {
    name: "search",
    description: "Search fal.ai model catalog (600+ models)",
  },
  args: {
    query: { type: "positional", required: false, description: "Search query" },
    category: {
      type: "string",
      description:
        "Filter by category (text-to-image, image-to-video, text-to-video, text-to-speech, etc.)",
    },
    limit: {
      type: "string",
      default: "20",
      description: "Max results (default: 20)",
    },
  },
  async run({ args }) {
    const url = new URL(`${PLATFORM_BASE}/models`);
    if (args.query) url.searchParams.set("q", args.query);
    if (args.category) url.searchParams.set("category", args.category);
    url.searchParams.set("status", "active");
    url.searchParams.set("limit", String(parseInt(args.limit, 10)));

    const res = await fetch(url.toString(), { headers: platformHeaders() });
    if (!res.ok) error(`Search failed (${res.status})`, await res.text());

    const data = (await res.json()) as {
      models: Array<Record<string, unknown>>;
      has_more: boolean;
    };
    const models = data.models.map((m: Record<string, unknown>) => {
      const meta = (m.metadata as Record<string, unknown>) || {};
      return {
        endpoint_id: m.endpoint_id,
        name: meta.display_name,
        category: meta.category,
        description: meta.description,
      };
    });

    output({ models, count: models.length, has_more: data.has_more });
  },
});
