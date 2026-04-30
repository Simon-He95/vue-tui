export function pathToFileURL(pathLike: string): URL {
  const normalized = String(pathLike ?? "").replace(/\\/g, "/");
  const pathname = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return new URL(`file://${pathname}`);
}

export function fileURLToPath(input: string | URL): string {
  const url = input instanceof URL ? input : new URL(String(input));
  return decodeURIComponent(url.pathname);
}
