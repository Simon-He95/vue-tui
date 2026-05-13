import type { InjectionKey } from "vue";

// Separately bundled entrypoints share injection keys within this protocol.
// Bump it when a provided context shape changes incompatibly.
const VUE_TUI_INJECTION_PROTOCOL = "v1";

export function injectionKey<T>(name: string): InjectionKey<T> {
  return Symbol.for(`@simon_he/vue-tui:${VUE_TUI_INJECTION_PROTOCOL}:${name}`) as InjectionKey<T>;
}
