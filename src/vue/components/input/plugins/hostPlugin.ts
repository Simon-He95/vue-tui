import type { TInputHostAdapter } from "../host.js";
import type { TInputPlugin } from "./types.js";

export function createTInputHostPlugin(
  adapterOrFactory: TInputHostAdapter | (() => TInputHostAdapter) = {},
): TInputPlugin {
  return {
    name: "tinput-host",
    install(ctx) {
      const adapter =
        typeof adapterOrFactory === "function" ? adapterOrFactory() : adapterOrFactory;
      ctx.registerHostAdapter(adapter);
    },
  };
}

export const defaultTInputHostPlugin = createTInputHostPlugin({});
