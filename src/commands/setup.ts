import { defineCommand } from "citty";
import { displayName, runLoginFlow } from "../lib/auth/flow";
import { clearSession } from "../lib/auth/session";
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
const AUTH_MODES = ["session", "key", "skip"] as const;
type AuthMode = (typeof AUTH_MODES)[number];

function printLine(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function summaryPayload(config: GenmediaConfig) {
  return {
    ok: true,
    configPath: `${CONFIG_DIR}/config.json`,
    apiKey: config.apiKey ? maskSecret(config.apiKey) : null,
    session: config.session
      ? {
          user: config.session.user,
          expires_at: config.session.expires_at,
        }
      : null,
    outputFormat: config.outputFormat ?? "auto",
    autoLoadEnv: Boolean(config.autoLoadEnv),
    autoUpdate: Boolean(config.autoUpdate),
  };
}

export default defineCommand({
  meta: {
    name: "setup",
    description:
      "Configure your fal.ai sign-in or API key and CLI preferences (use --non-interactive for agents/CI)",
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
    "auth-mode": {
      type: "string",
      description:
        "Preferred auth mode: session (sign in via `genmedia auth login`), key (use API key), or skip.",
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
    ...(current.session ? { session: current.session } : {}),
    outputFormat: current.outputFormat,
    autoLoadEnv: current.autoLoadEnv,
    autoUpdate: current.autoUpdate,
    lastUpdateCheckAt: current.lastUpdateCheckAt,
    latestKnownVersion: current.latestKnownVersion,
  };

  const rawAuthMode = args["auth-mode"];
  if (typeof rawAuthMode === "string" && rawAuthMode.length > 0) {
    if (!AUTH_MODES.includes(rawAuthMode as AuthMode)) {
      error(`Invalid --auth-mode: ${rawAuthMode}`, {
        hint: `Expected one of: ${AUTH_MODES.join(", ")}`,
      });
    }
    if (rawAuthMode === "session") {
      printLine(
        `${symbols.info} Run \`genmedia auth login\` separately to complete browser sign-in.`,
      );
      printLine(
        "    Sign-in cannot run non-interactively (it needs to open a browser).",
      );
    }
    if (rawAuthMode === "skip") {
      delete next.apiKey;
    }
  }

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
  output(summaryPayload(next));
}

type IntegrationChoice =
  | "signin"
  | "keep-session"
  | "apikey"
  | "logout"
  | "skip";

async function promptIntegration(
  current: GenmediaConfig,
): Promise<IntegrationChoice> {
  const session = current.session;
  const apiKey = current.apiKey;

  if (session) {
    const name = displayName(session.user);
    printLine(`${symbols.info} Currently signed in as ${colors.bold(name)}.`);
    return promptSelect<IntegrationChoice>({
      message: "How would you like to authenticate?",
      choices: [
        {
          title: "Keep current session (recommended)",
          value: "keep-session",
          description: "Continue using your fal.ai account",
        },
        {
          title: "Sign in again",
          value: "signin",
          description: "Re-run the browser sign-in flow",
        },
        {
          title: "Switch to an API key",
          value: "apikey",
          description: "Sign out and use a key from fal.ai/dashboard/keys",
        },
        {
          title: "Sign out",
          value: "logout",
          description: "Clear the local session; rely on FAL_KEY at runtime",
        },
      ],
    });
  }

  if (apiKey) {
    printLine(
      `${symbols.info} Currently using saved API key ${colors.dim(`(${maskSecret(apiKey)})`)}.`,
    );
  } else {
    printLine(`${symbols.warning} No authentication configured yet.`);
  }

  return promptSelect<IntegrationChoice>({
    message: "How would you like to authenticate?",
    choices: [
      {
        title: "Sign in with fal.ai (recommended)",
        value: "signin",
        description:
          "Open your browser to authenticate with your fal.ai account",
      },
      {
        title: "Use an API key",
        value: "apikey",
        description: "Paste a key from fal.ai/dashboard/keys",
      },
      {
        title: "Skip for now",
        value: "skip",
        description: "Configure later or rely on FAL_KEY at runtime",
      },
    ],
  });
}

async function runInteractive(): Promise<void> {
  const current = loadConfig();
  const currentFormat: OutputFormat = current.outputFormat ?? "auto";

  printLine();
  printLine(colors.bold("genmedia setup"));
  printLine(colors.dim("Configure your local fal.ai defaults."));
  printLine();

  try {
    const choice = await promptIntegration(current);

    let apiKey: string | undefined = current.apiKey;
    let sessionCleared = false;

    if (choice === "signin") {
      printLine();
      const { session } = await runLoginFlow();
      apiKey = current.apiKey; // unchanged
      // After successful sign-in we clear any leftover api-key-only state
      // only if the user explicitly chose this path with no key — preserve
      // both so the user can fall back to FAL_KEY etc.
      void session;
    } else if (choice === "apikey") {
      if (current.session) {
        clearSession();
        sessionCleared = true;
      }
      apiKey = await runApiKeyPrompt(current);
    } else if (choice === "logout") {
      clearSession();
      sessionCleared = true;
      apiKey = undefined;
      printLine(`${colors.green(symbols.success)} Signed out.`);
    } else if (choice === "keep-session") {
      printLine(`${colors.dim("Session unchanged.")}`);
    } else {
      // skip
      printLine();
      printLine(`${symbols.info} No authentication configured.`);
      printLine(
        "    Other commands will require FAL_KEY or `genmedia auth login` until you set one.",
      );
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

    // Reload after possible session changes (login/logout) so we persist the
    // freshest session blob alongside the user's other choices.
    const refreshed = loadConfig();
    const finalSession = sessionCleared ? undefined : refreshed.session;

    const config: GenmediaConfig = {
      ...(apiKey ? { apiKey } : {}),
      ...(finalSession ? { session: finalSession } : {}),
      outputFormat,
      autoLoadEnv,
      autoUpdate,
      lastUpdateCheckAt: refreshed.lastUpdateCheckAt,
      latestKnownVersion: refreshed.latestKnownVersion,
    };

    saveConfig(config);

    printLine();
    printLine(
      `${colors.green(symbols.success)} Configuration saved to ${CONFIG_DIR}/config.json`,
    );
    if (config.session) {
      printLine(`  Signed in as: ${displayName(config.session.user)}`);
    } else if (apiKey) {
      printLine(`  API key: ${maskSecret(apiKey)}`);
    } else {
      printLine("  Authentication: not configured");
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

async function runApiKeyPrompt(
  current: GenmediaConfig,
): Promise<string | undefined> {
  printLine();
  if (current.apiKey) {
    printLine(`${symbols.info} Current API key: ${maskSecret(current.apiKey)}`);
  } else {
    printLine("    Get one at: https://fal.ai/dashboard/keys");
  }

  const keyInput = (
    await promptText({
      message: current.apiKey
        ? "Enter a new API key (leave blank to keep the current one)"
        : "Enter your fal.ai API key (leave blank to skip)",
      password: true,
    })
  ).trim();

  if (!keyInput) {
    if (!current.apiKey) {
      printLine();
      printLine(`${symbols.warning} No API key provided.`);
      printLine("    Other commands will require FAL_KEY until you set one.");
    }
    return current.apiKey;
  }

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

  if (saveKey) return keyInput;

  printLine();
  printLine(`${symbols.info} Key not saved locally.`);
  printLine(`    export FAL_KEY="${maskSecret(keyInput)}"`);
  return current.apiKey;
}
