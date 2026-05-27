import { defineCommand } from "citty";
import { assetsRequest } from "../../lib/assets";
import { collectOptionValues } from "../../lib/cli-args";
import { output } from "../../lib/output";

interface BrowseResponse {
  assets: unknown[];
  next_cursor: string | null;
  has_more: boolean;
  total_count: number | null;
}

export default defineCommand({
  meta: {
    name: "browse",
    description: "Browse and semantically search fal Assets",
  },
  args: {
    query: {
      type: "positional",
      required: false,
      description: "Free-text query for hybrid semantic search",
    },
    search_image_url: {
      type: "string",
      description: "fal-hosted image URL for semantic image search",
    },
    search_video_url: {
      type: "string",
      description: "fal-hosted video URL for semantic video search",
    },
    media_type: {
      type: "string",
      description:
        "Filter by media type (image, video, audio, 3d). Repeat or pass comma-separated.",
    },
    source: {
      type: "string",
      description:
        "Filter by indexed source (upload, response, request). Repeat or pass comma-separated.",
    },
    section: {
      type: "enum",
      default: "all-media",
      options: ["all-media", "uploads", "favorites"],
      description: "Asset library section to browse",
    },
    collection_id: {
      type: "string",
      description: "Scope browse to a single collection",
    },
    character_identifier: {
      type: "string",
      description:
        "Character @mention identifier filter. Repeat or pass comma-separated.",
    },
    tag_id: {
      type: "string",
      description: "Filter by tag IDs. Repeat or pass comma-separated.",
    },
    tag_mode: {
      type: "enum",
      default: "any",
      options: ["any", "all"],
      description: "Match any tag or require all tags",
    },
    limit: {
      type: "string",
      default: "20",
      description: "Max results (default: 20)",
    },
    cursor: {
      type: "string",
      description: "Pagination cursor from a previous response",
    },
  },
  async run({ args, rawArgs }) {
    const query = args.query?.trim();
    const mediaTypes = collectOptionValues(rawArgs, "media_type");
    const sources = collectOptionValues(rawArgs, "source");
    const characterIdentifiers = collectOptionValues(
      rawArgs,
      "character_identifier",
    );
    const tagIds = collectOptionValues(rawArgs, "tag_id");

    const data = await assetsRequest<BrowseResponse>({
      method: "GET",
      path: "",
      query: {
        q: query,
        search_image_url: args.search_image_url,
        search_video_url: args.search_video_url,
        media_type: mediaTypes,
        source: sources,
        section: args.section,
        collection_id: args.collection_id,
        character_identifier: characterIdentifiers,
        tag_id: tagIds,
        tag_mode: args.tag_mode,
        limit: args.limit,
        cursor: args.cursor,
      },
    });

    output({
      ...(query ? { query } : {}),
      section: args.section,
      count: data.assets.length,
      has_more: data.has_more,
      ...(data.next_cursor ? { next_cursor: data.next_cursor } : {}),
      ...(data.total_count !== null ? { total_count: data.total_count } : {}),
      assets: data.assets,
    });
  },
});
