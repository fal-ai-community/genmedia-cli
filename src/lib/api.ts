import { fal } from "@fal-ai/client";
import { loadConfig } from "./config";
import { error } from "./output";

export const PLATFORM_BASE = "https://api.fal.ai/v1";

export function getApiKey(): string {
  const key = process.env.FAL_KEY ?? loadConfig().apiKey;
  if (!key) {
    error("No fal.ai API key found.", {
      hint: [
        "Set FAL_KEY in your environment, or",
        "run `genmedia setup` (interactive), or",
        "run `genmedia setup --non-interactive --api-key <key>` (for agents/CI).",
        "Get one at https://fal.ai/dashboard/keys",
      ].join("\n"),
    });
  }
  return key as string;
}

export function configureSDK(): void {
  fal.config({ credentials: getApiKey() });
}

export function platformHeaders(): Record<string, string> {
  return {
    Authorization: `Key ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}
