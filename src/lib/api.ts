import { fal } from "@fal-ai/client";
import { loadConfig } from "./config";
import { error } from "./output";

export const PLATFORM_BASE = "https://api.fal.ai/v1";

export function getApiKey(): string {
  const key = process.env.FAL_KEY ?? loadConfig().apiKey;
  if (!key) {
    error(
      "No API key found. Run `falgen setup` to configure your key, or set the FAL_KEY environment variable. Get one at https://fal.ai/dashboard/keys",
    );
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
