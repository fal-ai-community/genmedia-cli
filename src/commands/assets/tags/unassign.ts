import { defineCommand } from "citty";
import { assetsRequest, resolveAssetTarget } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "unassign", description: "Remove a tag from an asset" },
  args: {
    tag_id: {
      type: "positional",
      required: true,
      description: "Tag ID",
    },
    request_id: { type: "string", description: "Request ID" },
    vector_id: { type: "string", description: "Vector ID" },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args }) {
    const target = resolveAssetTarget(args);
    await assetsRequest({
      method: "DELETE",
      path: `/tags/${args.tag_id}/assign`,
      body: target,
      idempotencyKey: args.idempotency_key,
      expect204: true,
    });
    output({ unassigned: true, tag_id: args.tag_id, ...target });
  },
});
