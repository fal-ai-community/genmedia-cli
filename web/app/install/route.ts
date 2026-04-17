import type { NextRequest } from "next/server";
import { detectPlatform, serveInstallScript } from "@/lib/install";

export async function GET(request: NextRequest) {
  const platform = detectPlatform(request.headers.get("user-agent"));
  return serveInstallScript(platform);
}
