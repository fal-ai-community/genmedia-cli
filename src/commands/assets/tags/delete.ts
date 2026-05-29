import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "delete", description: "Delete an asset tag" },
  args: {
    tag_id: {
      type: "positional",
      required: true,
      description: "Tag ID",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args }) {
    await assetsRequest({
      method: "DELETE",
      path: `/tags/${args.tag_id}`,
      idempotencyKey: args.idempotency_key,
      expect204: true,
    });
    output({ deleted: true, tag_id: args.tag_id });
  },
});
