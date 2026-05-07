import { randomUUID } from "node:crypto";
import { PostHog } from "posthog-node";

const POSTHOG_HOST = "https://us.i.posthog.com";

const key = process.env.POSTHOG_KEY?.trim() ?? "";

const client: PostHog | null = key
  ? new PostHog(key, {
      host: POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    })
  : null;

// Server-side analytics are anonymous: each request gets a synthetic
// distinctId so we never persist user identifiers. Web-side events are
// not (yet) correlated with CLI installation IDs.
export function trackServer(
  event: string,
  properties: Record<string, unknown> = {},
  distinctId?: string,
): void {
  if (!client) return;
  try {
    client.capture({
      distinctId: distinctId ?? `anon-${randomUUID()}`,
      event,
      properties,
    });
  } catch {
    // Analytics must never break a route handler.
  }
}
