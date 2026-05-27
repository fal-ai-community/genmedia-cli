import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "favorite", description: "Favorite a collection" },
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
    const data = await assetsRequest<{ collection: unknown }>({
      method: "POST",
      path: `/collections/${args.collection_id}/favorite`,
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
