import { track } from "./analytics";
import { PLATFORM_BASE, platformHeaders } from "./api";
import { error } from "./output";

export const ASSETS_BASE = `${PLATFORM_BASE}/assets`;

type QueryValue = string | number | boolean | string[] | undefined | null;

export type AssetTargetArgs = {
  asset_id?: string;
  request_id?: string;
  vector_id?: string;
};

export type AssetTarget =
  | { asset_id: string }
  | { request_id: string }
  | { vector_id: string };

// Validates exactly-one of --asset_id / --request_id / --vector_id is set.
export function resolveAssetTarget(args: AssetTargetArgs): AssetTarget {
  const provided = [args.asset_id, args.request_id, args.vector_id].filter(
    Boolean,
  );
  if (provided.length !== 1) {
    error("Provide exactly one of --asset_id, --request_id, or --vector_id", {
      asset_id: args.asset_id ?? null,
      request_id: args.request_id ?? null,
      vector_id: args.vector_id ?? null,
    });
  }
  if (args.asset_id) return { asset_id: args.asset_id };
  if (args.request_id) return { request_id: args.request_id };
  if (args.vector_id) return { vector_id: args.vector_id };
  throw new Error("unreachable: resolveAssetTarget");
}

function applyQuery(url: URL, query: Record<string, QueryValue>): void {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

export interface AssetsRequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  idempotencyKey?: string;
  expect204?: boolean;
}

export async function assetsRequest<T = unknown>(
  opts: AssetsRequestOptions,
): Promise<T> {
  const url = new URL(`${ASSETS_BASE}${opts.path}`);
  if (opts.query) applyQuery(url, opts.query);

  const headers: Record<string, string> = { ...platformHeaders() };
  if (opts.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey;
  }

  const start = performance.now();
  const res = await fetch(url.toString(), {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const durationMs = Math.round(performance.now() - start);

  track("assets_request", {
    method: opts.method,
    path: opts.path,
    status: res.status,
    ok: res.ok,
    durationMs,
  });

  if (!res.ok) {
    let body: unknown;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    error(`Assets ${opts.method} ${opts.path} failed (${res.status})`, body);
  }

  if (opts.expect204 || res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
