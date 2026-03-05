# fal CLI

Agent-first CLI for fal.ai — search, run, and manage 600+ generative AI models.

Designed for both humans and AI agents. All commands output structured JSON.

## Install

```bash
npm install -g @fal-ai/cli
```

Or use directly:

```bash
npx @fal-ai/cli search "text to video"
```

## Setup

```bash
export FAL_KEY=your_fal_api_key
```

Get your API key at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).

## Commands

### Search models

```bash
fal search "text to video"
fal search "upscale" --category image-to-image
fal search "flux" --limit 5
```

### Get model schema

```bash
fal schema fal-ai/flux/dev
```

Returns all input parameters and output fields for any model.

### Run a model

```bash
fal run fal-ai/flux/dev --prompt "a cat in space" --num_images 2
```

For long-running models (video, 3D), use async mode:

```bash
fal run fal-ai/kling-video/v2.6/pro/image-to-video --async --prompt "a cat walking" --image_url "https://..."
```

### Upload files

```bash
# Local file
fal upload ./photo.jpg

# Remote URL
fal upload https://example.com/image.png
```

Returns a fal.ai CDN URL you can use as input to any model.

### Check job status

```bash
fal status fal-ai/flux/dev abc-123-request-id
fal status fal-ai/flux/dev abc-123-request-id --result
fal status fal-ai/flux/dev abc-123-request-id --cancel
```

### Get pricing

```bash
fal pricing fal-ai/flux/dev
```

### List categories

```bash
fal models
fal models --category text-to-image
```

## Agent-first design

Every command outputs structured JSON. Agents can discover all capabilities with:

```bash
fal --help --json
```

This returns a machine-readable description of all commands, arguments, and options.

## License

MIT
