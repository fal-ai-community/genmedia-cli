export const INSTALL_SH =
  "https://raw.githubusercontent.com/fal-ai-community/genmedia-cli/refs/heads/main/install.sh";
export const INSTALL_PS1 =
  "https://raw.githubusercontent.com/fal-ai-community/genmedia-cli/refs/heads/main/install.ps1";

const WINDOWS_UA = /powershell|pwsh|windows/i;

export type Platform = "sh" | "ps1";

export function detectPlatform(userAgent: string | null): Platform {
  return WINDOWS_UA.test(userAgent ?? "") ? "ps1" : "sh";
}

export async function serveInstallScript(
  platform: Platform,
): Promise<Response> {
  const url = platform === "ps1" ? INSTALL_PS1 : INSTALL_SH;
  const upstream = await fetch(url, { cache: "no-store" });

  if (!upstream.ok) {
    return new Response("install script unavailable\n", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
