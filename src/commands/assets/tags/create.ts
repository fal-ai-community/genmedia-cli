import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "create", description: "Create an asset tag" },
  args: {
    name: {
      type: "positional",
      required: true,
      description: "Tag name (1-50 chars)",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args }) {
    const data = await assetsRequest<{ tag: unknown }>({
      method: "POST",
      path: "/tags",
      body: { name: args.name },
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
