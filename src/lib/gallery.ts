import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { CONFIG_DIR } from "./config";
import {
  type AssetKind,
  type GalleryFile,
  type RunRecord,
  renderSessionHtml,
  renderSessionsIndexHtml,
  type SessionPayload,
  type SessionSummary,
} from "./gallery-template";
import { getSessionContext } from "./session";

export type { AssetKind, GalleryFile, RunRecord, SessionSummary };

// Root paths are computed lazily through these helpers so tests can redirect
// the entire gallery tree to a tmpdir via `setGalleryRoot`. Production
// callers see the standard `~/.genmedia/gallery` path with no change.
let _rootOverride: string | null = null;

export function setGalleryRoot(path: string | null): void {
  _rootOverride = path;
}

export function galleryDir(): string {
  return _rootOverride ?? join(CONFIG_DIR, "gallery");
}

export function sessionsDir(): string {
  return join(galleryDir(), "sessions");
}

export function rootIndexPath(): string {
  return join(galleryDir(), "index.html");
}

export function rootIndexUrl(): string {
  return pathToFileURL(rootIndexPath()).toString();
}

function lastSessionPath(): string {
  return join(galleryDir(), "last-session.json");
}

const DATA_FILE = "data.json";
const PAGE_FILE = "index.html";
const MAX_RUNS_PER_SESSION = 1000;
const MAX_SESSION_PREVIEWS = 4;
const DEFAULT_RETENTION_DAYS = 60;

export interface GalleryPaths {
  session_id: string;
  dir: string;
  data_path: string;
  index_path: string;
  index_url: string;
  index_root_url: string;
}

export interface RecordRunInput {
  ts: number;
  request_id: string;
  endpoint_id: string;
  modality: string | null;
  prompt: string | null;
  duration_ms: number | null;
  files: GalleryFile[];
}

const KIND_BY_EXT: Record<string, AssetKind> = {
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".gif": "image",
  ".webp": "image",
  ".svg": "image",
  ".avif": "image",
  ".heic": "image",
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
  ".m4v": "video",
  ".mp3": "audio",
  ".wav": "audio",
  ".ogg": "audio",
  ".flac": "audio",
  ".m4a": "audio",
  ".glb": "model",
  ".obj": "model",
  ".gltf": "model",
};

const KIND_BY_MIME_PREFIX: Array<{ prefix: string; kind: AssetKind }> = [
  { prefix: "image/", kind: "image" },
  { prefix: "video/", kind: "video" },
  { prefix: "audio/", kind: "audio" },
  { prefix: "model/", kind: "model" },
];

export function kindFor(opts: {
  path?: string | null;
  url?: string;
  contentType?: string;
}): AssetKind {
  if (opts.path) {
    const k = KIND_BY_EXT[extname(opts.path).toLowerCase()];
    if (k) return k;
  }
  if (opts.url) {
    try {
      const { pathname } = new URL(opts.url);
      const k = KIND_BY_EXT[extname(pathname).toLowerCase()];
      if (k) return k;
    } catch {
      // ignore parse errors
    }
  }
  if (opts.contentType) {
    const base = opts.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    for (const { prefix, kind } of KIND_BY_MIME_PREFIX) {
      if (base.startsWith(prefix)) return kind;
    }
  }
  return "other";
}

// Gates *recording*. Reads (list/open/clear) intentionally ignore this so a
// user who disabled recording can still inspect or purge prior galleries.
export function isGalleryDisabled(): boolean {
  const v = process.env.GENMEDIA_NO_GALLERY;
  return v === "1" || v === "true";
}

function retentionDays(): number {
  const raw = process.env.GENMEDIA_GALLERY_RETENTION_DAYS;
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS;
}

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export function galleryPaths(sessionId: string): GalleryPaths {
  const dir = join(sessionsDir(), sessionId);
  const indexPath = join(dir, PAGE_FILE);
  return {
    session_id: sessionId,
    dir,
    data_path: join(dir, DATA_FILE),
    index_path: indexPath,
    index_url: pathToFileURL(indexPath).toString(),
    index_root_url: rootIndexUrl(),
  };
}

function readSessionPayload(paths: GalleryPaths): SessionPayload | null {
  if (!existsSync(paths.data_path)) return null;
  try {
    const raw = readFileSync(paths.data_path, "utf-8");
    const parsed = JSON.parse(raw) as SessionPayload;
    if (parsed.schema_version !== 1 || !Array.isArray(parsed.runs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionHtml(paths: GalleryPaths, payload: SessionPayload): void {
  writeFileSync(paths.index_path, renderSessionHtml(payload), "utf-8");
}

function writeSessionPayload(
  paths: GalleryPaths,
  payload: SessionPayload,
): void {
  ensureDir(paths.dir);
  writeFileSync(paths.data_path, JSON.stringify(payload, null, 2), "utf-8");
  writeSessionHtml(paths, payload);
}

// Re-renders the session HTML from its on-disk data.json using the *current*
// bundled template + VERSION. Best-effort: returns false (no throw) when the
// session has no recorded data or the write fails. Use from any read path
// that's about to hand the user a file:// URL — guarantees the page they
// open matches the CLI version that just emitted the URL.
export function regenerateSessionHtml(sessionId: string): boolean {
  const paths = galleryPaths(sessionId);
  const payload = readSessionPayload(paths);
  if (!payload) return false;
  try {
    ensureDir(paths.dir);
    writeSessionHtml(paths, payload);
    return true;
  } catch {
    return false;
  }
}

// Re-renders the root all-sessions index. Same best-effort contract as
// regenerateSessionHtml.
export function regenerateRootIndexHtml(): boolean {
  try {
    ensureDir(galleryDir());
    writeFileSync(
      rootIndexPath(),
      renderSessionsIndexHtml(listSessions()),
      "utf-8",
    );
    return true;
  } catch {
    return false;
  }
}

function emptyPayload(sessionId: string): SessionPayload {
  const ctx = getSessionContext();
  const now = Date.now();
  return {
    schema_version: 1,
    session_id: sessionId,
    session_source: ctx.source,
    agent: ctx.agent,
    agent_host: ctx.agentHost,
    cwd: safeCwd(),
    started_at: now,
    updated_at: now,
    runs: [],
  };
}

function safeCwd(): string | null {
  try {
    return process.cwd();
  } catch {
    return null;
  }
}

function summarize(payload: SessionPayload): SessionSummary {
  const kindCounts: Record<AssetKind, number> = {
    image: 0,
    video: 0,
    audio: 0,
    model: 0,
    other: 0,
  };
  let assetCount = 0;
  const modalities = new Set<string>();
  const previews: SessionSummary["previews"] = [];
  for (const r of payload.runs) {
    if (r.modality) modalities.add(r.modality);
    for (const f of r.files) {
      kindCounts[f.kind] = (kindCounts[f.kind] ?? 0) + 1;
      assetCount += 1;
      if (
        (f.kind === "image" || f.kind === "video" || f.kind === "audio") &&
        previews.length < MAX_SESSION_PREVIEWS
      ) {
        previews.push({ kind: f.kind, file: f.path, url: f.url });
      }
    }
  }
  return {
    session_id: payload.session_id,
    agent: payload.agent,
    agent_host: payload.agent_host,
    started_at: payload.started_at,
    updated_at: payload.updated_at,
    run_count: payload.runs.length,
    asset_count: assetCount,
    kind_counts: kindCounts,
    modalities: Array.from(modalities),
    previews,
  };
}

export function listSessions(): SessionSummary[] {
  const dir = sessionsDir();
  if (!existsSync(dir)) return [];
  const out: SessionSummary[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const paths = galleryPaths(entry.name);
    const payload = readSessionPayload(paths);
    if (!payload) continue;
    out.push(summarize(payload));
  }
  out.sort((a, b) => b.updated_at - a.updated_at);
  return out;
}

// Last-recorded session pointer. Lets `gallery open latest` reattach to the
// most-recent session even from a shell that wouldn't otherwise resolve to
// the same session id (e.g. a user opens a new terminal after their agent
// finished generating assets).
export interface LastSessionPointer {
  session_id: string;
  anchor: string;
  agent: string | null;
  agent_host: string | null;
  source: string;
  updated_at: number;
}

export function readLastSession(): LastSessionPointer | null {
  const p = lastSessionPath();
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8")) as LastSessionPointer;
    if (typeof parsed?.session_id !== "string" || parsed.session_id === "") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLastSession(value: LastSessionPointer): void {
  try {
    ensureDir(galleryDir());
    writeFileSync(lastSessionPath(), JSON.stringify(value, null, 2), "utf-8");
  } catch {
    // ignore — pointer is a hint, not load-bearing
  }
}

// Best-effort latest-session resolver. Prefers the explicit pointer file
// (cheap, accurate), falls back to scanning sessions/ if the pointer is
// missing or stale.
export function resolveLatestSessionId(): string | null {
  const last = readLastSession();
  if (last?.session_id) {
    const dir = join(sessionsDir(), last.session_id);
    if (existsSync(dir)) return last.session_id;
  }
  const sessions = listSessions();
  return sessions[0]?.session_id ?? null;
}

function pruneOldSessions(retentionMs: number): void {
  const dir = sessionsDir();
  if (!existsSync(dir)) return;
  const cutoff = Date.now() - retentionMs;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const subDir = join(dir, entry.name);
    try {
      const dataPath = join(subDir, DATA_FILE);
      const mtime = existsSync(dataPath)
        ? statSync(dataPath).mtimeMs
        : statSync(subDir).mtimeMs;
      if (mtime < cutoff) {
        rmSync(subDir, { recursive: true, force: true });
      }
    } catch {
      // skip on stat / rm errors
    }
  }
}

// Records a run and refreshes the static gallery files. Always returns
// (never throws) — gallery problems must not break the underlying CLI run.
export function recordRun(input: RecordRunInput): GalleryPaths | null {
  if (isGalleryDisabled()) return null;
  if (input.files.length === 0) return null;

  try {
    const ctx = getSessionContext();
    const paths = galleryPaths(ctx.id);
    ensureDir(galleryDir());
    ensureDir(sessionsDir());
    ensureDir(paths.dir);

    const payload = readSessionPayload(paths) ?? emptyPayload(ctx.id);
    payload.agent = payload.agent ?? ctx.agent;
    payload.agent_host = payload.agent_host ?? ctx.agentHost;
    payload.session_source = payload.session_source || ctx.source;
    payload.updated_at = Math.max(payload.updated_at, input.ts);

    const run: RunRecord = {
      ts: input.ts,
      request_id: input.request_id,
      endpoint_id: input.endpoint_id,
      modality: input.modality,
      prompt: input.prompt,
      duration_ms: input.duration_ms,
      files: input.files,
    };
    payload.runs.push(run);

    if (payload.runs.length > MAX_RUNS_PER_SESSION) {
      payload.runs.splice(0, payload.runs.length - MAX_RUNS_PER_SESSION);
    }

    writeSessionPayload(paths, payload);
    writeLastSession({
      session_id: payload.session_id,
      anchor: ctx.anchor,
      agent: payload.agent,
      agent_host: payload.agent_host,
      source: payload.session_source,
      updated_at: payload.updated_at,
    });

    pruneOldSessions(retentionDays() * 24 * 60 * 60 * 1000);
    regenerateRootIndexHtml();

    return paths;
  } catch {
    return null;
  }
}

export interface ClearOptions {
  sessionId?: string;
  all?: boolean;
}

export interface ClearResult {
  cleared: string[];
}

export function clearGallery(opts: ClearOptions = {}): ClearResult {
  const cleared: string[] = [];
  const sessions = sessionsDir();
  const idx = rootIndexPath();
  const lastPtr = lastSessionPath();

  if (!existsSync(sessions)) {
    if (opts.all && existsSync(idx)) {
      try {
        rmSync(idx, { force: true });
      } catch {
        // ignore
      }
    }
    if (opts.all && existsSync(lastPtr)) {
      try {
        rmSync(lastPtr, { force: true });
      } catch {
        // ignore
      }
    }
    return { cleared };
  }

  if (opts.sessionId) {
    const dir = join(sessions, opts.sessionId);
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
        cleared.push(opts.sessionId);
      } catch {
        // ignore
      }
    }
    // If we just cleared the session the pointer points at, drop the pointer
    // too so `gallery open latest` won't 404.
    const last = readLastSession();
    if (last?.session_id === opts.sessionId && existsSync(lastPtr)) {
      try {
        rmSync(lastPtr, { force: true });
      } catch {
        // ignore
      }
    }
  } else if (opts.all) {
    for (const entry of readdirSync(sessions, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        rmSync(join(sessions, entry.name), {
          recursive: true,
          force: true,
        });
        cleared.push(entry.name);
      } catch {
        // ignore
      }
    }
    if (existsSync(lastPtr)) {
      try {
        rmSync(lastPtr, { force: true });
      } catch {
        // ignore
      }
    }
  }

  try {
    regenerateRootIndexHtml();
  } catch {
    // ignore
  }
  return { cleared };
}

// Builds GalleryFile records from the run result + (optionally) downloaded
// local paths. Each local download is paired back with its source URL by
// json_path, which extractMediaRefs() and downloadMedia() both carry through.
export function buildGalleryFiles(
  refs: ReadonlyArray<{
    url: string;
    contentType?: string;
    fileSize?: number;
    jsonPath: string;
  }>,
  downloaded: ReadonlyArray<{
    url: string;
    path: string;
    size_bytes: number;
    json_path: string;
  }> = [],
): GalleryFile[] {
  const byJsonPath = new Map<string, (typeof downloaded)[number]>();
  const byUrl = new Map<string, (typeof downloaded)[number]>();
  for (const d of downloaded) {
    byJsonPath.set(d.json_path, d);
    byUrl.set(d.url, d);
  }
  return refs.map((ref) => {
    const local = byJsonPath.get(ref.jsonPath) ?? byUrl.get(ref.url) ?? null;
    return {
      path: local?.path ?? null,
      url: ref.url,
      size_bytes: local?.size_bytes ?? ref.fileSize ?? null,
      kind: kindFor({
        path: local?.path,
        url: ref.url,
        contentType: ref.contentType,
      }),
      json_path: ref.jsonPath,
    };
  });
}
