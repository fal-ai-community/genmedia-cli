# falgen

Agent-first CLI for fal.ai — search, run, and manage 600+ generative AI models.

Designed for both humans and AI agents. In a terminal, commands default to a lightweight pretty view; when piped or called with `--json`, they emit structured JSON. No MCP required — any agent can use this via shell commands.

## Install

```bash
npx falgen --help
```

## Setup

```bash
falgen setup
```

Get your API key at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).

If you prefer environment-only setup:

```bash
export FAL_KEY=your_fal_api_key
```

`falgen setup` now lets you choose:

- `auto` — pretty in a TTY, JSON when piped
- `json` — always machine-readable
- `standard` — always human-readable

## Commands

```bash
falgen search "text to video"                    # Search 600+ models
falgen schema fal-ai/flux/dev                    # Get input/output params
falgen run fal-ai/flux/dev --prompt "a cat"      # Run any model
falgen run fal-ai/flux/dev --prompt "a cat" --logs
falgen run fal-ai/veo3.1 --prompt "..." --async  # Submit long job
falgen upload ./photo.jpg                        # Upload to CDN
falgen status fal-ai/flux/dev <req_id> --result  # Get job result
falgen status fal-ai/flux/dev <req_id> --logs    # Show recent logs
falgen pricing fal-ai/flux/dev                   # Check pricing
falgen models --category text-to-image           # Browse by category
falgen docs "how to use LoRA"                    # Search documentation
```

## Agent-first design

Agents can force structured JSON with:

```bash
falgen --help --json
```

For regular command output, use `--json` whenever you need machine-readable results, or pipe the command output to another tool.

This returns a machine-readable description of all commands, arguments, and options. Agents that don't support MCP (Codex, OpenClaw, Gemini CLI, etc.) can use fal.ai through `falgen`.

## License

MIT
