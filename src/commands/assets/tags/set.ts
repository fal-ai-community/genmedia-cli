import { defineCommand } from "citty";
import { assetsRequest, resolveAssetTarget } from "../../../lib/assets";
import { collectOptionValues } from "../../../lib/cli-args";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: {
    name: "set",
    description:
      "Replace the full set of tags on an asset (auto-materializes target)",
  },
  args: {
    request_id: { type: "string", description: "Request ID" },
    vector_id: { type: "string", description: "Vector ID" },
    tag_id: {
      type: "string",
      description:
        "Tag IDs to assign (full replacement). Repeat or pass comma-separated.",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args, rawArgs }) {
    const target = resolveAssetTarget(args);
    const tagIds = collectOptionValues(rawArgs, "tag_id");

    const data = await assetsRequest<{ tags: unknown[] }>({
      method: "PUT",
      path: "/tags",
      body: { ...target, tag_ids: tagIds },
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
