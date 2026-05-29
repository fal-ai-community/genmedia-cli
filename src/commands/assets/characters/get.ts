import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "get", description: "Get an asset character" },
  args: {
    character_id: {
      type: "positional",
      required: true,
      description: "Character ID",
    },
  },
  async run({ args }) {
    const data = await assetsRequest<{ character: unknown }>({
      method: "GET",
      path: `/characters/${args.character_id}`,
    });
    output(data);
  },
});
