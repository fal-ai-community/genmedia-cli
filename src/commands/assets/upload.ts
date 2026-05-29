import { extname } from "node:path";
import { defineCommand } from "citty";
import { assetsRequest } from "../../lib/assets";
import { collectOptionValues } from "../../lib/cli-args";
import { MIME_TYPES } from "../../lib/mime";
import { error, output } from "../../lib/output";
import { uploadToFalStorage } from "../../lib/storage-upload";

type AssetType = "image" | "video" | "audio" | "3d";

const VALID_TYPES: readonly AssetType[] = ["image", "video", "audio", "3d"];

const FAL_HOSTS = new Set([
  "fal.media",
  "v2.fal.media",
  "v3.fal.media",
  "v3b.fal.media",
]);

function isFalHostedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return FAL_HOSTS.has(parsed.host);
  } catch {
    return false;
  }
}

function inferTypeFromExt(target: string): AssetType | undefined {
  const ext = extname(target.split("?")[0]).toLowerCase();
  const mime = MIME_TYPES[ext];
  if (!mime) return undefined;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (ext === ".glb" || ext === ".gltf" || ext === ".obj") return "3d";
  return undefined;
}

export default defineCommand({
  meta: {
    name: "upload",
    description:
      "Bring external media (a local file or non-fal URL) into the fal Assets library. For media that already came from a `genmedia run`, use the request_id with `assets favorite` / `collections add` / `characters create` instead.",
  },
  args: {
    target: {
      type: "positional",
      required: true,
      description: "Local file path or URL to ingest",
    },
    type: {
      type: "string",
      description:
        "Asset media type (image, video, audio, 3d). Auto-detected from file extension when possible.",
    },
    prompt: {
      type: "string",
      description: "Optional caption or description (max 2000 chars)",
    },
    collection_id: {
      type: "string",
      description: "Optional manual collection ID to add the asset to",
    },
    favorite: {
      type: "boolean",
      default: false,
      description: "Favorite the asset immediately",
    },
    tag_id: {
      type: "string",
      description: "Tag IDs to assign. Repeat or pass comma-separated.",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args, rawArgs }) {
    const tagIds = collectOptionValues(rawArgs, "tag_id");

    const isUrl =
      args.target.startsWith("http://") || args.target.startsWith("https://");
    const falUrl =
      isUrl && isFalHostedUrl(args.target)
        ? args.target
        : await uploadToFalStorage(args.target);

    let type = args.type as AssetType | undefined;
    if (!type) {
      type = inferTypeFromExt(args.target) ?? inferTypeFromExt(falUrl);
    }
    if (!type) {
      error(
        "Could not infer --type from file extension; pass --type explicitly",
        { allowed: VALID_TYPES },
      );
    }
    if (!VALID_TYPES.includes(type)) {
      error(`Invalid --type: ${type}`, { allowed: VALID_TYPES });
    }

    const data = await assetsRequest<{ asset: unknown }>({
      method: "POST",
      path: "/uploads",
      body: {
        url: falUrl,
        type,
        ...(args.prompt ? { prompt: args.prompt } : {}),
        ...(args.collection_id ? { collection_id: args.collection_id } : {}),
        favorite: Boolean(args.favorite),
        tag_ids: tagIds,
      },
      idempotencyKey: args.idempotency_key,
    });

    output(data);
  },
});
