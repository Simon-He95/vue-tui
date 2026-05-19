export function isNodeRuntime(): boolean {
  const proc = (globalThis as any).process;
  return typeof proc?.versions?.node === "string";
}

export async function importNodeModule<T>(specifier: string): Promise<T | null> {
  if (!isNodeRuntime()) return null;

  try {
    return (await import(/* @vite-ignore */ specifier)) as T;
  } catch {}

  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<T>;
    return await dynamicImport(specifier);
  } catch {
    return null;
  }
}
