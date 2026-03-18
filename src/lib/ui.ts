import { Chalk } from "chalk";
import ora from "ora";
import prompts from "prompts";

const decorationsEnabled =
  !("NO_COLOR" in process.env) && !("CI" in process.env);

export const colors = new Chalk({
  level: decorationsEnabled && process.stdout.isTTY ? 1 : 0,
});

export const symbols = {
  bullet: "-",
  info: "[i]",
  success: "[ok]",
  warning: "[!]",
  error: "[x]",
  prompt: ">",
};

export function hasInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function canRenderSpinner(): boolean {
  return (
    hasInteractiveTerminal() &&
    decorationsEnabled &&
    Boolean(process.stderr.isTTY)
  );
}

function writeToStderr(line = ""): void {
  process.stderr.write(`${line}\n`);
}

export interface SpinnerHandle {
  start(text?: string): void;
  update(text: string): void;
  log(line: string): void;
  succeed(text?: string): void;
  fail(text?: string): void;
  stop(): void;
}

export function createSpinner(initialText = ""): SpinnerHandle {
  if (canRenderSpinner()) {
    const spinner = ora({
      text: initialText,
      stream: process.stderr,
    });

    return {
      start(text = initialText) {
        spinner.text = text;
        spinner.start();
      },
      update(text) {
        spinner.text = text;
      },
      log(line) {
        const currentText = spinner.text;
        spinner.stop();
        writeToStderr(line);
        spinner.start(currentText);
      },
      succeed(text = spinner.text) {
        spinner.succeed(text);
      },
      fail(text = spinner.text) {
        spinner.fail(text);
      },
      stop() {
        spinner.stop();
      },
    };
  }

  let active = false;
  let lastText = initialText;

  const print = (prefix: string, text?: string) => {
    const message = text ?? lastText;
    if (!message) return;
    lastText = message;
    writeToStderr(`${prefix} ${message}`);
  };

  return {
    start(text = initialText) {
      active = true;
      print(symbols.info, text);
    },
    update(text) {
      if (!active || text === lastText) return;
      print(symbols.info, text);
    },
    log(line) {
      writeToStderr(line);
    },
    succeed(text = lastText) {
      print(symbols.success, text);
      active = false;
    },
    fail(text = lastText) {
      print(symbols.error, text);
      active = false;
    },
    stop() {
      active = false;
    },
  };
}

export class PromptCancelledError extends Error {
  constructor() {
    super("Prompt cancelled");
    this.name = "PromptCancelledError";
  }
}

type PromptOptions = {
  onCancel: () => never;
};

const promptOptions: PromptOptions = {
  onCancel: () => {
    throw new PromptCancelledError();
  },
};

export async function promptText({
  message,
  initial,
  password = false,
}: {
  message: string;
  initial?: string;
  password?: boolean;
}): Promise<string> {
  const response = await prompts(
    {
      type: password ? "password" : "text",
      name: "value",
      message,
      initial,
    },
    promptOptions,
  );

  return String(response.value ?? "");
}

export async function promptConfirm({
  message,
  initial = false,
}: {
  message: string;
  initial?: boolean;
}): Promise<boolean> {
  const response = await prompts(
    {
      type: "confirm",
      name: "value",
      message,
      initial,
    },
    promptOptions,
  );

  return Boolean(response.value);
}

export async function promptSelect<T extends string>({
  message,
  initial,
  choices,
}: {
  message: string;
  initial?: number;
  choices: SelectChoice<T>[];
}): Promise<T> {
  const response = await prompts(
    {
      type: "select",
      name: "value",
      message,
      initial,
      choices,
    },
    promptOptions,
  );

  return response.value as T;
}

export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return `${secret.slice(0, 4)}...`;
  return `${secret.slice(0, 8)}...`;
}
interface SelectChoice<T extends string> {
  description?: string;
  title: string;
  value: T;
}
