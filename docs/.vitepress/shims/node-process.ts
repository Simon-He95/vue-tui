const processShim = {
  env: {} as Record<string, string>,
  versions: {} as Record<string, string>,
  platform: "",
  argv: [] as string[],
  cwd: () => "/",
  nextTick: (fn: (...args: any[]) => void, ...args: any[]) => {
    queueMicrotask(() => fn(...args));
  },
  stdout: {
    isTTY: false,
    columns: 80,
    rows: 24,
    write: () => true,
  },
  stderr: {
    isTTY: false,
    write: () => true,
  },
  stdin: {
    isTTY: false,
    setRawMode: () => {},
  },
  on: () => processShim,
  off: () => processShim,
} as const;

export default processShim;
