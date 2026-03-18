import { defineCommand } from "citty";
import {
  CONFIG_DIR,
  type FalgenConfig,
  loadConfig,
  type OutputFormat,
  saveConfig,
} from "../lib/config";
import { error } from "../lib/output";
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

function printLine(line = ""): void {
  process.stdout.write(`${line}\n`);
}

export default defineCommand({
  meta: {
    name: "setup",
    description: "Configure your fal.ai API key and preferences",
  },
  async run() {
    if (!hasInteractiveTerminal()) {
      error("`falgen setup` requires an interactive terminal.", {
        hint: "Set FAL_KEY in your shell profile, or run `falgen setup` from a terminal session.",
      });
    }

    const current = loadConfig();
    const currentFormat: OutputFormat = current.outputFormat ?? "auto";

    printLine();
    printLine(colors.bold("falgen setup"));
    printLine(colors.dim("Configure your local fal.ai defaults."));
    printLine();

    if (current.apiKey) {
      printLine(
        `${symbols.info} Current API key: ${maskSecret(current.apiKey)}`,
      );
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

      const config: FalgenConfig = {
        ...(apiKey ? { apiKey } : {}),
        outputFormat,
        autoLoadEnv,
      };

      saveConfig(config);

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
  },
});
