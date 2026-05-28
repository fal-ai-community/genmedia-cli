import { defineCommand } from "citty";
import { assetsRequest } from "../../lib/assets";
import { output } from "../../lib/output";

export default defineCommand({
  meta: {
    name: "delete",
    description: "Delete a persisted asset",
  },
  args: {
    vector_id: {
      type: "positional",
      required: true,
      description: "Vector ID",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args }) {
    await assetsRequest({
      method: "DELETE",
      path: `/${args.vector_id}`,
      idempotencyKey: args.idempotency_key,
      expect204: true,
    });
    output({ deleted: true, vector_id: args.vector_id });
  },
});
