import {
  type ArgDef,
  type ArgsDef,
  type CommandContext,
  type CommandDef,
  defineCommand,
} from "citty";
import { fetchModelSchema } from "./schema-fetch";
import { simplifyProps } from "./simplify-props";
import { colors } from "./ui";

const RESERVED_ARG_NAMES = new Set([
  "endpointId",
  "async",
  "logs",
  "help",
  "json",
]);

const dynamicRunCommands = new WeakSet<CommandDef>();

export function isDynamicRunCommand(cmd: CommandDef | undefined): boolean {
  return Boolean(cmd && dynamicRunCommands.has(cmd));
}

function toEnumOptions(values: unknown): string[] | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const opts = values.map((v) => String(v));
  return opts.every((v) => v.length > 0) ? opts : null;
}

function buildArgDef(prop: Record<string, unknown>): ArgDef {
  const jsonType = typeof prop.type === "string" ? prop.type : "string";
  const required = Boolean(prop.required);
  const description =
    typeof prop.description === "string" ? prop.description : undefined;
  const defaultValue = prop.default;

  const enumOpts = toEnumOptions(prop.enum);
  if (enumOpts) {
    return {
      type: "enum",
      options: enumOpts,
      required,
      description: appendTypeHint(description, `enum: ${enumOpts.join("|")}`),
      ...(defaultValue !== undefined ? { default: String(defaultValue) } : {}),
    };
  }

  if (jsonType === "boolean") {
    return {
      type: "boolean",
      required,
      description,
      ...(typeof defaultValue === "boolean" ? { default: defaultValue } : {}),
    };
  }

  return {
    type: "string",
    required,
    description: appendTypeHint(description, jsonType),
    ...(defaultValue !== undefined ? { default: String(defaultValue) } : {}),
  };
}

function appendTypeHint(
  description: string | undefined,
  hint: string,
): string | undefined {
  if (hint === "string") return description;
  const base = description?.trim();
  return base ? `${base} (${hint})` : `(${hint})`;
}

function buildDynamicArgs(
  inputSchema: Record<string, unknown> | undefined,
): ArgsDef {
  if (!inputSchema) return {};
  const props = simplifyProps(inputSchema)
    .filter((p) => {
      const name = p.name as string | undefined;
      return name && !RESERVED_ARG_NAMES.has(name);
    })
    .sort((a, b) => {
      const aReq = Boolean(a.required);
      const bReq = Boolean(b.required);
      if (aReq !== bReq) return aReq ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    });

  const args: ArgsDef = {};
  for (const prop of props) {
    args[prop.name as string] = buildArgDef(prop);
  }
  return args;
}

export async function buildDynamicRunCommand(
  endpointId: string,
): Promise<CommandDef | null> {
  const result = await fetchModelSchema(endpointId);
  if (!result.ok) return null;

  const { meta, inputSchema } = result.data;
  const displayName =
    typeof meta.display_name === "string" ? meta.display_name : endpointId;
  const modelDescription =
    typeof meta.description === "string" ? meta.description : undefined;
  const description = modelDescription
    ? `Run ${displayName} — ${modelDescription}`
    : `Run ${displayName} (waits for result)`;

  const command: CommandDef = defineCommand({
    meta: { name: "run", description },
    args: {
      endpointId: {
        type: "positional",
        required: true,
        description: "Model endpoint ID",
        default: endpointId,
      },
      ...buildDynamicArgs(inputSchema),
      async: {
        type: "boolean",
        description: "Submit to queue instead of waiting (returns request_id)",
      },
      logs: {
        type: "boolean",
        description: "Stream logs while the model runs in pretty terminal mode",
      },
    },
    async run(context: CommandContext) {
      const staticRun = (await import("../commands/run")).default;
      const delegate = staticRun.run as unknown as (
        ctx: CommandContext,
      ) => unknown;
      await delegate?.(context);
    },
  }) as CommandDef;
  dynamicRunCommands.add(command);
  return command;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require the ESC (0x1B) control char
const ANSI_RE = /\u001B\[[0-9;]*m/g;
const visualLen = (s: string): number => s.replace(ANSI_RE, "").length;

function wrapText(text: string, width: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  if (width <= 0) return [normalized];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current += ` ${word}`;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface Column {
  styled: string;
  description: string;
}

function renderColumns(
  rows: Column[],
  prefix: string,
  gap: string,
  termWidth: number,
): string {
  if (rows.length === 0) return "";
  const col1Width = Math.max(...rows.map((r) => visualLen(r.styled)));
  const leftPad = prefix.length + col1Width + gap.length;
  const descWidth = Math.max(termWidth - leftPad, 20);
  const padSpaces = " ".repeat(leftPad);

  return rows
    .map(({ styled, description }) => {
      const pad = " ".repeat(col1Width - visualLen(styled));
      const head = `${prefix}${pad}${styled}${gap}`;
      const lines = wrapText(description, descWidth);
      const [first = "", ...rest] = lines;
      return [`${head}${first}`, ...rest.map((l) => `${padSpaces}${l}`)].join(
        "\n",
      );
    })
    .join("\n");
}

interface ResolvedArg {
  name: string;
  type?: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
  valueHint?: string;
  negativeDescription?: string;
}

function resolveArgList(argsDef: ArgsDef): ResolvedArg[] {
  return Object.entries(argsDef).map(([name, def]) => ({
    name,
    ...(def as Record<string, unknown>),
  })) as ResolvedArg[];
}

function formatFlagStr(arg: ResolvedArg): string {
  let str = `--${arg.name}`;
  if (arg.type === "string" && (arg.valueHint || arg.default !== undefined)) {
    str += arg.valueHint
      ? `=<${arg.valueHint}>`
      : `="${String(arg.default ?? "")}"`;
  }
  if (arg.type === "enum" && arg.options) {
    str += `=<${arg.options.join("|")}>`;
  }
  return str;
}

function isRequiredOption(arg: ResolvedArg): boolean {
  return arg.required === true && arg.default === undefined;
}

const negativePrefixRe = /^no[-A-Z]/;

async function resolve<T>(
  value: T | Promise<T> | (() => T | Promise<T>) | undefined,
): Promise<T | undefined> {
  if (value === undefined) return undefined;
  return typeof value === "function" ? await (value as () => T)() : await value;
}

export async function renderDynamicRunUsage(
  cmd: CommandDef,
  parent?: CommandDef,
): Promise<string> {
  const cmdMeta = (await resolve(cmd.meta)) ?? {};
  const parentMeta = (await resolve(parent?.meta)) ?? {};
  const argsDef = (await resolve(cmd.args)) ?? {};
  const allArgs = resolveArgList(argsDef);

  const commandName = `${parentMeta.name ? `${parentMeta.name} ` : ""}${cmdMeta.name ?? "run"}`;
  const version = cmdMeta.version || parentMeta.version;
  const termWidth = process.stdout.columns || 80;

  const positionals = allArgs.filter((a) => a.type === "positional");
  const options = allArgs.filter((a) => a.type !== "positional");

  const posRows: Column[] = positionals.map((arg) => {
    const name = arg.name.toUpperCase();
    const defaultHint = arg.default ? `="${String(arg.default)}"` : "";
    return {
      styled: colors.cyan(name + defaultHint),
      description: arg.description ?? "",
    };
  });

  const optRows: Column[] = [];
  const usageLine: string[] = [];
  for (const arg of positionals) {
    const name = arg.name.toUpperCase();
    const req = arg.required !== false && arg.default === undefined;
    usageLine.push(req ? `<${name}>` : `[${name}]`);
  }
  for (const arg of options) {
    const req = isRequiredOption(arg);
    const baseFlag = formatFlagStr(arg);
    optRows.push({
      styled: colors.cyan(baseFlag + (req ? " (required)" : "")),
      description: arg.description ?? "",
    });
    if (
      arg.type === "boolean" &&
      arg.negativeDescription &&
      !negativePrefixRe.test(arg.name)
    ) {
      optRows.push({
        styled: colors.cyan(`--no-${arg.name}`),
        description: arg.negativeDescription,
      });
    }
    if (req) usageLine.push(baseFlag);
  }

  const lines: string[] = [];
  const header = cmdMeta.description
    ? `${cmdMeta.description} (${commandName}${version ? ` v${version}` : ""})`
    : `${commandName}${version ? ` v${version}` : ""}`;
  const headerWrapped = wrapText(header, termWidth).map((l) => colors.gray(l));
  lines.push(...headerWrapped, "");
  const hasOptions = optRows.length > 0 || posRows.length > 0;
  const usageStr = `${commandName}${hasOptions ? " [OPTIONS]" : ""}${usageLine.length ? ` ${usageLine.join(" ")}` : ""}`;
  lines.push(
    `${colors.underline(colors.bold("USAGE"))} ${colors.cyan(usageStr)}`,
    "",
  );

  if (posRows.length > 0) {
    lines.push(colors.underline(colors.bold("ARGUMENTS")), "");
    lines.push(renderColumns(posRows, "  ", "  ", termWidth));
    lines.push("");
  }
  if (optRows.length > 0) {
    lines.push(colors.underline(colors.bold("OPTIONS")), "");
    lines.push(renderColumns(optRows, "  ", "  ", termWidth));
    lines.push("");
  }

  return lines.join("\n");
}
