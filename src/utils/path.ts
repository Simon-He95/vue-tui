export type PathStyle = "posix";

function normalizeSeparators(input: string): string {
  // Treat backslashes as separators too (helps on Windows-ish input).
  return input.replace(/\\/g, "/");
}

export function isAbsolutePath(path: string): boolean {
  const p = normalizeSeparators(path);
  if (p.startsWith("/")) return true;
  // Windows drive letter: C:/...
  return /^[A-Z]:\//i.test(p);
}

export function stripTrailingSlash(path: string): string {
  const p = normalizeSeparators(path);
  if (p === "/") return p;
  return p.replace(/\/+$/g, "");
}

export function joinPath(base: string, next: string): string {
  const a = normalizeSeparators(base);
  const b = normalizeSeparators(next);
  if (!a) return b;
  if (!b) return a;
  if (a.endsWith("/")) return `${a}${b.startsWith("/") ? b.slice(1) : b}`;
  return `${a}/${b.startsWith("/") ? b.slice(1) : b}`;
}

export function dirname(path: string): string {
  const p = stripTrailingSlash(path);
  const normalized = normalizeSeparators(p);
  if (normalized === "/") return "/";
  const drive = normalized.match(/^([A-Z]:)\//i)?.[1] ?? null;
  const start = drive ? drive.length + 1 : 0;
  const idx = normalized.lastIndexOf("/");
  if (idx < start) return drive ? `${drive}/` : "";
  const out = normalized.slice(0, idx) || (drive ? `${drive}/` : "/");
  return out;
}

export function normalizePath(path: string): string {
  const raw = normalizeSeparators(path);
  if (!raw) return "";

  const drive = raw.match(/^([A-Z]:)(\/|$)/i)?.[1] ?? null;
  const rest = drive ? raw.slice(drive.length) : raw;
  const absolute = rest.startsWith("/");

  const parts = rest.split("/").filter(Boolean);
  const stack: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") {
        stack.pop();
        continue;
      }
      if (!absolute) stack.push("..");
      continue;
    }
    stack.push(part);
  }

  const prefix = drive ? `${drive}${absolute ? "/" : ""}` : absolute ? "/" : "";
  const joined = stack.join("/");
  const out = `${prefix}${joined}`;
  return out || (absolute ? (drive ? `${drive}/` : "/") : "");
}

export function resolvePath(baseAbs: string, input: string): string {
  const b = normalizePath(baseAbs);
  const i = normalizePath(input);
  if (!b) return i;
  if (isAbsolutePath(i)) return i;
  return normalizePath(joinPath(b, i));
}
