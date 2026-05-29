import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "unfavorite", description: "Unfavorite a character" },
  args: {
    character_id: {
      type: "positional",
      required: true,
      description: "Character ID",
    },
    idempotency_key: {
      type: "string",
      description: "Idempotency-Key header value for safe retries",
    },
  },
  async run({ args }) {
    const data = await assetsRequest<{ character: unknown }>({
      method: "POST",
      path: `/characters/${args.character_id}/unfavorite`,
      idempotencyKey: args.idempotency_key,
    });
    output(data);
  },
});
