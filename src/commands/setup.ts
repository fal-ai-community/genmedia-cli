import { createInterface } from "node:readline/promises";
import { defineCommand } from "citty";
import {
  CONFIG_DIR,
  type FalgenConfig,
  type OutputFormat,
  loadConfig,
  saveConfig,
} from "../lib/config";

type Rl = ReturnType<typeof createInterface>;

async function ask(rl: Rl, question: string): Promise<string> {
  return rl.question(question);
}

async function confirm(rl: Rl, question: string): Promise<boolean> {
  const answer = await rl.question(`${question} [y/N] `);
  return answer.trim().toLowerCase() === "y";
}

export default defineCommand({
  meta: {
    name: "setup",
    description: "Configure your fal.ai API key and preferences",
  },
  async run() {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const current = loadConfig();

    console.log("\nfalgen setup\n");

    // --- API Key ---
    if (current.apiKey) {
      console.log(`Current API key: ${current.apiKey.slice(0, 8)}...`);
    } else {
      console.log("No API key configured.");
      console.log("Get one at: https://fal.ai/dashboard/keys\n");
    }

    const keyInput = await ask(
      rl,
      current.apiKey
        ? "Enter a new API key (or press Enter to keep the current one): "
        : "Enter your fal.ai API key (or press Enter to skip): ",
    );

    let apiKey = current.apiKey;
    const newKey = keyInput.trim();

    if (newKey) {
      console.log(
        "\nThe key will be encrypted and saved to this machine. This protects against",
      );
      console.log(
        "accidental exposure (backups, dotfile sync) but not against someone with",
      );
      console.log(
        "access to your user account. On shared computers, use FAL_KEY env var instead.\n",
      );

      const save = await confirm(
        rl,
        "Save the API key to this machine's config?",
      );
      if (save) {
        apiKey = newKey;
      } else {
        console.log(
          "\nKey not saved. Set FAL_KEY in your shell profile to use it:\n",
        );
        console.log(`  export FAL_KEY="${newKey.slice(0, 8)}..."\n`);
        apiKey = current.apiKey; // keep previous, don't overwrite
      }
    } else if (!current.apiKey) {
      console.log(
        "\nNo API key provided. Other commands won't work until you set one.",
      );
      console.log("Get your key at: https://fal.ai/dashboard/keys");
      console.log("Run `falgen setup` again once you have it.\n");
    }

    // --- Auto-load .env ---
    const currentAutoLoad = current.autoLoadEnv ?? false;
    console.log("\nAuto-load .env file:");
    console.log(
      "  Reads FAL_KEY (and other vars) from a .env file in the current directory.",
    );
    console.log(
      "  Useful for project-specific keys. Shell env vars always take precedence.\n",
    );

    const autoLoadInput = await ask(
      rl,
      `Auto-load .env from project directory? [y/n] (current: ${currentAutoLoad ? "yes" : "no"}): `,
    );

    let autoLoadEnv = currentAutoLoad;
    const autoLoadTrimmed = autoLoadInput.trim().toLowerCase();
    if (autoLoadTrimmed === "y" || autoLoadTrimmed === "yes") {
      autoLoadEnv = true;
    } else if (autoLoadTrimmed === "n" || autoLoadTrimmed === "no") {
      autoLoadEnv = false;
    }

    // --- Output format ---
    const currentFormat = current.outputFormat ?? "json";
    console.log("\nOutput format:");
    console.log(
      "  json     — structured JSON (default, best for agents and scripts)",
    );
    console.log("  standard — human-readable text");

    const formatInput = await ask(
      rl,
      `Choose output format [json/standard] (current: ${currentFormat}): `,
    );

    let outputFormat: OutputFormat = currentFormat;
    const trimmed = formatInput.trim().toLowerCase();
    if (trimmed === "json" || trimmed === "standard") {
      outputFormat = trimmed as OutputFormat;
    }

    rl.close();

    const config: FalgenConfig = {
      ...(apiKey ? { apiKey } : {}),
      outputFormat,
      autoLoadEnv,
    };

    saveConfig(config);

    console.log(`\nConfiguration saved to ${CONFIG_DIR}/config.json\n`);
    if (apiKey) {
      console.log(`  API key:       ${apiKey.slice(0, 8)}...`);
    }
    console.log(`  Output format: ${outputFormat}`);
    console.log(`  Auto-load .env: ${autoLoadEnv ? "yes" : "no"}`);
    console.log();
  },
});
