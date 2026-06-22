import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fetchAttempts, fetchTimeoutMs, userAgent } from "./constants.js";
import { delay } from "./utils.js";

function githubHeaders(accept: string): HeadersInit {
  return {
    Accept: accept,
    "User-Agent": userAgent,
  };
}

function curlArgs(url: string, accept: string): string[] {
  const args = [
    "-L",
    "--fail",
    "--silent",
    "--show-error",
    "--connect-timeout",
    "8",
    "--max-time",
    "20",
    "--retry",
    "1",
    "-H",
    `User-Agent: ${userAgent}`,
    "-H",
    `Accept: ${accept}`,
  ];
  args.push(url);
  return args;
}

function fetchWithCurl(url: string, accept: string): Buffer | null {
  const curl = existsSync("/usr/bin/curl") ? "/usr/bin/curl" : "curl";
  try {
    return execFileSync(curl, curlArgs(url, accept), {
      encoding: "buffer",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
  } catch {
    return null;
  }
}

export async function fetchText(url: string): Promise<string> {
  const accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  let lastError: unknown;
  for (let attempt = 0; attempt < fetchAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
    try {
      const response = await fetch(url, {
        headers: githubHeaders(accept),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt === fetchAttempts - 1) break;
      await delay(500 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  const curl = fetchWithCurl(url, accept);
  if (curl) return curl.toString("utf8");
  throw lastError;
}

export async function fetchBytes(url: string): Promise<Buffer> {
  const accept = "image/*,*/*;q=0.8";
  let lastError: unknown;
  for (let attempt = 0; attempt < fetchAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
    try {
      const response = await fetch(url, {
        headers: githubHeaders(accept),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt === fetchAttempts - 1) break;
      await delay(500 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  const curl = fetchWithCurl(url, accept);
  if (curl) return curl;
  throw lastError;
}
