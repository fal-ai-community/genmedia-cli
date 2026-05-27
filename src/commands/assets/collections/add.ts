import { defineCommand } from "citty";
import { assetsRequest, resolveAssetTarget } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: {
    name: "add",
    description: "Add an asset to a collection (auto-materializes target)",
  },
  args: {
    collection_id: {
      type: "positional",
      required: true,
      description: "Collection ID",
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
      path: `/collections/${args.collection_id}/assets`,
      body: target,
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
