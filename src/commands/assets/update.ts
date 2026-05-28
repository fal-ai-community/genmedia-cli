import { defineCommand } from "citty";
import { assetsRequest } from "../../lib/assets";
import { output } from "../../lib/output";

export default defineCommand({
  meta: {
    name: "update",
    description: "Update the saved prompt of an uploaded asset",
  },
  args: {
    vector_id: {
      type: "positional",
      required: true,
      description: "Vector ID",
    },
    prompt: {
      type: "string",
      required: true,
      description: "New prompt or description (max 2000 chars)",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args }) {
    const data = await assetsRequest<{ asset: unknown }>({
      method: "PATCH",
      path: `/${args.vector_id}`,
      body: { prompt: args.prompt },
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
