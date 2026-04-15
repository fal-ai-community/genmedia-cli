import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { hostname, userInfo } from "node:os";
import { join } from "node:path";

export type OutputFormat = "auto" | "json" | "standard";

// In-memory representation — apiKey is always decrypted here
export interface GenmediaConfig {
  apiKey?: string;
  outputFormat?: OutputFormat;
  autoLoadEnv?: boolean;
}

// On-disk representation — apiKey is stored encrypted, never plaintext
interface StoredConfig {
  apiKey?: string;
  outputFormat?: OutputFormat;
  autoLoadEnv?: boolean;
}

export const CONFIG_DIR = join(userInfo().homedir, ".genmedia");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

let _cached: GenmediaConfig | null = null;

// Derives a 256-bit key from machine identity (hostname + username).
// Protects against accidental exposure (synced dotfiles, accidental commits,
// backups) but does not protect against an attacker with access to the same
// user account on the same machine — for that threat model, use FAL_KEY env var.
function deriveMachineKey(): Buffer {
  const identity = `${hostname()}:${userInfo().username}:genmedia`;
  return createHash("sha256").update(identity).digest();
}

function encryptApiKey(plaintext: string): string {
  const key = deriveMachineKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString("base64")).join(":");
}

function decryptApiKey(ciphertext: string): string | null {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) return null;
    const [iv, tag, encrypted] = parts.map((p) => Buffer.from(p, "base64"));
    const key = deriveMachineKey();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return (
      decipher.update(encrypted).toString("utf-8") + decipher.final("utf-8")
    );
  } catch {
    return null;
  }
}

export function loadConfig(): GenmediaConfig {
  if (_cached !== null) return _cached;
  try {
    if (existsSync(CONFIG_FILE)) {
      const stored = JSON.parse(
        readFileSync(CONFIG_FILE, "utf-8"),
      ) as StoredConfig;
      _cached = {
        outputFormat: stored.outputFormat,
        autoLoadEnv: stored.autoLoadEnv,
        ...(stored.apiKey
          ? { apiKey: decryptApiKey(stored.apiKey) ?? undefined }
          : {}),
      };
      return _cached;
    }
  } catch {
    // ignore parse/IO errors
  }
  _cached = {};
  return _cached;
}

export function saveConfig(config: GenmediaConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const stored: StoredConfig = {
    outputFormat: config.outputFormat,
    autoLoadEnv: config.autoLoadEnv,
    ...(config.apiKey ? { apiKey: encryptApiKey(config.apiKey) } : {}),
  };
  writeFileSync(CONFIG_FILE, JSON.stringify(stored, null, 2), "utf-8");
  // Restrict file to owner read/write only (no-op on Windows but harmless)
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // Windows — permissions work differently, not an error
  }
  _cached = config;
}
