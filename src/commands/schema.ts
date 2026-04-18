import { defineCommand } from "citty";
import { error, output, outputRawJson } from "../lib/output";
import { fetchModelSchema } from "../lib/schema-fetch";
import { simplifyProps } from "../lib/simplify-props";

export default defineCommand({
  meta: {
    name: "schema",
    description: "Get model schema in compact or OpenAPI format",
  },
  args: {
    endpointId: {
      type: "positional",
      required: true,
      description: "Model endpoint ID",
    },
    format: {
      type: "enum",
      default: "compact",
      options: ["compact", "openapi"],
      description: "Schema format: compact (default) or openapi",
    },
  },
  async run({ args }) {
    const result = await fetchModelSchema(args.endpointId);
    if (!result.ok) {
      if (result.failure.status === "not-found") {
        error(`Model not found: ${args.endpointId}`);
      }
      if (result.failure.status === "http-error") {
        error(
          `Schema fetch failed (${result.failure.httpStatus})`,
          result.failure.body,
        );
      }
      error(`Schema fetch failed: ${result.failure.message}`);
    }

    const { model, meta, openapi, inputSchema, outputSchema } = result.data;

    if (args.format === "openapi") {
      if (!openapi) {
        error(`OpenAPI schema not available for: ${args.endpointId}`);
      }
      outputRawJson(openapi);
      return;
    }

    output({
      endpoint_id: model.endpoint_id,
      name: meta.display_name,
      category: meta.category,
      input: inputSchema ? simplifyProps(inputSchema) : null,
      output: outputSchema ? simplifyProps(outputSchema) : null,
    });
  },
});
