import { defineCommand } from "citty";
import { PLATFORM_BASE, platformHeaders } from "../lib/api";
import { error, output } from "../lib/output";

const SUPPORTED_EXPANDS = new Set(["openapi-3.0", "enterprise_status"]);

type ModelRecord = Record<string, unknown>;
type ModelsResponse = {
  models?: ModelRecord[];
  has_more?: boolean;
  next_cursor?: string | null;
};

function isRecord(value: unknown): value is ModelRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function splitMultiValue(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function toOptionAliases(optionName: string): string[] {
  const snakeCase = optionName.replaceAll("-", "_");
  const kebabCase = optionName.replaceAll("_", "-");
  const camelCase = snakeCase.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );

  return [...new Set([optionName, snakeCase, kebabCase, camelCase])];
}

function collectOptionValues(rawArgs: string[], optionName: string): string[] {
  const aliases = new Set(toOptionAliases(optionName));
  const values: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--") break;
    if (!arg.startsWith("--")) continue;

    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
    const name = flag.slice(2);
    if (!aliases.has(name)) continue;

    if (equalsIndex !== -1) {
      values.push(arg.slice(equalsIndex + 1));
      continue;
    }

    const next = rawArgs[i + 1];
    if (next && !next.startsWith("-")) {
      values.push(next);
      i += 1;
    }
  }

  return [...new Set(values.flatMap(splitMultiValue))];
}

function parseLimit(value: string): string {
  const limit = Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit < 1) {
    error("Invalid --limit", "Expected a positive integer.");
  }

  return String(limit);
}

function formatModel(model: ModelRecord): ModelRecord {
  const metadata = isRecord(model.metadata) ? model.metadata : {};
  const formatted: ModelRecord = {
    endpoint_id: model.endpoint_id,
  };

  if (metadata.display_name !== undefined) {
    formatted.name = metadata.display_name;
  }
  if (metadata.category !== undefined) formatted.category = metadata.category;
  if (metadata.status !== undefined) formatted.status = metadata.status;
  if (metadata.description !== undefined) {
    formatted.description = metadata.description;
  }

  for (const key of [
    "tags",
    "updated_at",
    "is_favorited",
    "thumbnail_url",
    "model_url",
    "date",
    "highlighted",
    "pinned",
  ] as const) {
    if (metadata[key] !== undefined) formatted[key] = metadata[key];
  }

  if (model.enterprise_status !== undefined) {
    formatted.enterprise_status = model.enterprise_status;
  }
  if (model.openapi !== undefined) formatted.openapi = model.openapi;

  return formatted;
}

export default defineCommand({
  meta: {
    name: "models",
    description: "Search, list, and inspect fal.ai models",
  },
  args: {
    query: {
      type: "positional",
      required: false,
      description: "Free-text query (default search mode)",
    },
    category: {
      type: "string",
      description: "Filter by category (text-to-image, image-to-video, etc.)",
    },
    status: {
      type: "enum",
      default: "active",
      options: ["active", "deprecated", "all"],
      description: "Filter by status: active (default), deprecated, or all",
    },
    limit: {
      type: "string",
      default: "20",
      description: "Max results (default: 20)",
    },
    cursor: {
      type: "string",
      description:
        "Pagination cursor from a previous response to fetch the next page",
    },
    endpoint_id: {
      type: "string",
      description:
        "Specific endpoint ID(s). Repeat the flag or pass comma-separated values.",
    },
    expand: {
      type: "string",
      description:
        "Expand fields. Repeat the flag or pass comma-separated values: openapi-3.0, enterprise_status",
    },
  },
  async run({ args, rawArgs }) {
    const query = args.query?.trim();
    const endpointIds = collectOptionValues(rawArgs, "endpoint_id");
    const expand = collectOptionValues(rawArgs, "expand");

    for (const value of expand) {
      if (!SUPPORTED_EXPANDS.has(value)) {
        error(
          `Invalid expand value: ${value}`,
          "Supported values: openapi-3.0, enterprise_status",
        );
      }
    }

    const url = new URL(`${PLATFORM_BASE}/models`);
    if (query) url.searchParams.set("q", query);
    if (args.category) url.searchParams.set("category", args.category);
    if (args.status !== "all") url.searchParams.set("status", args.status);
    url.searchParams.set("limit", parseLimit(args.limit));
    if (args.cursor) url.searchParams.set("cursor", args.cursor);
    for (const endpointId of endpointIds) {
      url.searchParams.append("endpoint_id", endpointId);
    }
    for (const value of expand) {
      url.searchParams.append("expand", value);
    }

    const res = await fetch(url.toString(), { headers: platformHeaders() });
    if (!res.ok) error(`Failed (${res.status})`, await res.text());

    const data = (await res.json()) as ModelsResponse;
    const models = (data.models ?? []).map(formatModel);

    output({
      ...(query ? { query } : {}),
      ...(args.category ? { category: args.category } : {}),
      ...(args.status !== "all" ? { status: args.status } : {}),
      ...(endpointIds.length > 0 ? { endpoint_ids: endpointIds } : {}),
      ...(expand.length > 0 ? { expand } : {}),
      count: models.length,
      has_more: data.has_more ?? false,
      ...(data.next_cursor ? { next_cursor: data.next_cursor } : {}),
      models,
    });
  },
});
