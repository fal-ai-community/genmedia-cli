# genmedia

Agent-first CLI for fal.ai — search, run, and manage 1200+ model endpoints.

Works great for humans in a terminal and equally well for AI agents via shell commands. In a TTY, commands display a lightweight pretty view; when piped or called with `--json`, they emit structured JSON. No MCP required.

## Install

For Linux and macOS:

```bash
curl https://genmedia.sh/install -fsS | bash
```

For Windows:

```bash
irm https://genmedia.sh/install.ps1 | iex
```

## Setup

```bash
genmedia setup
```

Interactive wizard that configures:

- **API key** — saved encrypted to your local config (or skip and use `FAL_KEY` in your environment)
- **Auto-load `.env`** — automatically load `FAL_KEY` and related vars from a project `.env` file
- **Output mode** — `auto` (pretty in TTY, JSON when piped), `json` (always structured), or `standard` (always human-readable)
- **Automatic updates** — check for new versions in the background and swap in on next launch (default: on; set `GENMEDIA_NO_UPDATE=1` to disable)

Get your API key at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).

To skip the wizard, set the key in your environment:

```bash
export FAL_KEY=your_fal_api_key
```

### Non-interactive setup (agents / CI)

```bash
genmedia setup --non-interactive --api-key "$FAL_KEY"
genmedia setup --non-interactive --output-format json --no-auto-load-env --auto-update
```

Every flag is optional — fields you don't pass keep their current values, so repeated invocations are idempotent.

| Flag | Description |
|---|---|
| `--non-interactive`, `-y` | Skip all prompts. Required when there is no TTY. |
| `--api-key <key>` | API key to save. Pass `""` to clear the saved key. |
| `--no-save-key` | With `--api-key`, don't persist the key to `config.json` (use `FAL_KEY` at runtime instead). |
| `--output-format <auto\|json\|standard>` | Default output mode. |
| `--auto-load-env` / `--no-auto-load-env` | Toggle auto-loading `FAL_KEY` from a project `.env`. |
| `--auto-update` / `--no-auto-update` | Toggle background update checks. |

## Commands

### `models` — Search and inspect models

```bash
genmedia models "text to video"
genmedia models "flux" --category text-to-image
genmedia models --category text-to-speech --limit 5
genmedia models --status all                                      # include deprecated
genmedia models --endpoint_id fal-ai/flux/dev,fal-ai/flux/schnell # fetch specific models
genmedia models --endpoint_id fal-ai/flux/dev --expand openapi-3.0
genmedia models "flux" --cursor <token>                           # next page
```

| Option | Description |
|---|---|
| `--category` | Filter by category (e.g. `text-to-image`, `image-to-video`, `text-to-speech`) |
| `--status` | `active` (default), `deprecated`, or `all` |
| `--limit` | Max results (default: 20) |
| `--cursor` | Pagination cursor from a previous response |
| `--endpoint_id` | Fetch specific model(s) by ID — comma-separated or repeated |
| `--expand` | Expand additional fields: `openapi-3.0`, `enterprise_status` |

### `schema` — Inspect model inputs/outputs

```bash
genmedia schema fal-ai/flux/dev
genmedia schema fal-ai/flux/dev --format openapi
```

| Option | Description |
|---|---|
| `--format` | `compact` (default) or `openapi` — returns full OpenAPI JSON |

### `run` — Run a model

```bash
genmedia run fal-ai/flux/dev --prompt "a cat on the moon"
genmedia run fal-ai/flux/dev --prompt "a cat" --num_images 2
genmedia run fal-ai/flux/dev --prompt "a cat" --logs
genmedia run fal-ai/veo3.1 --prompt "a dog running" --async
genmedia run fal-ai/flux/dev --prompt "a cat" --download                               # save to cwd with source file names
genmedia run fal-ai/flux/dev --prompt "a cat" --num_images 3 --download "./out/{index}.{ext}"
genmedia run fal-ai/flux/dev --help    # introspect model inputs as CLI help
```

Any model input parameter can be passed as a `--flag value` pair. Run `genmedia run <endpoint_id> --help` to see a model's accepted parameters rendered as CLI flags, or `genmedia schema <endpoint_id>` for the same info as structured JSON.

| Option | Description |
|---|---|
| `--<param>` | Any model input parameter (e.g. `--prompt`, `--num_images`) |
| `--logs` | Stream logs while the model runs (pretty terminal mode only) |
| `--async` | Submit to queue without waiting — returns a `request_id` |
| `--download [template]` | Download every media URL in the result. Optional value is a path or filename template with `{index}`, `{name}`, `{ext}`, `{request_id}` placeholders. Omitted → cwd with source file names. Trailing `/` or an existing directory → dir + source file names. Plain filename with multiple outputs → `_1`, `_2` suffixes on collision. Downloaded paths appear in JSON output under `downloaded_files`. |

### `status` — Check an async job

```bash
genmedia status fal-ai/veo3.1 <request_id>
genmedia status fal-ai/veo3.1 <request_id> --result
genmedia status fal-ai/veo3.1 <request_id> --logs
genmedia status fal-ai/veo3.1 <request_id> --cancel
genmedia status fal-ai/veo3.1 <request_id> --download ./out/   # implies --result
```

| Option | Description |
|---|---|
| `--result` | Fetch the completed result |
| `--logs` | Show logs verbosely |
| `--cancel` | Cancel the queued job |
| `--download [template]` | Same as on `run`. Implies `--result` — fetches the completed result and writes media files to disk. |

### `upload` — Upload files to fal.ai CDN

```bash
genmedia upload ./photo.jpg
genmedia upload https://example.com/image.png
```

Accepts a local file path or a remote URL. Returns a CDN URL you can use as model input.

### `pricing` — Check model pricing

```bash
genmedia pricing fal-ai/flux/dev
```

### `docs` — Search documentation

```bash
genmedia docs "how to use LoRA"
genmedia docs "webhook callbacks"
```

Searches fal.ai documentation, guides, and API references.

### `version` — Show version

```bash
genmedia version
```

Shows the current version and flags any known update (populated by the background checker).

### `gallery` — Browse a per-session HTML preview of generated assets

Every successful `genmedia run` (and `genmedia status --download`) records its outputs into a per-session, self-contained static HTML page under `~/.genmedia/gallery/sessions/<session_id>/index.html`. The page aggregates every image / video / audio / 3D asset produced inside one agent session — across many runs and many endpoints — into a filterable grid with a lightbox view. No server, no dependencies, opens straight from `file://`.

```bash
genmedia gallery                          # pretty TTY: prints `→ Open: <url>`. JSON / non-TTY: full info payload.
genmedia gallery --json                   # structured info payload, agent-safe
genmedia gallery info                     # full info payload, even from a TTY (devs)
genmedia gallery open                     # open the all-sessions index in the default browser
genmedia gallery open current             # open the current session
genmedia gallery open latest              # open the most-recently recorded session (works across shells)
genmedia gallery open <session_id>        # open a specific session
genmedia gallery open latest --print      # resolve path/url without launching the browser
genmedia gallery list                     # list every recorded session (newest first, JSON-friendly)
genmedia gallery list --limit 10          # cap the list (default: 50)
genmedia gallery rename --label "demo run"        # rename the current session (cosmetic — id stays the same)
genmedia gallery rename latest --label "x"        # rename the most-recent session
genmedia gallery rename <session_id> --clear      # remove a session's label
genmedia gallery clear --yes              # delete the current session (--yes is required)
genmedia gallery clear latest --yes       # delete the most-recently recorded session
genmedia gallery clear <session_id> --yes # delete a specific session
genmedia gallery clear all --yes          # delete every recorded session
```

The page auto-refreshes via a tiny client-side poll on `./data.json` while a session is "live" (updated in the last 5 min), so new runs land in the open tab without a manual reload.

> `gallery clear` always requires `--yes` and never prompts interactively — same shape for agents and humans. `GENMEDIA_NO_GALLERY=1` only disables *recording*; `list` / `open` / `clear` still work so you can inspect or purge prior galleries.

The `run` and `status --download` responses include the gallery info too:

```json
{
  "status": "completed",
  "endpoint_id": "fal-ai/flux/dev",
  "request_id": "…",
  "gallery": {
    "session_id": "a1b2c3d4e5f6",
    "path": "/Users/you/.genmedia/gallery/sessions/a1b2c3d4e5f6/index.html",
    "url": "file:///Users/you/.genmedia/gallery/sessions/a1b2c3d4e5f6/index.html"
  }
}
```

**Session detection (agent-agnostic).** The session id is resolved in this order, so the gallery groups outputs correctly across Claude Code, Codex, Cursor, Amp, Gemini, Aider, and anything else:

1. `GENMEDIA_SESSION_ID` — explicit override (e.g. set from a hook script).
2. Per-agent env vars: `CODEX_THREAD_ID`, `CLAUDE_SESSION_ID`, `AMP_THREAD_ID`, `CURSOR_TRACE_ID`.
3. **Process-tree walk** — looks for a known agent binary (claude, codex, cursor, amp, gemini, copilot, opencode, aider, cline) in the ancestor chain via `ps -e`. Critical for Claude Code, whose `Bash` tool spawns a fresh shell per call: `process.ppid` changes every invocation, but the Claude process itself lives for the whole conversation and becomes the stable anchor.
4. Terminal-level: `TERM_SESSION_ID` / `ITERM_SESSION_ID` / `WT_SESSION` / `TMUX_PANE`.
5. Fallback: a deterministic hash of `<agent>:<ppid>`.

| Env var | Description |
|---|---|
| `GENMEDIA_NO_GALLERY=1` | Disable gallery recording and rendering entirely. |
| `GENMEDIA_SESSION_ID=<anchor>` | Force a specific session id (any string; it's hashed into the on-disk slug). |
| `GENMEDIA_GALLERY_RETENTION_DAYS=<n>` | Prune session directories older than `n` days (default: 60). |

### `update` — Check for and apply updates

```bash
genmedia update              # download and swap in the latest release
genmedia update --check      # only check, don't download
genmedia update --force      # reinstall even if already on the latest
```

| Option | Description |
|---|---|
| `--check` | Only check for a newer version; don't download |
| `--force` | Re-download and reinstall even if already on the latest |

When automatic updates are enabled (default), every TTY invocation may trigger a rate-limited (1/hour) background check that stages the next release. The next `genmedia` launch atomically swaps it in. Set `GENMEDIA_NO_UPDATE=1` to disable all background checks; the manual `update` command still works.

## Analytics

Released binaries report anonymous usage analytics (PostHog) to help us prioritize improvements. Each install gets a random UUID stored in `~/.genmedia/config.json`; we never collect command arguments, prompts, file paths, API keys, or error messages.

**Events:**

- `command_run` — top-level command name, success/failure, duration
- `cli_first_run` — fired once when the install is first seen
- `setup_completed` — `setup` finished successfully
- `model_run` — `run` finished, with the model endpoint, success/failure, and duration (no inputs or outputs)
- `skills_searched` — `skills list [query]` — the query string and result count
- `skills_installed` / `skills_updated` / `skills_removed` — skill name and status
- `update_applied` — self-update succeeded, with from/to versions

**Caller context:** every event also carries the detected calling agent (e.g. `claude-code`, `codex`, `cursor-agent`, `gemini-cli`, `aider`), the host terminal (`vscode`, `iterm`, `warp`, …), CI flags (`ci`, `ci_provider`, `github_actions`), TTY status, and a per-process `invocation_id` so multiple events from the same CLI run can be stitched together. Detection is env-var based and never collects user content. Set `GENMEDIA_USER_AGENT=<name>` to override or self-attribute when running inside an agent we don't yet detect.

**Opt out:**

```bash
export GENMEDIA_NO_ANALYTICS=1            # per-shell
# or persist in config:
genmedia setup    # (toggle is currently file-only — set "analyticsOptOut": true)
```

Builds from source without a `POSTHOG_KEY` environment variable (the open-source default) report nothing — the analytics module no-ops at runtime.

### `init` — Install the default genmedia skill bundle

```bash
genmedia init
genmedia init --force   # overwrite existing files
```

Installs the default genmedia skill bundle:

| Skill | Purpose |
|---|---|
| `genmedia` | Guided workflow for model discovery, schema inspection, and execution |

The bundle is installed into `.agents/skills/` if the project has a `.agents/` directory, otherwise into `.claude/skills/`. If neither directory exists, the command exits with a message asking you to create one and try again.

After running `init`, compatible agent sessions in that project can use the installed skills without needing to call `--help`. Commit the installed skills directory so teammates and other agents get the same context.

### `skills` — Manage installed agent skills

```bash
genmedia skills list                  # list everything in the registry
genmedia skills list image            # full-text search name + description
genmedia skills install genmedia
genmedia skills update
genmedia skills remove genmedia
```

Installs, updates, lists, and removes agent skills from the genmedia registry. `skills list <query>` runs full-text search via the hosted index API (`GENMEDIA_SKILLS_API_URL`, default `https://genmedia.sh/skills`); the no-query form fetches `index.json` directly from the registry.

## Agent-first design

All commands output structured JSON when piped or called with `--json`:

```bash
genmedia run fal-ai/flux/dev --prompt "a cat" --json
genmedia models "text to video" --json | jq '.models[]'
```

To get a machine-readable description of all commands for use in a system prompt or agent context:

```bash
genmedia --help --json
```

This returns a full schema of every command, its arguments, and options. Agents that don't support MCP (Codex, Gemini CLI, etc.) can use fal.ai through `genmedia` via standard shell commands.

## License

MIT
