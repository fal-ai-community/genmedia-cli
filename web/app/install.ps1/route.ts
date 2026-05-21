import type { NextRequest } from "next/server";
import { serveInstallScript } from "@/lib/install";

export async function GET(request: NextRequest) {
  return serveInstallScript("ps1", request.headers.get("user-agent"));
}
