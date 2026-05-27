import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fal } from "@fal-ai/client";
import { configureSDK } from "./api";
import { MIME_TYPES } from "./mime";
import { error } from "./output";

// Uploads a local file path or remote URL to fal storage and returns the
// fal CDN URL. Configures the SDK as a side effect.
export async function uploadToFalStorage(target: string): Promise<string> {
  configureSDK();

  if (target.startsWith("http://") || target.startsWith("https://")) {
    const response = await fetch(target);
    if (!response.ok) error(`Failed to fetch ${target}: ${response.status}`);
    const blob = await response.blob();
    const name = target.split("/").pop() || "upload";
    const file = new File([blob], name, {
      type: blob.type || "application/octet-stream",
    });
    return fal.storage.upload(file);
  }

  const filePath = resolve(target);
  if (!existsSync(filePath)) error(`File not found: ${filePath}`);
  const data = await readFile(filePath);
  const name = basename(filePath);
  const ext = extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || "application/octet-stream";
  const file = new File([data], name, { type: mimeType });
  return fal.storage.upload(file);
}
