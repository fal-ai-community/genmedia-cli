import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { collectOptionValues } from "../../../lib/cli-args";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "update", description: "Update an asset character" },
  args: {
    character_id: {
      type: "positional",
      required: true,
      description: "Character ID",
    },
    name: { type: "string", description: "New display name" },
    description: { type: "string", description: "New description" },
    reference_image_url: {
      type: "string",
      description:
        "Replacement reference images (1-20). Repeat or comma-separated.",
    },
    cover_image_url: {
      type: "string",
      description: "New fal-hosted cover image URL",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args, rawArgs }) {
    const referenceUrls = collectOptionValues(rawArgs, "reference_image_url");
    const data = await assetsRequest<{ character: unknown }>({
      method: "PATCH",
      path: `/characters/${args.character_id}`,
      body: {
        ...(args.name ? { name: args.name } : {}),
        ...(args.description ? { description: args.description } : {}),
        ...(referenceUrls.length > 0
          ? { reference_image_urls: referenceUrls }
          : {}),
        ...(args.cover_image_url !== undefined
          ? { cover_image_url: args.cover_image_url }
          : {}),
      },
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
