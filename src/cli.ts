#!/usr/bin/env node

/**
 * falgen — Agent-first CLI for fal.ai
 *
 * Designed for both humans and AI agents. All commands output structured JSON.
 * Agents can discover capabilities via `falgen --help --json` and execute any command.
 *
 * Usage:
 *   falgen search "text to video"
 *   falgen schema fal-ai/flux/dev
 *   falgen run fal-ai/flux/dev --prompt "a cat in space"
 *   falgen upload ./photo.jpg
 *   falgen docs "how to use LoRA"
 */

import { fal } from "@fal-ai/client";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { existsSync } from "node:fs";

// ─── Config ──────────────────────────────────────────────────────────

const PLATFORM_BASE = "https://api.fal.ai/v1";

function getApiKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) {
    error("FAL_KEY environment variable is required. Get one at https://fal.ai/dashboard/keys");
    process.exit(1);
  }
  return key;
}

function configureSDK(): void {
  fal.config({ credentials: getApiKey() });
}

function platformHeaders(): Record<string, string> {
  return {
    Authorization: `Key ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

// ─── Output helpers ──────────────────────────────────────────────────

function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function error(message: string, details?: unknown): never {
  console.error(JSON.stringify({ error: message, ...(details ? { details } : {}) }, null, 2));
  process.exit(1);
}

// ─── MIME types for upload ───────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".flac": "audio/flac", ".pdf": "application/pdf",
  ".glb": "model/gltf-binary", ".obj": "model/obj",
};

// ─── Commands ────────────────────────────────────────────────────────

const COMMANDS = {
  search: {
    description: "Search fal.ai model catalog (600+ models)",
    usage: "falgen search <query> [--category <cat>] [--limit <n>]",
    args: "<query>",
    options: {
      "--category": "Filter by category (text-to-image, image-to-video, text-to-video, text-to-speech, etc.)",
      "--limit": "Max results (default: 20)",
    },
  },
  schema: {
    description: "Get full input/output schema for any model",
    usage: "falgen schema <endpoint_id>",
    args: "<endpoint_id>",
  },
  run: {
    description: "Run any model (waits for result)",
    usage: "falgen run <endpoint_id> [--key value ...]",
    args: "<endpoint_id>",
    options: {
      "--<key>": "Input parameter (e.g. --prompt 'a cat' --num_images 2)",
      "--async": "Submit to queue instead of waiting (returns request_id)",
    },
  },
  upload: {
    description: "Upload a local file or URL to fal.ai CDN",
    usage: "falgen upload <file_path_or_url>",
    args: "<file_path_or_url>",
  },
  status: {
    description: "Check job status or get result",
    usage: "falgen status <endpoint_id> <request_id> [--result] [--cancel]",
    args: "<endpoint_id> <request_id>",
    options: {
      "--result": "Fetch the completed result",
      "--cancel": "Cancel the job",
    },
  },
  pricing: {
    description: "Get pricing information for a model",
    usage: "falgen pricing <endpoint_id>",
    args: "<endpoint_id>",
  },
  models: {
    description: "List models by category",
    usage: "falgen models [--category <cat>]",
    options: {
      "--category": "Category to list (text-to-image, image-to-video, etc.)",
    },
  },
  docs: {
    description: "Search fal.ai documentation, guides, and API references",
    usage: "falgen docs <query>",
    args: "<query>",
  },
};

// ─── Help ────────────────────────────────────────────────────────────

function showHelp(asJson: boolean): void {
  if (asJson) {
    output({
      name: "falgen",
      version: "0.1.0",
      description: "Agent-first CLI for fal.ai — search, run, and manage 600+ generative AI models",
      install: "curl https://falgen.sh/install -fsS | bash",
      env: { FAL_KEY: "Required. Your fal.ai API key from https://fal.ai/dashboard/keys" },
      commands: COMMANDS,
    });
    return;
  }

  console.log(`
falgen — Agent-first CLI for fal.ai

USAGE:
  falgen <command> [args] [options]

COMMANDS:
  search <query>              Search model catalog (600+ models)
  schema <endpoint_id>        Get model input/output schema
  run <endpoint_id> [inputs]  Run any model (waits for result)
  upload <file_or_url>        Upload file to fal.ai CDN
  status <endpoint> <req_id>  Check job status / get result
  pricing <endpoint_id>       Get model pricing
  models                      List models by category
  docs <query>                Search fal.ai documentation

OPTIONS:
  --json    Force JSON output (default for agents)
  --help    Show this help

ENV:
  FAL_KEY   Required. Your fal.ai API key.

EXAMPLES:
  falgen search "text to video"
  falgen schema fal-ai/flux/dev
  falgen run fal-ai/flux/dev --prompt "a cat in space"
  falgen upload ./photo.jpg
  falgen status fal-ai/flux/dev abc-123 --result
  falgen docs "how to upload a file"
`);
}

// ─── Command: search ─────────────────────────────────────────────────

async function cmdSearch(args: string[], flags: Record<string, string>): Promise<void> {
  const query = args.join(" ") || undefined;
  const category = flags["--category"];
  const limit = parseInt(flags["--limit"] || "20", 10);

  const url = new URL(`${PLATFORM_BASE}/models`);
  if (query) url.searchParams.set("q", query);
  if (category) url.searchParams.set("category", category);
  url.searchParams.set("status", "active");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), { headers: platformHeaders() });
  if (!res.ok) error(`Search failed (${res.status})`, await res.text());

  const data = await res.json() as { models: Array<Record<string, unknown>>; has_more: boolean };
  const models = data.models.map((m: Record<string, unknown>) => {
    const meta = m.metadata as Record<string, unknown> || {};
    return {
      endpoint_id: m.endpoint_id,
      name: meta.display_name,
      category: meta.category,
      description: meta.description,
    };
  });

  output({ models, count: models.length, has_more: data.has_more });
}

// ─── Command: schema ─────────────────────────────────────────────────

async function cmdSchema(args: string[]): Promise<void> {
  const endpointId = args[0];
  if (!endpointId) error("Usage: falgen schema <endpoint_id>");

  const url = new URL(`${PLATFORM_BASE}/models`);
  url.searchParams.set("endpoint_id", endpointId);
  url.searchParams.set("expand", "openapi-3.0");

  const res = await fetch(url.toString(), { headers: platformHeaders() });
  if (!res.ok) error(`Schema fetch failed (${res.status})`, await res.text());

  const data = await res.json() as { models: Array<Record<string, unknown>> };
  if (!data.models?.length) error(`Model not found: ${endpointId}`);

  const model = data.models[0];
  const openapi = model.openapi as Record<string, unknown> | undefined;
  const components = openapi?.components as Record<string, unknown> | undefined;
  const schemas = components?.schemas as Record<string, Record<string, unknown>> | undefined;

  let inputSchema: Record<string, unknown> | undefined;
  let outputSchema: Record<string, unknown> | undefined;
  if (schemas) {
    for (const [name, schema] of Object.entries(schemas)) {
      const lower = name.toLowerCase();
      if (lower === "input" || lower === "request" || lower.endsWith("input")) {
        inputSchema = schema;
      }
      if (lower === "output" || lower === "response" || lower.endsWith("output")) {
        outputSchema = schema;
      }
    }
  }

  const meta = model.metadata as Record<string, unknown> || {};
  output({
    endpoint_id: model.endpoint_id,
    name: meta.display_name,
    category: meta.category,
    input: inputSchema ? simplifyProps(inputSchema) : null,
    output: outputSchema ? simplifyProps(outputSchema) : null,
  });
}

function simplifyProps(schema: Record<string, unknown>): Array<Record<string, unknown>> {
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const required = (schema.required as string[]) || [];
  if (!props) return [];

  return Object.entries(props).map(([name, prop]) => {
    let type = (prop.type as string) || "unknown";
    if (type === "array" && prop.items) {
      const items = prop.items as Record<string, unknown>;
      type = `array<${items.type || "unknown"}>`;
    }
    return {
      name,
      type,
      required: required.includes(name),
      ...(prop.description ? { description: prop.description } : {}),
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      ...(prop.enum ? { enum: prop.enum } : {}),
    };
  });
}

// ─── Command: run ────────────────────────────────────────────────────

async function cmdRun(args: string[], flags: Record<string, string>): Promise<void> {
  const endpointId = args[0];
  if (!endpointId) error("Usage: falgen run <endpoint_id> --prompt 'text' [--key value ...]");

  configureSDK();

  const skipFlags = new Set(["--async", "--json", "--help"]);
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flags)) {
    if (skipFlags.has(key)) continue;
    const paramName = key.replace(/^--/, "");
    input[paramName] = parseValue(value);
  }

  const isAsync = "--async" in flags;

  if (isAsync) {
    const result = await fal.queue.submit(endpointId, { input });
    output({
      status: "submitted",
      request_id: result.request_id,
      endpoint_id: endpointId,
      hint: `Check status: falgen status ${endpointId} ${result.request_id}`,
    });
    return;
  }

  const logs: Array<{ message: string; level: string }> = [];
  const result = await fal.subscribe(endpointId, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if ("logs" in update && update.logs) {
        for (const log of update.logs) {
          logs.push({ message: log.message, level: log.level || "info" });
          console.error(`[${log.level || "info"}] ${log.message}`);
        }
      }
    },
  });

  output({
    status: "completed",
    request_id: result.requestId,
    result: result.data,
    ...(logs.length > 0 ? { logs } : {}),
  });
}

function parseValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== "") return num;
  try { return JSON.parse(value); } catch { return value; }
}

// ─── Command: upload ─────────────────────────────────────────────────

async function cmdUpload(args: string[]): Promise<void> {
  const target = args[0];
  if (!target) error("Usage: falgen upload <file_path_or_url>");

  configureSDK();

  let cdnUrl: string;

  if (target.startsWith("http://") || target.startsWith("https://")) {
    const response = await fetch(target);
    if (!response.ok) error(`Failed to fetch ${target}: ${response.status}`);
    const blob = await response.blob();
    const name = target.split("/").pop() || "upload";
    const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
    cdnUrl = await fal.storage.upload(file);
  } else {
    const filePath = resolve(target);
    if (!existsSync(filePath)) error(`File not found: ${filePath}`);
    const data = await readFile(filePath);
    const name = basename(filePath);
    const ext = extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";
    const file = new File([data], name, { type: mimeType });
    cdnUrl = await fal.storage.upload(file);
  }

  output({ cdn_url: cdnUrl, hint: "Use this URL as input to fal.ai models." });
}

// ─── Command: status ─────────────────────────────────────────────────

async function cmdStatus(args: string[], flags: Record<string, string>): Promise<void> {
  const endpointId = args[0];
  const requestId = args[1];
  if (!endpointId || !requestId) error("Usage: falgen status <endpoint_id> <request_id> [--result] [--cancel]");

  configureSDK();

  if ("--cancel" in flags) {
    await fal.queue.cancel(endpointId, { requestId });
    output({ status: "cancelled", request_id: requestId });
    return;
  }

  if ("--result" in flags) {
    const result = await fal.queue.result(endpointId, { requestId });
    output({ status: "completed", request_id: requestId, result: result.data });
    return;
  }

  const status = await fal.queue.status(endpointId, { requestId, logs: true });
  const result: Record<string, unknown> = {
    status: status.status,
    request_id: requestId,
  };
  if (status.status === "IN_QUEUE") {
    result.queue_position = status.queue_position;
  }
  if ((status.status === "IN_PROGRESS" || status.status === "COMPLETED") && status.logs) {
    result.logs = status.logs.slice(-5);
  }
  output(result);
}

// ─── Command: pricing ────────────────────────────────────────────────

async function cmdPricing(args: string[]): Promise<void> {
  const endpointId = args[0];
  if (!endpointId) error("Usage: falgen pricing <endpoint_id>");

  const url = new URL(`${PLATFORM_BASE}/models/pricing`);
  url.searchParams.set("endpoint_id", endpointId);

  const res = await fetch(url.toString(), { headers: platformHeaders() });
  if (!res.ok) error(`Pricing fetch failed (${res.status})`, await res.text());

  output(await res.json());
}

// ─── Command: models ─────────────────────────────────────────────────

async function cmdModels(flags: Record<string, string>): Promise<void> {
  const category = flags["--category"];

  if (!category) {
    output({
      categories: [
        "text-to-image", "image-to-image", "image-to-video", "text-to-video",
        "video-to-video", "text-to-speech", "speech-to-text", "text-to-music",
        "image-to-3d", "text-to-3d", "image-editing", "training", "llm",
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

  const data = await res.json() as { models: Array<Record<string, unknown>> };
  const models = data.models.map((m: Record<string, unknown>) => {
    const meta = m.metadata as Record<string, unknown> || {};
    return {
      endpoint_id: m.endpoint_id,
      name: meta.display_name,
      description: meta.description,
    };
  });

  output({ category, models, count: models.length });
}

// ─── Command: docs ───────────────────────────────────────────────────

async function cmdDocs(args: string[]): Promise<void> {
  const query = args.join(" ");
  if (!query) error("Usage: falgen docs <query>");

  const res = await fetch("https://docs.fal.ai/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "SearchFal", arguments: { query } },
    }),
  });

  const text = await res.text();
  const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
  if (!dataLine) error("No results from docs search");

  const data = JSON.parse(dataLine.slice(6)) as {
    result?: { content: Array<{ type: string; text: string }> };
  };

  if (!data.result?.content) error("No results");

  const results = data.result.content.map((c) => {
    const titleMatch = c.text.match(/^Title: (.+)/m);
    const linkMatch = c.text.match(/^Link: (.+)/m);
    const contentMatch = c.text.match(/^Content: ([\s\S]+)/m);
    return {
      title: titleMatch?.[1] || "Untitled",
      url: linkMatch?.[1] || null,
      content: contentMatch?.[1]?.trim() || c.text,
    };
  });

  output({ query, results, count: results.length });
}

// ─── Arg parser ──────────────────────────────────────────────────────

function parseArgs(argv: string[]): { command: string; args: string[]; flags: Record<string, string> } {
  const command = argv[0] || "help";
  const args: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[arg] = next;
        i++;
      } else {
        flags[arg] = "true";
      }
    } else {
      args.push(arg);
    }
  }

  return { command, args, flags };
}

// ─── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, args, flags } = parseArgs(process.argv.slice(2));
  const isJson = "--json" in flags;

  try {
    switch (command) {
      case "search":
        await cmdSearch(args, flags);
        break;
      case "schema":
        await cmdSchema(args);
        break;
      case "run":
        await cmdRun(args, flags);
        break;
      case "upload":
        await cmdUpload(args);
        break;
      case "status":
        await cmdStatus(args, flags);
        break;
      case "pricing":
        await cmdPricing(args);
        break;
      case "models":
        await cmdModels(flags);
        break;
      case "docs":
        await cmdDocs(args);
        break;
      case "help":
      case "--help":
        showHelp(isJson);
        break;
      default:
        error(`Unknown command: ${command}. Run 'falgen --help' to see available commands.`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(message);
  }
}

main();
