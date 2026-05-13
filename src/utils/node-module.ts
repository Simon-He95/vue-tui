export function isNodeRuntime(): boolean {
  const proc = (globalThis as any).process;
  return typeof proc?.versions?.node === "string";
}

export function importNodeModule<T>(specifier: string): Promise<T | null> {
  if (!isNodeRuntime()) return Promise.resolve(null);

  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<T>;
    return dynamicImport(specifier).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}
