import { fal } from "@fal-ai/client";
import { error } from "./output";

export const PLATFORM_BASE = "https://api.fal.ai/v1";

export function getApiKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) {
    error(
      "FAL_KEY environment variable is required. Get one at https://fal.ai/dashboard/keys",
    );
  }
  return key;
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
