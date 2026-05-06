import { defineCommand } from "citty";
import { PLATFORM_BASE, platformFetch } from "../lib/api";
import { error, output } from "../lib/output";

export default defineCommand({
  meta: { name: "pricing", description: "Get pricing information for a model" },
  args: {
    endpointId: {
      type: "positional",
      required: true,
      description: "Model endpoint ID",
    },
  },
  async run({ args }) {
    const url = new URL(`${PLATFORM_BASE}/models/pricing`);
    url.searchParams.set("endpoint_id", args.endpointId);

    const res = await platformFetch(url.toString());
    if (!res.ok)
      error(`Pricing fetch failed (${res.status})`, await res.text());

    output(await res.json());
  },
});
