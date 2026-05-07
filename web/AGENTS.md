<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Analytics

Server-side analytics (`web/lib/analytics.ts`) capture anonymous events on the API routes (install-script downloads, skill searches). They no-op when `POSTHOG_KEY` is unset. In Vercel, set `POSTHOG_KEY` in project settings (Production + Preview); locally, leave it unset or export it in your shell to test.
