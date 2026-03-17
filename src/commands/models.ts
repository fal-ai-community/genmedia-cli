import { defineCommand } from "citty";
import { PLATFORM_BASE, platformHeaders } from "../lib/api";
import { error, output } from "../lib/output";

export default defineCommand({
  meta: { name: "models", description: "List models by category" },
  args: {
    category: {
      type: "string",
      description: "Category to list (text-to-image, image-to-video, etc.)",
    },
  },
  async run({ args }) {
    const { category } = args;

    if (!category) {
      output({
        categories: [
          "text-to-image",
          "image-to-image",
          "image-to-video",
          "text-to-video",
          "video-to-video",
          "text-to-speech",
          "speech-to-text",
          "text-to-music",
          "image-to-3d",
          "text-to-3d",
          "image-editing",
          "training",
          "llm",
        ],
        usage: "falgen models --category text-to-image",
      });
      return;
    }

    const url = new URL(`${PLATFORM_BASE}/models`);
    url.searchParams.set("category", category);
    url.searchParams.set("status", "active");
    url.searchParams.set("limit", "20");

    const res = await fetch(url.toString(), { headers: platformHeaders() });
    if (!res.ok) error(`Failed (${res.status})`, await res.text());

    const data = (await res.json()) as {
      models: Array<Record<string, unknown>>;
    };
    const models = data.models.map((m: Record<string, unknown>) => {
      const meta = (m.metadata as Record<string, unknown>) || {};
      return {
        endpoint_id: m.endpoint_id,
        name: meta.display_name,
        description: meta.description,
      };
    });

    output({ category, models, count: models.length });
  },
});
