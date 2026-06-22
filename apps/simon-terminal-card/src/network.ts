import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import { fetchAttempts, fetchTimeoutMs, userAgent } from "./constants.js";
import { delay } from "./utils.js";

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": userAgent,
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

function curlArgs(url: string): string[] {
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
    "Accept: application/vnd.github+json",
  ];
  if (process.env.GITHUB_TOKEN)
    args.push("-H", `Authorization: Bearer ${process.env.GITHUB_TOKEN}`);
  args.push(url);
  return args;
}

function fetchWithCurl(url: string): Buffer | null {
  const curl = existsSync("/usr/bin/curl") ? "/usr/bin/curl" : "curl";
  try {
    return execFileSync(curl, curlArgs(url), {
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
  let lastError: unknown;
  for (let attempt = 0; attempt < fetchAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
    try {
      const response = await fetch(url, { headers: githubHeaders(), signal: controller.signal });
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
  const curl = fetchWithCurl(url);
  if (curl) return curl.toString("utf8");
  throw lastError;
}

export async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}

export async function fetchBytes(url: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < fetchAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
    try {
      const response = await fetch(url, { headers: githubHeaders(), signal: controller.signal });
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
  const curl = fetchWithCurl(url);
  if (curl) return curl;
  throw lastError;
}
