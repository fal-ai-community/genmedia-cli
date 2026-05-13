import { type CommandDef, defineCommand, renderUsage, runMain } from "citty";
import { initAnalytics, shutdownAnalytics, track } from "./lib/analytics";
import { renderBanner } from "./lib/banner";
import { loadConfig } from "./lib/config";
import { loadDotEnv } from "./lib/env";
import { isJsonOutput, output, outputRawJson } from "./lib/output";
import {
  buildDynamicRunCommand,
  isDynamicRunCommand,
  renderDynamicRunUsage,
  renderDynamicRunUsageJson,
} from "./lib/run-help";
import {
  maybeTriggerBackgroundUpdate,
  preSwapPendingUpdate,
  runBackgroundUpdateCheck,
} from "./lib/updater";
import { VERSION } from "./lib/version";

const KNOWN_COMMANDS = new Set([
  "setup",
  "init",
  "skills",
  "models",
  "schema",
  "run",
  "status",
  "upload",
  "pricing",
  "docs",
  "version",
  "update",
]);

function sanitizeCommandName(arg: string | undefined): string {
  if (!arg) return "(root)";
  if (arg === "--help" || arg === "-h") return "(help)";
  if (arg === "--version") return "version";
  if (arg === "--json") return "(root)";
  if (KNOWN_COMMANDS.has(arg)) return arg;
  return "(unknown)";
}

preSwapPendingUpdate();

// Internal entrypoint used by the background auto-update subprocess.
// Never exposed to citty or the JSON help schema.
if (process.argv[2] === "__update-check") {
  runBackgroundUpdateCheck().finally(() => process.exit(0));
} else {
  void startCli();
}

async function startCli(): Promise<void> {
  loadDotEnv();
  initAnalytics();
  maybeTriggerBackgroundUpdate();

  // JSON help schema for agents — output before citty intercepts --help
  if (
    process.argv.includes("--json") &&
    !process.argv.slice(2).find((a) => !a.startsWith("-"))
  ) {
    output({
      name: "genmedia",
      version: VERSION,
      description:
        "Agent-first CLI for fal.ai — search, run, and manage 600+ generative AI models",
      install: "curl https://genmedia.sh/install -fsS | bash",
      env: {
        FAL_KEY:
          "Your fal.ai API key. Can also be set via `genmedia setup` (interactive) or `genmedia setup --non-interactive --api-key <key>` (for agents/CI). Get one at https://fal.ai/dashboard/keys",
        GENMEDIA_NO_ANALYTICS:
          "Set to 1 to disable anonymous usage analytics (also configurable via `analyticsOptOut: true` in ~/.genmedia/config.json)",
      },
      commands: {
        models: {
          description: "Search, list, and inspect fal.ai models",
          usage:
            "genmedia models [query] [--category <cat>] [--status <s>] [--limit <n>] [--cursor <token>] [--endpoint_id <id>] [--expand <field>] [--no-classify]",
          args: "[query]",
          options: {
            "--category":
              "Filter by category (text-to-image, image-to-video, text-to-video, text-to-speech, etc.)",
            "--status":
              "Filter by status: active (default), deprecated, or all",
            "--limit": "Max results (default: 20)",
            "--cursor": "Pagination cursor from a previous response",
            "--endpoint_id":
              "Specific endpoint ID(s). Repeat the flag or pass comma-separated values",
            "--expand": "Expand fields: openapi-3.0, enterprise_status",
            "--no-classify":
              "Skip auto-inference of --category from the query (default: on when --category is not set)",
          },
        },
        schema: {
          description: "Get model schema in compact or OpenAPI format",
          usage: "genmedia schema <endpoint_id> [--format <compact|openapi>]",
          args: "<endpoint_id>",
          options: {
            "--format": "Schema format: compact (default) or openapi",
          },
        },
        run: {
          description:
            "Run any model. Pass an endpoint ID, or a prompt for smart routing.",
          usage:
            'genmedia run [<endpoint_id> | "<prompt>"] [--key value ...] [--logs] [--download [template]]',
          args: "[<endpoint_id> | <prompt>]",
          options: {
            "<endpoint_id>":
              "Endpoint ID (must contain '/', e.g. 'fal-ai/flux/dev')",
            "<prompt>":
              "Smart routing: a prompt without '/' (e.g. 'a cat on the moon') is classified by modality and routed to a sensible default endpoint. Override with an explicit endpoint ID.",
            "--<key>": "Input parameter (e.g. --prompt 'a cat' --num_images 2)",
            "--async":
              "Submit to queue instead of waiting (returns request_id)",
            "--logs": "Stream logs in pretty terminal mode",
            "--download":
              "Download media from the result. Optional value is a path or template with {index}, {name}, {ext}, {request_id} (defaults to cwd with source file names)",
            "--help":
              "Introspect the model and render its input schema as CLI help",
          },
        },
        upload: {
          description: "Upload a local file or URL to fal.ai CDN",
          usage: "genmedia upload <file_path_or_url>",
          args: "<file_path_or_url>",
        },
        status: {
          description: "Check job status or get result",
          usage:
            "genmedia status <endpoint_id> <request_id> [--result] [--cancel] [--logs] [--download [template]]",
          args: "<endpoint_id> <request_id>",
          options: {
            "--result": "Fetch the completed result",
            "--cancel": "Cancel the job",
            "--logs": "Show logs verbosely in pretty terminal mode",
            "--download":
              "Download media from the result (implies --result). Optional value is a path or template with {index}, {name}, {ext}, {request_id}",
          },
        },
        pricing: {
          description: "Get pricing information for a model",
          usage: "genmedia pricing <endpoint_id>",
          args: "<endpoint_id>",
        },
        docs: {
          description:
            "Search fal.ai documentation, guides, and API references",
          usage: "genmedia docs <query>",
          args: "<query>",
        },
        version: {
          description: "Show version and check for updates",
          usage: "genmedia version",
        },
        update: {
          description: "Check for and apply updates to the genmedia CLI",
          usage: "genmedia update [--check] [--force]",
          options: {
            "--check": "Only check for a newer version; don't download",
            "--force":
              "Re-download and reinstall even if already on the latest",
          },
          env: {
            GENMEDIA_NO_UPDATE:
              "Set to 1 to disable all automatic update checks (manual `update` still works)",
          },
        },
        setup: {
          description:
            "Configure your fal.ai API key and preferences (supports non-interactive mode for agents/CI)",
          usage:
            "genmedia setup [--non-interactive --api-key <key> --output-format <auto|json|standard> [--no-]auto-load-env [--no-]auto-update]",
          options: {
            "--non-interactive":
              "Skip all prompts. Required to run without a TTY. Alias: -y. Fields not passed keep their current values.",
            "--api-key":
              "API key to save when running with --non-interactive. Pass an empty string to clear the saved key.",
            "--no-save-key":
              "With --api-key, don't persist the key to config.json (use FAL_KEY at runtime instead).",
            "--output-format": "Default output mode: auto, json, or standard.",
            "--auto-load-env":
              "Auto-load FAL_KEY and related vars from a local .env. Use --no-auto-load-env to disable.",
            "--auto-update":
              "Enable background update checks. Use --no-auto-update to disable.",
          },
        },
        init: {
          description:
            "Install the default genmedia skill bundle into the current project (alias for `skills install genmedia`)",
          usage: "genmedia init [--force]",
          options: {
            "--force": "Reinstall skills even if already present",
          },
        },
        skills: {
          description:
            "Install, update, and list agent skills from the genmedia registry (installs under .agents/skills/, symlinked into .claude/skills/)",
          usage: "genmedia skills <list|install|update|remove> [args]",
          subcommands: {
            list: "genmedia skills list [<query>] — full-text search by name/description",
            install: "genmedia skills install <name> [--force]",
            update: "genmedia skills update [<name>]",
            remove: "genmedia skills remove <name>",
          },
          env: {
            GENMEDIA_SKILLS_URL:
              "Override the registry base URL (default: https://raw.githubusercontent.com/fal-ai-community/skills/refs/heads/main/skills)",
            GENMEDIA_SKILLS_API_URL:
              "Override the skills search API URL used by `skills list <query>` (default: https://genmedia.sh/skills)",
            GENMEDIA_AGENT_LINKS:
              "Comma-separated list of agent skill dirs to symlink into (default: .claude/skills)",
          },
        },
      },
    });
    track("command_run", { name: "(json-help)", ok: true, durationMs: 0 });
    await shutdownAnalytics();
    process.exit(0);
  }

  // Rewrite `--version` to `version` subcommand so we get the full banner
  if (process.argv.length === 3 && process.argv[2] === "--version") {
    process.argv[2] = "version";
  }

  const main = defineCommand({
    meta: {
      name: "genmedia",
      version: VERSION,
      description: "Agent-first CLI for fal.ai",
    },
    subCommands: {
      setup: () => import("./commands/setup").then((m) => m.default),
      init: () => import("./commands/init").then((m) => m.default),
      skills: () => import("./commands/skills/index").then((m) => m.default),
      models: () => import("./commands/models").then((m) => m.default),
      schema: () => import("./commands/schema").then((m) => m.default),
      run: async () => {
        const argv = process.argv.slice(2);
        if (argv[0] === "run" && argv.includes("--help")) {
          const endpointId = argv[1];
          // Only fetch a model schema for true endpoint IDs (which always
          // contain "/", e.g. fal-ai/flux/dev). A bare prompt like
          // `genmedia run "a cat" --help` falls through to static run help.
          if (
            endpointId &&
            !endpointId.startsWith("--") &&
            endpointId.includes("/")
          ) {
            const dynamic = await buildDynamicRunCommand(endpointId);
            if (dynamic) return dynamic;
          }
        }
        return (await import("./commands/run")).default;
      },
      status: () => import("./commands/status").then((m) => m.default),
      upload: () => import("./commands/upload").then((m) => m.default),
      pricing: () => import("./commands/pricing").then((m) => m.default),
      docs: () => import("./commands/docs").then((m) => m.default),
      version: () => import("./commands/version").then((m) => m.default),
      update: () => import("./commands/update").then((m) => m.default),
    },
  });

  const commandName = sanitizeCommandName(process.argv[2]);
  const commandStart = performance.now();
  let tracked = false;
  const fireCommandRun = (ok: boolean, errorClass?: string): void => {
    if (tracked) return;
    tracked = true;
    track("command_run", {
      name: commandName,
      ok,
      durationMs: Math.round(performance.now() - commandStart),
      ...(errorClass ? { errorClass } : {}),
    });
  };

  try {
    await runMain(main, {
      showUsage: async (cmd, parent) => {
        const anyCmd = cmd as CommandDef;
        const anyParent = parent as CommandDef | undefined;
        if (isDynamicRunCommand(anyCmd) && isJsonOutput()) {
          outputRawJson(await renderDynamicRunUsageJson(anyCmd, anyParent));
          return;
        }
        if (process.stdout.isTTY) {
          console.log(renderBanner(VERSION, "small"));
        }
        const usage = isDynamicRunCommand(anyCmd)
          ? await renderDynamicRunUsage(anyCmd, anyParent)
          : await renderUsage(cmd, parent);
        console.log(`${usage}\n`);

        if (!isJsonOutput() && !process.env.FAL_KEY && !loadConfig().apiKey) {
          console.log(
            "Tip: set FAL_KEY in your environment or run `genmedia setup` before using model commands.",
          );
          console.log(
            '     For agents/CI: `genmedia setup --non-interactive --api-key "$FAL_KEY"`.',
          );
          console.log();
        }
      },
    });
    fireCommandRun(true);
  } catch (err) {
    fireCommandRun(false, (err as Error)?.constructor?.name ?? "Error");
    throw err;
  } finally {
    await shutdownAnalytics();
  }
}
