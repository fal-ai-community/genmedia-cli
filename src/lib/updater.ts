import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { loadConfig, saveConfig } from "./config";
import { VERSION } from "./version";

const GITHUB_REPO = "fal-ai-community/genmedia-cli";
const USER_AGENT = "genmedia-cli";
const RATE_LIMIT_MS = 60 * 60 * 1000;
const MIN_BINARY_BYTES = 1024;

export type UpdatePlatform = "linux" | "darwin" | "windows";
export type UpdateArch = "x64" | "arm64";

export interface InstallInfo {
  execPath: string;
  stagedPath: string;
  oldPath: string;
  platform: UpdatePlatform;
  arch: UpdateArch;
  assetName: string;
}

export interface UpdateResult {
  current: string;
  latest: string | null;
  updated: boolean;
  staged: boolean;
  staged_path?: string;
  error?: string;
}

interface GithubRelease {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

function detectPlatform(): UpdatePlatform | null {
  if (process.platform === "linux") return "linux";
  if (process.platform === "darwin") return "darwin";
  if (process.platform === "win32") return "windows";
  return null;
}

function detectArch(): UpdateArch | null {
  if (process.arch === "x64") return "x64";
  if (process.arch === "arm64") return "arm64";
  return null;
}

export function getInstallInfo(): InstallInfo | null {
  const platform = detectPlatform();
  const arch = detectArch();
  if (!platform || !arch) return null;

  let execPath: string;
  try {
    execPath = realpathSync(process.execPath);
  } catch {
    execPath = process.execPath;
  }

  const ext = platform === "windows" ? ".exe" : "";
  return {
    execPath,
    stagedPath: `${execPath}.new`,
    oldPath: `${execPath}.old`,
    platform,
    arch,
    assetName: `genmedia-${platform}-${arch}${ext}`,
  };
}

export function preSwapPendingUpdate(): void {
  try {
    const info = getInstallInfo();
    if (!info) return;

    if (existsSync(info.oldPath)) {
      try {
        unlinkSync(info.oldPath);
      } catch {
        // Still held open on Windows; try again next run.
      }
    }

    if (!existsSync(info.stagedPath)) return;

    const stagedStat = statSync(info.stagedPath);
    if (stagedStat.size < MIN_BINARY_BYTES) {
      try {
        unlinkSync(info.stagedPath);
      } catch {}
      return;
    }

    renameSync(info.execPath, info.oldPath);
    renameSync(info.stagedPath, info.execPath);

    if (info.platform !== "windows") {
      try {
        chmodSync(info.execPath, 0o755);
      } catch {}
    }
  } catch {
    // Best-effort; never block the user's command.
  }
}

export function maybeTriggerBackgroundUpdate(): void {
  if (process.env.GENMEDIA_INTERNAL_UPDATE === "1") return;
  if (process.env.GENMEDIA_NO_UPDATE === "1") return;
  if (!process.stdout.isTTY) return;
  if (process.argv.includes("--json")) return;

  const cfg = loadConfig();
  if (cfg.autoUpdate === false) return;

  const lastCheck = cfg.lastUpdateCheckAt ?? 0;
  if (Date.now() - lastCheck < RATE_LIMIT_MS) return;

  if (!getInstallInfo()) return;

  saveConfig({ ...cfg, lastUpdateCheckAt: Date.now() });

  try {
    const child = Bun.spawn({
      cmd: [process.execPath, "__update-check"],
      env: { ...process.env, GENMEDIA_INTERNAL_UPDATE: "1" },
      stdio: ["ignore", "ignore", "ignore"],
    });
    child.unref();
  } catch {
    // Spawn unavailable; skip.
  }
}

function parseVersion(v: string): { nums: number[]; pre: string | null } {
  const stripped = v.replace(/^v/, "");
  const [core, ...preParts] = stripped.split("-");
  const nums = core.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pre = preParts.length > 0 ? preParts.join("-") : null;
  return { nums, pre };
}

export function compareSemver(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const n = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < n; i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (pa.pre === null && pb.pre === null) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  if (pa.pre === pb.pre) return 0;
  return pa.pre < pb.pre ? -1 : 1;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
  return res.text();
}

async function fetchBinary(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchLatestRelease(): Promise<GithubRelease> {
  const body = await fetchText(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  );
  return JSON.parse(body) as GithubRelease;
}

function parseChecksums(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^([0-9a-f]{64})\s+\*?(\S+)$/i);
    if (match) {
      const [, sha, name] = match;
      if (sha && name) out[name] = sha.toLowerCase();
    }
  }
  return out;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function downloadStaged(
  info: InstallInfo,
  release: GithubRelease,
): Promise<string | null> {
  const asset = release.assets.find((a) => a.name === info.assetName);
  if (!asset) return null;

  const checksumsAsset = release.assets.find((a) => a.name === "checksums.txt");
  let expected: string | undefined;
  if (checksumsAsset) {
    try {
      const checksums = parseChecksums(
        await fetchText(checksumsAsset.browser_download_url),
      );
      expected = checksums[info.assetName];
    } catch {
      // Missing checksums is not fatal; skip verification.
    }
  }

  const binary = await fetchBinary(asset.browser_download_url);
  if (binary.length < MIN_BINARY_BYTES) return null;
  if (expected && sha256(binary) !== expected) return null;

  mkdirSync(dirname(info.stagedPath), { recursive: true });
  const tmpPath = `${info.stagedPath}.dl`;
  writeFileSync(tmpPath, binary);
  if (info.platform !== "windows") {
    try {
      chmodSync(tmpPath, 0o755);
    } catch {}
  }
  renameSync(tmpPath, info.stagedPath);
  return info.stagedPath;
}

function swapStagedIntoPlace(info: InstallInfo): void {
  if (existsSync(info.oldPath)) {
    try {
      unlinkSync(info.oldPath);
    } catch {}
  }
  renameSync(info.execPath, info.oldPath);
  renameSync(info.stagedPath, info.execPath);
  if (info.platform !== "windows") {
    try {
      chmodSync(info.execPath, 0o755);
    } catch {}
  }
}

export async function runBackgroundUpdateCheck(): Promise<void> {
  try {
    const info = getInstallInfo();
    if (!info) return;

    const release = await fetchLatestRelease();
    const latest = release.tag_name.replace(/^v/, "");

    const cfg = loadConfig();
    saveConfig({ ...cfg, latestKnownVersion: latest });

    if (compareSemver(latest, VERSION) <= 0) return;

    await downloadStaged(info, release);
  } catch {
    // Silent — background task; worst case user doesn't get the update this hour.
  }
}

export async function runManualUpdate(opts: {
  checkOnly?: boolean;
  force?: boolean;
}): Promise<UpdateResult> {
  const result: UpdateResult = {
    current: VERSION,
    latest: null,
    updated: false,
    staged: false,
  };

  const info = getInstallInfo();
  if (!info) {
    result.error = "Unsupported platform for self-update.";
    return result;
  }

  let release: GithubRelease;
  try {
    release = await fetchLatestRelease();
  } catch (err) {
    result.error = `Failed to reach GitHub: ${(err as Error).message}`;
    return result;
  }

  const latest = release.tag_name.replace(/^v/, "");
  result.latest = latest;

  const cfg = loadConfig();
  saveConfig({ ...cfg, latestKnownVersion: latest });

  if (opts.checkOnly) return result;

  const cmp = compareSemver(latest, VERSION);
  if (cmp <= 0 && !opts.force) return result;

  let stagedPath: string | null;
  try {
    stagedPath = await downloadStaged(info, release);
  } catch (err) {
    result.error = `Download failed: ${(err as Error).message}`;
    return result;
  }

  if (!stagedPath) {
    result.error = `No release asset named ${info.assetName} (or checksum mismatch).`;
    return result;
  }

  try {
    swapStagedIntoPlace(info);
  } catch (err) {
    result.error = `Swap failed: ${(err as Error).message}`;
    result.staged = true;
    result.staged_path = stagedPath;
    return result;
  }

  result.updated = true;
  return result;
}
