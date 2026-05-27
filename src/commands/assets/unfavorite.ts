import { defineCommand } from "citty";
import { assetsRequest, resolveAssetTarget } from "../../lib/assets";
import { output } from "../../lib/output";

export default defineCommand({
  meta: {
    name: "unfavorite",
    description: "Unfavorite an asset",
  },
  args: {
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
    const data = await assetsRequest<{
      asset_id: string;
      is_favorited: boolean;
    }>({
      method: "POST",
      path: "/unfavorite",
      body: target,
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
