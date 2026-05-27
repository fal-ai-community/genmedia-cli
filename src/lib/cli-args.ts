function splitMultiValue(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function toOptionAliases(optionName: string): string[] {
  const snakeCase = optionName.replaceAll("-", "_");
  const kebabCase = optionName.replaceAll("_", "-");
  const camelCase = snakeCase.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );

  return [...new Set([optionName, snakeCase, kebabCase, camelCase])];
}

// Collects values for a multi-value flag from rawArgs, supporting both
// `--flag a --flag b` and `--flag a,b` syntax. Aliases snake/kebab/camel.
export function collectOptionValues(
  rawArgs: string[],
  optionName: string,
): string[] {
  const aliases = new Set(toOptionAliases(optionName));
  const values: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--") break;
    if (!arg.startsWith("--")) continue;

    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
    const name = flag.slice(2);
    if (!aliases.has(name)) continue;

    if (equalsIndex !== -1) {
      values.push(arg.slice(equalsIndex + 1));
      continue;
    }

    const next = rawArgs[i + 1];
    if (next && !next.startsWith("-")) {
      values.push(next);
      i += 1;
    }
  }

  return [...new Set(values.flatMap(splitMultiValue))];
}
