import { describe, expect, test } from "bun:test";
import { buildGalleryFiles, kindFor } from "./gallery";
import {
  applyTemplate,
  renderSessionHtml,
  renderSessionsIndexHtml,
} from "./gallery-template";

describe("kindFor", () => {
  test("matches by file extension on a local path", () => {
    expect(kindFor({ path: "/tmp/foo.png" })).toBe("image");
    expect(kindFor({ path: "/tmp/foo.MP4" })).toBe("video");
    expect(kindFor({ path: "/tmp/clip.webm" })).toBe("video");
    expect(kindFor({ path: "/tmp/sound.wav" })).toBe("audio");
    expect(kindFor({ path: "/tmp/asset.glb" })).toBe("model");
  });

  test("matches by file extension in a URL", () => {
    expect(kindFor({ url: "https://cdn.example.com/path/cat.jpg" })).toBe(
      "image",
    );
    expect(kindFor({ url: "https://cdn.example.com/clip.mp4?token=abc" })).toBe(
      "video",
    );
  });

  test("falls back to MIME prefix when extension is unknown", () => {
    expect(
      kindFor({
        url: "https://cdn.example.com/x",
        contentType: "image/webp",
      }),
    ).toBe("image");
    expect(kindFor({ contentType: "audio/mpeg; charset=utf-8" })).toBe("audio");
  });

  test("returns 'other' when nothing matches", () => {
    expect(kindFor({})).toBe("other");
    expect(kindFor({ url: "https://example.com/page", contentType: "" })).toBe(
      "other",
    );
    expect(
      kindFor({ url: "not-a-real-url://", contentType: "text/html" }),
    ).toBe("other");
  });

  test("local path beats URL hint", () => {
    expect(
      kindFor({
        path: "/tmp/foo.mp3",
        url: "https://cdn.example.com/foo.png",
      }),
    ).toBe("audio");
  });
});

describe("buildGalleryFiles", () => {
  test("pairs downloaded local paths to their source refs by json_path", () => {
    const refs = [
      {
        url: "https://cdn.example.com/a.png",
        contentType: "image/png",
        jsonPath: "images[0]",
        fileSize: 100,
      },
      {
        url: "https://cdn.example.com/b.png",
        contentType: "image/png",
        jsonPath: "images[1]",
      },
    ];
    const downloaded = [
      {
        url: "https://cdn.example.com/a.png",
        path: "/out/a.png",
        size_bytes: 99,
        json_path: "images[0]",
      },
    ];
    const out = buildGalleryFiles(refs, downloaded);
    expect(out).toHaveLength(2);
    expect(out[0].path).toBe("/out/a.png");
    expect(out[0].kind).toBe("image");
    expect(out[0].size_bytes).toBe(99);
    expect(out[1].path).toBe(null);
    expect(out[1].size_bytes).toBe(null);
  });

  test("falls back to URL matching when json_paths drift", () => {
    const refs = [
      {
        url: "https://cdn.example.com/a.mp4",
        contentType: "video/mp4",
        jsonPath: "video",
      },
    ];
    const downloaded = [
      {
        url: "https://cdn.example.com/a.mp4",
        path: "/out/a.mp4",
        size_bytes: 42,
        json_path: "different",
      },
    ];
    const out = buildGalleryFiles(refs, downloaded);
    expect(out[0].path).toBe("/out/a.mp4");
    expect(out[0].kind).toBe("video");
  });

  test("works with no downloads (URL-only galleries)", () => {
    const refs = [
      {
        url: "https://cdn.example.com/a.png",
        contentType: "image/png",
        jsonPath: "images[0]",
      },
    ];
    const out = buildGalleryFiles(refs);
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe(null);
    expect(out[0].url).toBe("https://cdn.example.com/a.png");
    expect(out[0].kind).toBe("image");
  });
});

describe("applyTemplate", () => {
  test("HTML-escapes {{name}} substitutions", () => {
    expect(applyTemplate("hi {{x}}", { x: "<b>x</b>" })).toBe(
      "hi &lt;b&gt;x&lt;/b&gt;",
    );
    expect(applyTemplate("{{a}} & {{b}}", { a: '"a"', b: "'b'" })).toBe(
      "&quot;a&quot; & &#39;b&#39;",
    );
  });

  test("{{{name}}} substitutions are raw", () => {
    expect(applyTemplate("<x>{{{html}}}</x>", { html: "<b>ok</b>" })).toBe(
      "<x><b>ok</b></x>",
    );
  });

  test("removes unknown placeholders so leftovers never reach the user", () => {
    expect(applyTemplate("a {{missing}} b {{{also_missing}}} c", {})).toBe(
      "a  b  c",
    );
  });

  test("does not recurse — replacements containing placeholders stay literal", () => {
    expect(
      applyTemplate("{{{a}}}", { a: "{{x}}", x: "should-not-expand" }),
    ).toBe("{{x}}");
  });

  test("tolerates whitespace inside the braces", () => {
    expect(
      applyTemplate("{{  name  }}-{{{ raw }}}", { name: "n", raw: "<r>" }),
    ).toBe("n-<r>");
  });
});

describe("renderSessionHtml / renderSessionsIndexHtml", () => {
  test("session page embeds payload as JSON and references shared CSS classes", () => {
    const html = renderSessionHtml({
      schema_version: 1,
      session_id: "abc123",
      session_source: "override",
      agent: "codex",
      agent_host: null,
      cwd: null,
      started_at: 0,
      updated_at: 0,
      runs: [
        {
          ts: 0,
          request_id: "r1",
          endpoint_id: "fal-ai/flux/dev",
          modality: "text-to-image",
          prompt: "a cat",
          duration_ms: 1000,
          files: [
            {
              path: null,
              url: "https://cdn.example.com/a.png",
              size_bytes: null,
              kind: "image",
              json_path: "images[0]",
            },
          ],
        },
      ],
    });
    expect(html).toStartWith("<!doctype html>");
    expect(html).toContain('id="genmedia-data"');
    expect(html).toContain('"session_id":"abc123"');
    expect(html).toContain('class="grid"');
    expect(html).toContain("genmedia session abc123");
    // New design surface: page shell + lightbox + tweaks panel scaffolding.
    expect(html).toContain('class="page"');
    expect(html).toContain('id="lightbox"');
    expect(html).toContain('id="tweaks"');
    expect(html).toContain('id="header-chips"');
    // Shared + page-specific CSS were both inlined.
    expect(html).toContain("--font-mono");
    expect(html).toContain(".audio-stage");
    // No unsubstituted placeholders made it to the output.
    expect(html).not.toContain("{{");
    expect(html).not.toContain("}}");
  });

  test("</script> sequences in the payload are escaped so they can't break out", () => {
    const html = renderSessionHtml({
      schema_version: 1,
      session_id: "x",
      session_source: "fallback",
      agent: null,
      agent_host: null,
      cwd: null,
      started_at: 0,
      updated_at: 0,
      runs: [
        {
          ts: 0,
          request_id: "r",
          endpoint_id: "e",
          modality: null,
          prompt: "</script><script>alert(1)</script>",
          duration_ms: null,
          files: [
            {
              path: null,
              url: "https://x/a.png",
              size_bytes: null,
              kind: "image",
              json_path: "",
            },
          ],
        },
      ],
    });
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("<\\/script>");
  });

  test("index page renders empty when there are no sessions", () => {
    const html = renderSessionsIndexHtml([]);
    expect(html).toContain("genmedia sessions");
    expect(html).toContain('"sessions":[]');
    expect(html).toContain('id="sessions-grid"');
    expect(html).toContain(".session-card");
    expect(html).not.toContain("{{");
  });
});
