import { defineCommand } from "citty";
import { assetsRequest, resolveAssetTarget } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "assign", description: "Assign a single tag to an asset" },
  args: {
    tag_id: {
      type: "positional",
      required: true,
      description: "Tag ID",
    },
    asset_id: { type: "string", description: "Persisted asset ID" },
    request_id: { type: "string", description: "Request ID" },
    vector_id: { type: "string", description: "Vector ID" },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args }) {
    const target = resolveAssetTarget(args);
    const data = await assetsRequest<{ success: boolean }>({
      method: "POST",
      path: `/tags/${args.tag_id}/assign`,
      body: target,
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
