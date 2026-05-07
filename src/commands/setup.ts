import { defineCommand } from "citty";
import { track } from "../lib/analytics";
import {
  CONFIG_DIR,
  type GenmediaConfig,
  loadConfig,
  type OutputFormat,
  saveConfig,
} from "../lib/config";
import { error, output } from "../lib/output";
import {
  colors,
  hasInteractiveTerminal,
  maskSecret,
  PromptCancelledError,
  promptConfirm,
  promptSelect,
  promptText,
  symbols,
} from "../lib/ui";

const OUTPUT_FORMATS: readonly OutputFormat[] = ["auto", "json", "standard"];

function printLine(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function summaryPayload(config: GenmediaConfig) {
  return {
    ok: true,
    configPath: `${CONFIG_DIR}/config.json`,
    apiKey: config.apiKey ? maskSecret(config.apiKey) : null,
    outputFormat: config.outputFormat ?? "auto",
    autoLoadEnv: Boolean(config.autoLoadEnv),
    autoUpdate: Boolean(config.autoUpdate),
  };
}

export default defineCommand({
  meta: {
    name: "setup",
    description:
      "Configure your fal.ai API key and preferences (use --non-interactive for agents/CI)",
  },
  args: {
    "non-interactive": {
      type: "boolean",
      alias: "y",
      description:
        "Skip all prompts. Required to run without a TTY. Fields not provided keep their current values.",
    },
    "api-key": {
      type: "string",
      description:
        "API key to save (use an empty string to clear). Only applied with --non-interactive.",
    },
    "save-key": {
      type: "boolean",
      description:
        "Persist --api-key to the local config (default). Use --no-save-key to keep the key out of config.json.",
    },
    "output-format": {
      type: "string",
      description: "Default output mode: auto, json, or standard.",
    },
    "auto-load-env": {
      type: "boolean",
      description:
        "Auto-load FAL_KEY and related vars from a local .env. Use --no-auto-load-env to disable.",
    },
    "auto-update": {
      type: "boolean",
      description:
        "Enable background update checks. Use --no-auto-update to disable.",
    },
  },
  async run({ args }) {
    const nonInteractive = Boolean(args["non-interactive"]);

    if (nonInteractive) {
      await runNonInteractive(args);
      return;
    }

    if (!hasInteractiveTerminal()) {
      error("`genmedia setup` requires an interactive terminal.", {
        hint: 'For agents/CI, re-run with --non-interactive and flags, e.g.\n  genmedia setup --non-interactive --api-key "$FAL_KEY"\nOr set FAL_KEY in your shell profile and run `genmedia setup` from a terminal session.',
      });
    }

    await runInteractive();
  },
});

async function runNonInteractive(args: Record<string, unknown>): Promise<void> {
  const current = loadConfig();
  const next: GenmediaConfig = {
    ...(current.apiKey ? { apiKey: current.apiKey } : {}),
    outputFormat: current.outputFormat,
    autoLoadEnv: current.autoLoadEnv,
    autoUpdate: current.autoUpdate,
    lastUpdateCheckAt: current.lastUpdateCheckAt,
    latestKnownVersion: current.latestKnownVersion,
  };

  const rawApiKey = args["api-key"];
  if (typeof rawApiKey === "string") {
    const trimmed = rawApiKey.trim();
    const saveKey = args["save-key"] !== false;
    if (trimmed === "") {
      delete next.apiKey;
    } else if (saveKey) {
      next.apiKey = trimmed;
    } else {
      delete next.apiKey;
    }
  }

  const rawFormat = args["output-format"];
  if (typeof rawFormat === "string" && rawFormat.length > 0) {
    if (!OUTPUT_FORMATS.includes(rawFormat as OutputFormat)) {
      error(`Invalid --output-format: ${rawFormat}`, {
        hint: `Expected one of: ${OUTPUT_FORMATS.join(", ")}`,
      });
    }
    next.outputFormat = rawFormat as OutputFormat;
  }

  if (typeof args["auto-load-env"] === "boolean") {
    next.autoLoadEnv = args["auto-load-env"];
  }
  if (typeof args["auto-update"] === "boolean") {
    next.autoUpdate = args["auto-update"];
  }

  saveConfig(next);
  track("setup_completed", { interactive: false });
  output(summaryPayload(next));
}

async function runInteractive(): Promise<void> {
  const current = loadConfig();
  const currentFormat: OutputFormat = current.outputFormat ?? "auto";

  printLine();
  printLine(colors.bold("genmedia setup"));
  printLine(colors.dim("Configure your local fal.ai defaults."));
  printLine();

  if (current.apiKey) {
    printLine(`${symbols.info} Current API key: ${maskSecret(current.apiKey)}`);
  } else {
    printLine(`${symbols.warning} No API key configured yet.`);
    printLine("    Get one at: https://fal.ai/dashboard/keys");
  }

  try {
    const keyInput = (
      await promptText({
        message: current.apiKey
          ? "Enter a new API key (leave blank to keep the current one)"
          : "Enter your fal.ai API key (leave blank to skip)",
        password: true,
      })
    ).trim();

    let apiKey = current.apiKey;
    if (keyInput) {
      printLine();
      printLine(colors.bold("Local key storage"));
      printLine(
        "  Your key is encrypted on this machine. For shared computers, prefer",
      );
      printLine("  setting FAL_KEY in the environment instead.");

      const saveKey = await promptConfirm({
        message: "Save the API key to this machine's config?",
        initial: true,
      });

      if (saveKey) {
        apiKey = keyInput;
      } else {
        printLine();
        printLine(`${symbols.info} Key not saved locally.`);
        printLine(`    export FAL_KEY="${maskSecret(keyInput)}"`);
        apiKey = current.apiKey;
      }
    } else if (!current.apiKey) {
      printLine();
      printLine(`${symbols.warning} No API key provided.`);
      printLine("    Other commands will require FAL_KEY until you set one.");
    }

    printLine();
    printLine(colors.bold("Project environment loading"));
    printLine(
      "  Auto-load FAL_KEY and related variables from a local .env file.",
    );
    printLine("  Shell environment variables still take precedence.");

    const autoLoadEnv = await promptConfirm({
      message: "Auto-load .env from the current project directory?",
      initial: current.autoLoadEnv ?? false,
    });

    printLine();
    printLine(colors.bold("Automatic updates"));
    printLine(
      "  Check for new versions in the background and swap in on next launch.",
    );
    printLine("  Disable with GENMEDIA_NO_UPDATE=1 or by answering no below.");

    const autoUpdate = await promptConfirm({
      message: "Enable automatic updates?",
      initial: current.autoUpdate ?? true,
    });

    printLine();
    printLine(colors.bold("Default output mode"));
    printLine("  auto     Pretty in a TTY, JSON when piped.");
    printLine("  json     Always structured output.");
    printLine("  standard Always human-readable text.");

    const formatOrder: OutputFormat[] = ["auto", "json", "standard"];
    const outputFormat = await promptSelect<OutputFormat>({
      message: "Choose the default output mode",
      initial: Math.max(formatOrder.indexOf(currentFormat), 0),
      choices: [
        {
          title: "auto",
          description: "Pretty in a TTY, JSON when piped",
          value: "auto",
        },
        {
          title: "json",
          description: "Always emit machine-readable JSON",
          value: "json",
        },
        {
          title: "standard",
          description: "Always emit human-readable text",
          value: "standard",
        },
      ],
    });

    const config: GenmediaConfig = {
      ...(apiKey ? { apiKey } : {}),
      outputFormat,
      autoLoadEnv,
      autoUpdate,
      lastUpdateCheckAt: current.lastUpdateCheckAt,
      latestKnownVersion: current.latestKnownVersion,
    };

    saveConfig(config);
    track("setup_completed", { interactive: true });

    printLine();
    printLine(
      `${colors.green(symbols.success)} Configuration saved to ${CONFIG_DIR}/config.json`,
    );
    if (apiKey) {
      printLine(`  API key: ${maskSecret(apiKey)}`);
    } else {
      printLine("  API key: not saved");
    }
    printLine(`  Output mode: ${outputFormat}`);
    printLine(`  Auto-load .env: ${autoLoadEnv ? "yes" : "no"}`);
    printLine(`  Automatic updates: ${autoUpdate ? "yes" : "no"}`);
    printLine();
  } catch (setupError) {
    if (setupError instanceof PromptCancelledError) {
      printLine();
      printLine(`${symbols.warning} Setup cancelled. No changes saved.`);
      printLine();
      return;
    }

    throw setupError;
  }
}
