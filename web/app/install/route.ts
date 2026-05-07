import type { NextRequest } from "next/server";
import { detectPlatform, serveInstallScript } from "@/lib/install";

export async function GET(request: NextRequest) {
  const userAgent = request.headers.get("user-agent");
  const platform = detectPlatform(userAgent);
  return serveInstallScript(platform, userAgent);
}
