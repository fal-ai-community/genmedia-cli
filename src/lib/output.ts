import { loadConfig } from "./config";

let _format: "json" | "standard" | null = null;

function getFormat(): "json" | "standard" {
  if (_format === null) {
    _format = process.argv.includes("--json")
      ? "json"
      : (loadConfig().outputFormat ?? "json");
  }
  return _format;
}

function printStandard(data: unknown, indent = 0): void {
  const pad = "  ".repeat(indent);
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === "object" && item !== null) {
        printStandard(item, indent);
        if (indent === 0) console.log();
      } else {
        console.log(`${pad}- ${item}`);
      }
    }
  } else if (typeof data === "object" && data !== null) {
    for (const [key, value] of Object.entries(
      data as Record<string, unknown>,
    )) {
      if (typeof value === "object" && value !== null) {
        console.log(`${pad}${key}:`);
        printStandard(value, indent + 1);
      } else {
        console.log(`${pad}${key}: ${value}`);
      }
    }
  } else {
    console.log(`${pad}${data}`);
  }
}

export function output(data: unknown): void {
  if (getFormat() === "standard") {
    printStandard(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function error(message: string, details?: unknown): never {
  if (getFormat() === "standard") {
    console.error(`Error: ${message}`);
    if (details !== undefined) {
      console.error("Details:");
      printStandard(details, 1);
    }
  } else {
    console.error(
      JSON.stringify(
        { error: message, ...(details ? { details } : {}) },
        null,
        2,
      ),
    );
  }
  process.exit(1);
}
