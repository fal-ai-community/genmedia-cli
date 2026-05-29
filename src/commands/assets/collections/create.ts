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
  meta: { name: "create", description: "Create an asset collection" },
  args: {
    name: {
      type: "positional",
      required: true,
      description: "Collection display name",
    },
    description: { type: "string", description: "Collection description" },
    icon: { type: "string", description: "Optional collection icon" },
    color: { type: "string", description: "Optional collection color" },
    cover_image_url: {
      type: "string",
      description: "Optional fal-hosted cover image URL",
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
      method: "POST",
      path: "/collections",
      body: {
        name: args.name,
        ...(args.description ? { description: args.description } : {}),
        ...(args.icon ? { icon: args.icon } : {}),
        ...(args.color ? { color: args.color } : {}),
        ...(args.cover_image_url
          ? { cover_image_url: args.cover_image_url }
          : {}),
        ...(filters !== undefined ? { filters } : {}),
      },
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
