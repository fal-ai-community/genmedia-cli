import { defineCommand } from "citty";
import { assetsRequest } from "../../lib/assets";
import { output } from "../../lib/output";

export default defineCommand({
  meta: {
    name: "delete",
    description: "Delete a persisted asset",
  },
  args: {
    asset_id: {
      type: "positional",
      required: true,
      description: "Asset ID",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args }) {
    await assetsRequest({
      method: "DELETE",
      path: `/${args.asset_id}`,
      idempotencyKey: args.idempotency_key,
      expect204: true,
    });
    output({ deleted: true, asset_id: args.asset_id });
  },
});
