import { spawn } from "node:child_process";

// Best-effort cross-platform browser launch. Returns true if we successfully
// spawned a launcher; false otherwise. The login flow always prints the URL,
// so a return of `false` is non-fatal — the user can copy-paste.
export function openBrowser(url: string): boolean {
  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    // `start` needs an empty title arg when the URL contains spaces / quotes.
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  try {
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => {
      // Swallow — caller already printed the URL.
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
