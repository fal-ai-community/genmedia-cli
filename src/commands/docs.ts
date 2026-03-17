import { defineCommand } from "citty";
import { error, output } from "../lib/output";

export default defineCommand({
  meta: {
    name: "docs",
    description: "Search fal.ai documentation, guides, and API references",
  },
  args: {
    query: { type: "positional", required: true, description: "Search query" },
  },
  async run({ args }) {
    const res = await fetch("https://docs.fal.ai/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "SearchFal", arguments: { query: args.query } },
      }),
    });

    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
    if (!dataLine) error("No results from docs search");

    const data = JSON.parse(dataLine.slice(6)) as {
      result?: { content: Array<{ type: string; text: string }> };
    };

    if (!data.result?.content) error("No results");

    const results = data.result.content.map((c) => {
      const titleMatch = c.text.match(/^Title: (.+)/m);
      const linkMatch = c.text.match(/^Link: (.+)/m);
      const contentMatch = c.text.match(/^Content: ([\s\S]+)/m);
      return {
        title: titleMatch?.[1] || "Untitled",
        url: linkMatch?.[1] || null,
        content: contentMatch?.[1]?.trim() || c.text,
      };
    });

    output({ query: args.query, results, count: results.length });
  },
});
