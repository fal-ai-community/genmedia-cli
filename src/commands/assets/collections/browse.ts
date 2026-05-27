import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { collectOptionValues } from "../../../lib/cli-args";
import { output } from "../../../lib/output";

interface BrowseResponse {
  assets: unknown[];
  next_cursor: string | null;
  has_more: boolean;
  total_count: number | null;
}

export default defineCommand({
  meta: {
    name: "browse",
    description:
      "Browse assets in a collection (same query shape as `assets browse`)",
  },
  args: {
    collection_id: {
      type: "positional",
      required: true,
      description: "Collection ID",
    },
    query: {
      type: "positional",
      required: false,
      description: "Free-text query for hybrid semantic search",
    },
    search_image_url: { type: "string" },
    search_video_url: { type: "string" },
    media_type: {
      type: "string",
      description: "image, video, audio, 3d (repeat or comma-separated)",
    },
    source: {
      type: "string",
      description: "upload, response, request (repeat or comma-separated)",
    },
    section: {
      type: "enum",
      default: "all-media",
      options: ["all-media", "uploads", "favorites"],
    },
    character_identifier: {
      type: "string",
      description: "@mention identifiers (repeat or comma-separated)",
    },
    tag_id: {
      type: "string",
      description: "Tag IDs (repeat or comma-separated)",
    },
    tag_mode: { type: "enum", default: "any", options: ["any", "all"] },
    limit: { type: "string", default: "20" },
    cursor: { type: "string" },
  },
  async run({ args, rawArgs }) {
    const data = await assetsRequest<BrowseResponse>({
      method: "GET",
      path: `/collections/${args.collection_id}/assets`,
      query: {
        q: args.query?.trim(),
        search_image_url: args.search_image_url,
        search_video_url: args.search_video_url,
        media_type: collectOptionValues(rawArgs, "media_type"),
        source: collectOptionValues(rawArgs, "source"),
        section: args.section,
        character_identifier: collectOptionValues(
          rawArgs,
          "character_identifier",
        ),
        tag_id: collectOptionValues(rawArgs, "tag_id"),
        tag_mode: args.tag_mode,
        limit: args.limit,
        cursor: args.cursor,
      },
    });

    output({
      collection_id: args.collection_id,
      count: data.assets.length,
      has_more: data.has_more,
      ...(data.next_cursor ? { next_cursor: data.next_cursor } : {}),
      ...(data.total_count !== null ? { total_count: data.total_count } : {}),
      assets: data.assets,
    });
  },
});
