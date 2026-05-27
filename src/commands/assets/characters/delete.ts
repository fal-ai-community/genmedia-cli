import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "delete", description: "Delete an asset character" },
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
    await assetsRequest({
      method: "DELETE",
      path: `/characters/${args.character_id}`,
      idempotencyKey: args.idempotency_key,
      expect204: true,
    });
    output({ deleted: true, character_id: args.character_id });
  },
});
