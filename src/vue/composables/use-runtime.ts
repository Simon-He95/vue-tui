import { useTerminal } from "./use-terminal.js";

export function useTerminalRuntime() {
  return useTerminal().runtime;
}
