import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "update", description: "Update an asset tag" },
  args: {
    tag_id: {
      type: "positional",
      required: true,
      description: "Tag ID",
    },
    name: {
      type: "string",
      description: "New tag name",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args }) {
    const data = await assetsRequest<{ tag: unknown }>({
      method: "PATCH",
      path: `/tags/${args.tag_id}`,
      body: { ...(args.name ? { name: args.name } : {}) },
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
