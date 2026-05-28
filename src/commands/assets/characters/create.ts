import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { collectOptionValues } from "../../../lib/cli-args";
import { error, output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "create", description: "Create an asset character" },
  args: {
    name: {
      type: "positional",
      required: true,
      description: "Character display name (max 255 chars)",
    },
    description: {
      type: "string",
      required: true,
      description: "Text description for semantic matching (max 2000 chars)",
    },
    identifier: {
      type: "string",
      description: "Optional @mention identifier (max 64 chars)",
    },
    reference_image: {
      type: "string",
      description:
        "Reference images (1-20). Pass a request_id or vector_id from existing fal media; only pass a URL for external (non-fal) images. Repeat the flag or pass comma-separated.",
    },
    cover_image_url: {
      type: "string",
      description: "Optional fal-hosted cover image URL",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args, rawArgs }) {
    const referenceImages = collectOptionValues(rawArgs, "reference_image");
    if (referenceImages.length === 0) {
      error(
        "At least one --reference_image is required (max 20). Pass a fal-hosted URL, request_id, or vector_id.",
      );
    }
    const data = await assetsRequest<{ character: unknown }>({
      method: "POST",
      path: "/characters",
      body: {
        name: args.name,
        description: args.description,
        ...(args.identifier ? { identifier: args.identifier } : {}),
        reference_images: referenceImages,
        ...(args.cover_image_url
          ? { cover_image_url: args.cover_image_url }
          : {}),
      },
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
