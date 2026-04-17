import { defineCommand, renderUsage, runMain } from "citty";
import { renderBanner } from "./lib/banner";
import { loadDotEnv } from "./lib/env";
import { output } from "./lib/output";
import {
  maybeTriggerBackgroundUpdate,
  preSwapPendingUpdate,
  runBackgroundUpdateCheck,
} from "./lib/updater";
import { VERSION } from "./lib/version";

preSwapPendingUpdate();

// Internal entrypoint used by the background auto-update subprocess.
// Never exposed to citty or the JSON help schema.
if (process.argv[2] === "__update-check") {
  runBackgroundUpdateCheck().finally(() => process.exit(0));
} else {
  startCli();
}

function startCli(): void {
  loadDotEnv();
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
          "Your fal.ai API key. Can also be set via `genmedia setup`. Get one at https://fal.ai/dashboard/keys",
      },
      commands: {
        models: {
          description: "Search, list, and inspect fal.ai models",
          usage:
            "genmedia models [query] [--category <cat>] [--status <s>] [--limit <n>] [--cursor <token>] [--endpoint_id <id>] [--expand <field>]",
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
          description: "Run any model (waits for result)",
          usage: "genmedia run <endpoint_id> [--key value ...] [--logs]",
          args: "<endpoint_id>",
          options: {
            "--<key>": "Input parameter (e.g. --prompt 'a cat' --num_images 2)",
            "--async":
              "Submit to queue instead of waiting (returns request_id)",
            "--logs": "Stream logs in pretty terminal mode",
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
            "genmedia status <endpoint_id> <request_id> [--result] [--cancel] [--logs]",
          args: "<endpoint_id> <request_id>",
          options: {
            "--result": "Fetch the completed result",
            "--cancel": "Cancel the job",
            "--logs": "Show logs verbosely in pretty terminal mode",
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
          description: "Configure your fal.ai API key and preferences",
          usage: "genmedia setup",
        },
        init: {
          description:
            "Install the default genmedia skill bundle into the current project (alias for `skills install genmedia genmedia-ref`)",
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
            list: "List skills available in the registry",
            install: "genmedia skills install <name> [--force]",
            update: "genmedia skills update [<name>]",
            remove: "genmedia skills remove <name>",
          },
          env: {
            GENMEDIA_SKILLS_URL:
              "Override the registry base URL (default: https://raw.githubusercontent.com/fal-ai-community/genmedia-cli/refs/heads/main/skills)",
            GENMEDIA_AGENT_LINKS:
              "Comma-separated list of agent skill dirs to symlink into (default: .claude/skills)",
          },
        },
      },
    });
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
      run: () => import("./commands/run").then((m) => m.default),
      status: () => import("./commands/status").then((m) => m.default),
      upload: () => import("./commands/upload").then((m) => m.default),
      pricing: () => import("./commands/pricing").then((m) => m.default),
      docs: () => import("./commands/docs").then((m) => m.default),
      version: () => import("./commands/version").then((m) => m.default),
      update: () => import("./commands/update").then((m) => m.default),
    },
  });

  runMain(main, {
    showUsage: async (cmd, parent) => {
      if (process.stdout.isTTY) {
        console.log(renderBanner(VERSION, "small"));
      }
      console.log(`${await renderUsage(cmd, parent)}\n`);
    },
  });
}
