import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { MIME_TYPES } from "./mime";

export type MediaRef = {
  url: string;
  contentType?: string;
  fileName?: string;
  fileSize?: number;
  jsonPath: string;
  index: number;
};

export type DownloadedFile = {
  url: string;
  path: string;
  size_bytes: number;
  json_path: string;
};

export type DownloadFailure = {
  url: string;
  json_path: string;
  error: string;
};

export type DownloadState =
  | { mode: "off" }
  | { mode: "on"; template: string | null };

const CONCURRENCY = 4;

let cachedExtByMime: Map<string, string> | null = null;
function extByMime(contentType: string | undefined): string | null {
  if (!contentType) return null;
  if (!cachedExtByMime) {
    cachedExtByMime = new Map();
    for (const [ext, mime] of Object.entries(MIME_TYPES)) {
      if (!cachedExtByMime.has(mime)) {
        cachedExtByMime.set(mime, ext.replace(/^\./, ""));
      }
    }
  }
  const base = contentType.split(";")[0]?.trim().toLowerCase();
  if (!base) return null;
  return cachedExtByMime.get(base) ?? null;
}

function splitName(raw: string): { name: string; ext: string } {
  const ext = extname(raw).replace(/^\./, "").toLowerCase();
  const name = ext ? raw.slice(0, -(ext.length + 1)) : raw;
  return { name, ext };
}

function fileNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    if (!last) return null;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  } catch {
    return null;
  }
}

function deriveNameExt(ref: MediaRef): { name: string; ext: string } {
  if (ref.fileName && ref.fileName.length > 0) {
    const parts = splitName(ref.fileName);
    if (!parts.ext) {
      const fallbackExt = extByMime(ref.contentType) ?? "";
      return { name: parts.name, ext: fallbackExt };
    }
    return parts;
  }
  const fromUrl = fileNameFromUrl(ref.url);
  if (fromUrl) {
    const parts = splitName(fromUrl);
    if (!parts.ext) {
      const fallbackExt = extByMime(ref.contentType) ?? "";
      return { name: parts.name || "file", ext: fallbackExt };
    }
    return { name: parts.name || "file", ext: parts.ext };
  }
  return { name: "file", ext: extByMime(ref.contentType) ?? "bin" };
}

export function extractMediaRefs(data: unknown): MediaRef[] {
  const refs: MediaRef[] = [];
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i], `${path}[${i}]`);
      }
      return;
    }
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    const url = rec.url;
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      refs.push({
        url,
        contentType:
          typeof rec.content_type === "string" ? rec.content_type : undefined,
        fileName:
          typeof rec.file_name === "string" && rec.file_name.length > 0
            ? rec.file_name
            : undefined,
        fileSize: typeof rec.file_size === "number" ? rec.file_size : undefined,
        jsonPath: path || "result",
        index: refs.length,
      });
    }
    for (const [key, value] of Object.entries(rec)) {
      if (key === "url") continue;
      const childPath = path ? `${path}.${key}` : key;
      walk(value, childPath);
    }
  };
  walk(data, "");
  for (let i = 0; i < refs.length; i++) refs[i].index = i;
  return refs;
}

function applyTemplate(
  template: string,
  ref: MediaRef,
  requestId: string,
  derived: { name: string; ext: string },
): string {
  return template
    .replaceAll("{index}", String(ref.index))
    .replaceAll("{name}", derived.name)
    .replaceAll("{ext}", derived.ext)
    .replaceAll("{request_id}", requestId);
}

function resolveTemplate(
  template: string | null,
  ref: MediaRef,
  requestId: string,
): string {
  const derived = deriveNameExt(ref);
  const defaultFile = derived.ext
    ? `${derived.name}.${derived.ext}`
    : derived.name;

  if (template === null) {
    return resolve(process.cwd(), defaultFile);
  }

  const hasToken = /\{(index|name|ext|request_id)\}/.test(template);

  let raw = template;
  if (!hasToken) {
    const endsWithSep = /[\\/]$/.test(template);
    const absLike = isAbsolute(template) ? template : resolve(template);
    const isExistingDir = !endsWithSep && existsSync(absLike) && isDir(absLike);
    if (endsWithSep || isExistingDir) {
      raw = `${template.replace(/[\\/]$/, "")}/${defaultFile}`;
    }
  }

  const substituted = applyTemplate(raw, ref, requestId, derived);
  return isAbsolute(substituted)
    ? substituted
    : resolve(process.cwd(), substituted);
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function nextAvailablePath(target: string, taken: Set<string>): string {
  if (!taken.has(target) && !existsSync(target)) return target;
  const ext = extname(target);
  const base = ext ? target.slice(0, -ext.length) : target;
  for (let i = 1; i < 10_000; i++) {
    const candidate = `${base}_${i}${ext}`;
    if (!taken.has(candidate) && !existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not find a non-colliding path for ${target}`);
}

async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const launch = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i]);
    }
  };
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    runners.push(launch());
  }
  await Promise.all(runners);
  return results;
}

export async function downloadMedia(opts: {
  refs: MediaRef[];
  template: string | null;
  requestId: string;
}): Promise<{ downloaded: DownloadedFile[]; failed: DownloadFailure[] }> {
  const { refs, template, requestId } = opts;
  const downloaded: DownloadedFile[] = [];
  const failed: DownloadFailure[] = [];
  const takenPaths = new Set<string>();

  const plans = refs.map((ref) => {
    const resolved = resolveTemplate(template, ref, requestId);
    const target = nextAvailablePath(resolved, takenPaths);
    takenPaths.add(target);
    return { ref, target };
  });

  await runPool(plans, CONCURRENCY, async ({ ref, target }) => {
    try {
      const res = await fetch(ref.url);
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, buf);
      downloaded.push({
        url: ref.url,
        path: target,
        size_bytes: buf.length,
        json_path: ref.jsonPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({
        url: ref.url,
        json_path: ref.jsonPath,
        error: message,
      });
    }
  });

  downloaded.sort((a, b) => a.json_path.localeCompare(b.json_path));
  return { downloaded, failed };
}

export function parseDownloadFlag(argv: string[]): DownloadState {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--download") continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      return { mode: "on", template: null };
    }
    return { mode: "on", template: next };
  }
  return { mode: "off" };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
