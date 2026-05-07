import type { NextRequest } from "next/server";
import { serveInstallScript } from "@/lib/install";

export async function GET(request: NextRequest) {
  return serveInstallScript("sh", request.headers.get("user-agent"));
}
