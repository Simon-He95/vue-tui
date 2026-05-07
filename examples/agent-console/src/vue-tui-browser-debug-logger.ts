export type DebugLogger = Readonly<{
  render: (message: string) => void;
  stream: (message: string) => void;
  error: (message: string, ...args: unknown[]) => void;
}>;

const noop = () => {};

export function createDebugLogger(): DebugLogger {
  return {
    render: noop,
    stream: noop,
    error: noop,
  };
}

export function isDebugEnabled(): boolean {
  return false;
}
