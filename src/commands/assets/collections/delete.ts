import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "delete", description: "Delete an asset collection" },
  args: {
    collection_id: {
      type: "positional",
      required: true,
      description: "Collection ID",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args }) {
    await assetsRequest({
      method: "DELETE",
      path: `/collections/${args.collection_id}`,
      idempotencyKey: args.idempotency_key,
      expect204: true,
    });
    output({ deleted: true, collection_id: args.collection_id });
  },
});
