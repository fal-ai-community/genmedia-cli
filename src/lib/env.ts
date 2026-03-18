import { join } from "node:path";
import { config } from "dotenv";
import { loadConfig } from "./config";

// Loads .env from the current working directory into process.env.
// Shell environment variables always take precedence — only unset keys are populated.
// Only runs when autoLoadEnv is enabled in the user's config.
export function loadDotEnv(): void {
  if (!loadConfig().autoLoadEnv) return;
  config({ path: join(process.cwd(), ".env"), override: false, quiet: true });
}
