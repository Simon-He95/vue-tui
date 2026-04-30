function createStream() {
  return {
    setEncoding: () => {},
    on: () => {},
  };
}

export function spawn() {
  return {
    stdout: createStream(),
    stderr: createStream(),
    on: (_event: string, handler: (...args: any[]) => void) => {
      if (_event === "close") queueMicrotask(() => handler(1));
      return undefined;
    },
  };
}
