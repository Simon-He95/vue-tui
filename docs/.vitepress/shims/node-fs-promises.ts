export async function readFile(): Promise<string> {
  throw new Error("node:fs/promises is unavailable in the docs browser shim");
}

export async function readdir(): Promise<any[]> {
  return [];
}

export async function lstat(): Promise<any> {
  throw new Error("node:fs/promises is unavailable in the docs browser shim");
}
