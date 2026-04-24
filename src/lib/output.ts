import type { OutputFormat } from "./config";
import { loadConfig } from "./config";
import { colors, symbols } from "./ui";

type OutputMode = "json" | "pretty";

export type OutputView = "default" | "run" | "status" | "error";

export interface OutputOptions {
  showLogs?: boolean;
  showBody?: boolean;
  view?: OutputView;
}

let _format: OutputFormat | null = null;
let _mode: OutputMode | null = null;

function writeStdout(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function writeStderr(line = ""): void {
  process.stderr.write(`${line}\n`);
}

function getConfiguredFormat(): OutputFormat {
  if (_format === null) {
    _format = process.argv.includes("--json")
      ? "json"
      : (loadConfig().outputFormat ?? "auto");
  }
  return _format;
}

export function getOutputMode(): OutputMode {
  if (_mode !== null) return _mode;

  const configuredFormat = getConfiguredFormat();
  if (configuredFormat === "json") {
    _mode = "json";
  } else if (configuredFormat === "standard") {
    _mode = "pretty";
  } else {
    _mode = process.stdout.isTTY ? "pretty" : "json";
  }

  return _mode;
}

export function isJsonOutput(): boolean {
  return getOutputMode() === "json";
}

export function isPrettyOutput(): boolean {
  return getOutputMode() === "pretty";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function humanizeKey(key: string): string {
  return key.replaceAll("_", " ");
}

function formatStatus(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === "COMPLETED") return colors.green(status);
  if (normalized === "IN_PROGRESS") return colors.cyan(status);
  if (normalized === "IN_QUEUE" || normalized === "SUBMITTED") {
    return colors.yellow(status);
  }
  if (normalized === "CANCELLED") return colors.yellow(status);
  if (normalized === "ERROR" || normalized === "FAILED")
    return colors.red(status);
  return colors.bold(status);
}

function formatScalar(value: unknown, key?: string): string {
  if (value === null) return colors.dim("null");
  if (value === undefined) return colors.dim("undefined");
  if (typeof value === "boolean")
    return value ? colors.green("true") : colors.dim("false");
  if (typeof value === "number" || typeof value === "bigint")
    return colors.yellow(String(value));
  if (typeof value === "string") {
    if (key === "status") return formatStatus(value);
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return colors.cyan(value);
    }
    return value;
  }
  return String(value);
}

function printLogs(
  logs: unknown[],
  writeLine: (line?: string) => void,
  indent = 0,
): void {
  const pad = "  ".repeat(indent);
  for (const item of logs) {
    if (!isRecord(item)) {
      writeLine(`${pad}${symbols.bullet} ${formatScalar(item)}`);
      continue;
    }

    const level = typeof item.level === "string" ? item.level : "INFO";
    const message =
      typeof item.message === "string" ? item.message : JSON.stringify(item);
    const timestamp =
      typeof item.timestamp === "string" && item.timestamp.length > 0
        ? ` ${colors.dim(item.timestamp)}`
        : "";
    const levelLabel = colors.bold(level.padEnd(7));
    writeLine(`${pad}${symbols.bullet} ${levelLabel} ${message}${timestamp}`);
  }
}

function printPrettyValue(
  data: unknown,
  writeLine: (line?: string) => void,
  indent = 0,
): void {
  const pad = "  ".repeat(indent);

  if (Array.isArray(data)) {
    if (data.length === 0) {
      writeLine(`${pad}${colors.dim("(empty)")}`);
      return;
    }

    for (const item of data) {
      if (isRecord(item) || Array.isArray(item)) {
        writeLine(`${pad}${symbols.bullet}`);
        printPrettyValue(item, writeLine, indent + 1);
      } else {
        writeLine(`${pad}${symbols.bullet} ${formatScalar(item)}`);
      }
    }
    return;
  }

  if (isRecord(data)) {
    const entries = Object.entries(data);
    if (entries.length === 0) {
      writeLine(`${pad}${colors.dim("(empty)")}`);
      return;
    }

    for (const [key, value] of entries) {
      const label = `${pad}${colors.bold(humanizeKey(key))}:`;
      if (Array.isArray(value) || isRecord(value)) {
        writeLine(label);
        printPrettyValue(value, writeLine, indent + 1);
      } else {
        writeLine(`${label} ${formatScalar(value, key)}`);
      }
    }
    return;
  }

  writeLine(`${pad}${formatScalar(data)}`);
}

function printJobView(
  data: Record<string, unknown>,
  options: OutputOptions,
  writeLine: (line?: string) => void,
): void {
  const { logs, result, ...rest } = data;
  const status =
    typeof data.status === "string"
      ? data.status
      : options.view === "run"
        ? "completed"
        : "status";
  const title = options.view === "run" ? "Run" : "Status";

  writeLine(colors.bold(`${title} ${formatStatus(status)}`));

  const summary = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(summary).length > 0) {
    writeLine();
    printPrettyValue(summary, writeLine);
  }

  if (result !== undefined) {
    writeLine();
    writeLine(colors.bold("Result"));
    printPrettyValue(result, writeLine, 1);
  }

  if (Array.isArray(logs) && logs.length > 0) {
    writeLine();
    writeLine(colors.bold("Logs"));
    if (options.showLogs) {
      printLogs(logs, writeLine, 1);
    } else {
      writeLine(
        `  ${colors.dim(`${logs.length} log entries hidden. Re-run with --logs to show them.`)}`,
      );
    }
  }
}

function printValidationErrors(
  issues: unknown[],
  writeLine: (line?: string) => void,
): void {
  writeLine(colors.bold("Validation errors"));
  for (const item of issues) {
    if (!isRecord(item)) {
      writeLine(`  ${colors.red(symbols.bullet)} ${formatScalar(item)}`);
      continue;
    }
    const field =
      typeof item.field === "string" && item.field.length > 0
        ? item.field
        : "body";
    const message =
      typeof item.message === "string" ? item.message : JSON.stringify(item);
    const type =
      typeof item.type === "string" && item.type.length > 0
        ? ` ${colors.dim(`(${item.type})`)}`
        : "";
    writeLine(
      `  ${colors.red(symbols.bullet)} ${colors.bold(field)}: ${message}${type}`,
    );
    if ("input" in item && item.input !== undefined) {
      writeLine(`      ${colors.dim("received:")} ${formatScalar(item.input)}`);
    }
  }
}

function printErrorDetails(
  data: Record<string, unknown>,
  options: OutputOptions,
  writeLine: (line?: string) => void,
): void {
  const { validation_errors, body, logs, ...rest } = data;

  const summary = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(summary).length > 0) {
    printPrettyValue(summary, writeLine);
  }

  if (Array.isArray(validation_errors) && validation_errors.length > 0) {
    if (Object.keys(summary).length > 0) writeLine();
    printValidationErrors(validation_errors, writeLine);
  }

  if (Array.isArray(logs) && logs.length > 0) {
    writeLine();
    writeLine(colors.bold("Logs"));
    if (options.showLogs) {
      printLogs(logs, writeLine, 1);
    } else {
      writeLine(
        `  ${colors.dim(`${logs.length} log entries hidden. Re-run with --logs to show them.`)}`,
      );
    }
  }

  if (body !== undefined && options.showBody) {
    writeLine();
    writeLine(colors.bold("Response body"));
    printPrettyValue(body, writeLine, 1);
  }
}

function printPretty(
  data: unknown,
  options: OutputOptions,
  writeLine: (line?: string) => void,
): void {
  if (options.view === "error" && isRecord(data)) {
    printErrorDetails(data, options, writeLine);
    return;
  }

  if ((options.view === "run" || options.view === "status") && isRecord(data)) {
    printJobView(data, options, writeLine);
    return;
  }

  printPrettyValue(data, writeLine);
}

export function output(data: unknown, options: OutputOptions = {}): void {
  if (isJsonOutput()) {
    writeStdout(JSON.stringify(data, null, 2));
    return;
  }

  printPretty(data, options, writeStdout);
}

export function outputRawJson(data: unknown): void {
  writeStdout(JSON.stringify(data, null, 2));
}

export function error(
  message: string,
  details?: unknown,
  options: OutputOptions = {},
): never {
  if (isJsonOutput()) {
    writeStderr(
      JSON.stringify(
        { error: message, ...(details ? { details } : {}) },
        null,
        2,
      ),
    );
  } else {
    writeStderr(`${colors.red(symbols.error)} ${colors.red(message)}`);
    if (details !== undefined) {
      writeStderr();
      printPretty(
        details,
        { ...options, view: "error", showLogs: true },
        writeStderr,
      );
    }
  }

  process.exit(1);
}
