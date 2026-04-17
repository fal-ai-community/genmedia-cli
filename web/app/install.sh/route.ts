import { serveInstallScript } from "@/lib/install";

export async function GET() {
  return serveInstallScript("sh");
}
