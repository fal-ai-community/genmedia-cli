import { defineCommand } from "citty";
import { PLATFORM_BASE, platformHeaders } from "../lib/api";
import { error, output } from "../lib/output";
import { simplifyProps } from "../lib/simplify-props";

export default defineCommand({
  meta: {
    name: "schema",
    description: "Get full input/output schema for any model",
  },
  args: {
    endpointId: {
      type: "positional",
      required: true,
      description: "Model endpoint ID",
    },
  },
  async run({ args }) {
    const url = new URL(`${PLATFORM_BASE}/models`);
    url.searchParams.set("endpoint_id", args.endpointId);
    url.searchParams.set("expand", "openapi-3.0");

    const res = await fetch(url.toString(), { headers: platformHeaders() });
    if (!res.ok) error(`Schema fetch failed (${res.status})`, await res.text());

    const data = (await res.json()) as {
      models: Array<Record<string, unknown>>;
    };
    if (!data.models?.length) error(`Model not found: ${args.endpointId}`);

    const model = data.models[0];
    const openapi = model.openapi as Record<string, unknown> | undefined;
    const components = openapi?.components as
      | Record<string, unknown>
      | undefined;
    const schemas = components?.schemas as
      | Record<string, Record<string, unknown>>
      | undefined;

    let inputSchema: Record<string, unknown> | undefined;
    let outputSchema: Record<string, unknown> | undefined;
    if (schemas) {
      for (const [name, schema] of Object.entries(schemas)) {
        const lower = name.toLowerCase();
        if (
          lower === "input" ||
          lower === "request" ||
          lower.endsWith("input")
        ) {
          inputSchema = schema;
        }
        if (
          lower === "output" ||
          lower === "response" ||
          lower.endsWith("output")
        ) {
          outputSchema = schema;
        }
      }
    }

    const meta = (model.metadata as Record<string, unknown>) || {};
    output({
      endpoint_id: model.endpoint_id,
      name: meta.display_name,
      category: meta.category,
      input: inputSchema ? simplifyProps(inputSchema) : null,
      output: outputSchema ? simplifyProps(outputSchema) : null,
    });
  },
});
