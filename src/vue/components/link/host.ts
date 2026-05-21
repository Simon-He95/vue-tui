import type { Ref } from "vue";
import { injectionKey } from "../../injection-key.js";

export type TerminalLinkOpenSource = "click" | "key" | "hint";

export type TerminalLinkOpenContext = Readonly<{
  source: TerminalLinkOpenSource;
  label?: string;
  cellX?: number;
  cellY?: number;
}>;

export interface TerminalLinkOpener {
  openExternal: (href: string, context: TerminalLinkOpenContext) => boolean | Promise<boolean>;
}

export type TerminalLinkOpenerLike =
  | TerminalLinkOpener
  | ((href: string, context: TerminalLinkOpenContext) => boolean | Promise<boolean>);

export const TerminalLinkOpenerContextKey =
  injectionKey<Readonly<Ref<TerminalLinkOpener | undefined>>>("TerminalLinkOpener");

export function normalizeTerminalLinkOpener(
  opener: TerminalLinkOpenerLike | undefined,
): TerminalLinkOpener | undefined {
  if (!opener) return undefined;
  if (typeof opener === "function") return { openExternal: opener };
  return opener;
}

export function createBrowserLinkOpener(): TerminalLinkOpener {
  return {
    openExternal(href) {
      const win = (globalThis as any).window as
        | { open?: (url?: string, target?: string, features?: string) => unknown }
        | undefined;
      const open = win?.open;
      if (!open) return false;
      open.call(win, href, "_blank", "noopener,noreferrer");
      return true;
    },
  };
}
