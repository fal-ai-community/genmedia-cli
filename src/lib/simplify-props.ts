export function simplifyProps(
  schema: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const props = schema.properties as
    | Record<string, Record<string, unknown>>
    | undefined;
  const required = (schema.required as string[]) || [];
  if (!props) return [];

  return Object.entries(props).map(([name, prop]) => {
    let type = (prop.type as string) || "unknown";
    if (type === "array" && prop.items) {
      const items = prop.items as Record<string, unknown>;
      type = `array<${items.type || "unknown"}>`;
    }
    return {
      name,
      type,
      required: required.includes(name),
      ...(prop.description ? { description: prop.description } : {}),
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      ...(prop.enum ? { enum: prop.enum } : {}),
    };
  });
}
