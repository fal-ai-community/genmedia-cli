import { defineCommand } from "citty";
import { assetsRequest, resolveAssetTarget } from "../../lib/assets";
import { output } from "../../lib/output";

export default defineCommand({
  meta: {
    name: "favorite",
    description:
      "Favorite an asset (auto-materializes from request_id/vector_id)",
  },
  args: {
    asset_id: { type: "string", description: "Persisted asset ID" },
    request_id: {
      type: "string",
      description: "Request ID (auto-materialized into an asset)",
    },
    vector_id: {
      type: "string",
      description: "Vector ID (auto-materialized into an asset)",
    },
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
      path: "/favorite",
      body: target,
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
