import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { error, output } from "../../../lib/output";

function loadFilters(value: string | undefined): unknown {
  if (!value) return undefined;
  if (value.startsWith("@")) {
    const path = resolve(value.slice(1));
    if (!existsSync(path)) error(`Filters file not found: ${path}`);
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (parseErr) {
      error(`Failed to parse filters JSON at ${path}`, String(parseErr));
    }
  }
  try {
    return JSON.parse(value);
  } catch (parseErr) {
    error("Invalid --filters JSON", String(parseErr));
  }
}

export default defineCommand({
  meta: { name: "update", description: "Update an asset collection" },
  args: {
    collection_id: {
      type: "positional",
      required: true,
      description: "Collection ID",
    },
    name: { type: "string", description: "New display name" },
    description: { type: "string", description: "New description" },
    icon: { type: "string", description: "New icon" },
    color: { type: "string", description: "New color" },
    cover_image_url: {
      type: "string",
      description: "New fal-hosted cover image URL",
    },
    filters: {
      type: "string",
      description:
        "Smart-collection filter DSL. Pass JSON inline or @path/to/filters.json",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args }) {
    const filters = loadFilters(args.filters);
    const data = await assetsRequest<{ collection: unknown }>({
      method: "PATCH",
      path: `/collections/${args.collection_id}`,
      body: {
        ...(args.name ? { name: args.name } : {}),
        ...(args.description !== undefined
          ? { description: args.description }
          : {}),
        ...(args.icon !== undefined ? { icon: args.icon } : {}),
        ...(args.color !== undefined ? { color: args.color } : {}),
        ...(args.cover_image_url !== undefined
          ? { cover_image_url: args.cover_image_url }
          : {}),
        ...(filters !== undefined ? { filters } : {}),
      },
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
