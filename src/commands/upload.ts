import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fal } from "@fal-ai/client";
import { defineCommand } from "citty";
import { configureSDK } from "../lib/api";
import { MIME_TYPES } from "../lib/mime";
import { error, output } from "../lib/output";

export default defineCommand({
  meta: {
    name: "upload",
    description: "Upload a local file or URL to fal.ai CDN",
  },
  args: {
    target: {
      type: "positional",
      required: true,
      description: "File path or URL to upload",
    },
  },
  async run({ args }) {
    configureSDK();

    const { target } = args;
    let cdnUrl: string;

    if (target.startsWith("http://") || target.startsWith("https://")) {
      const response = await fetch(target);
      if (!response.ok) error(`Failed to fetch ${target}: ${response.status}`);
      const blob = await response.blob();
      const name = target.split("/").pop() || "upload";
      const file = new File([blob], name, {
        type: blob.type || "application/octet-stream",
      });
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

    output({
      cdn_url: cdnUrl,
      hint: "Use this URL as input to fal.ai models.",
    });
  },
});
