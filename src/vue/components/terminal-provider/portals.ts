import type { Component } from "vue";
import type { TerminalRenderPlane } from "../../../core/render-plane.js";
import type {
  TerminalRuntime,
  TerminalRuntimeHandle,
  TerminalSchedulerInvalidateOptions,
} from "../../context.js";
import { shallowReactive } from "vue";
import { shallowEqualRecord } from "./utils.js";

export interface Portal {
  id: string;
  component: Component;
  plane: TerminalRenderPlane;
  props: Record<string, unknown>;
}

let portalId = 0;

export function createTerminalPortals(
  invalidate: (options?: TerminalSchedulerInvalidateOptions) => void,
) {
  const portals = shallowReactive<Portal[]>([]);

  const runtime: TerminalRuntime = {
    mount(component, initialProps, options) {
      const id = `p${portalId++}`;
      let currentProps: Record<string, unknown> = { ...initialProps };
      const portal = shallowReactive<Portal>({
        id,
        component,
        plane: options?.plane ?? "overlay",
        props: currentProps,
      });
      portals.push(portal);
      let alive = true;
      const handle: TerminalRuntimeHandle = {
        update(nextProps) {
          if (!alive) return;
          const next = { ...currentProps, ...nextProps };
          if (shallowEqualRecord(currentProps, next)) return;
          currentProps = next;
          portal.props = currentProps;
          invalidate({ plane: portal.plane });
        },
        move(x, y) {
          if (!alive) return;
          const next = { ...currentProps, x, y };
          if (shallowEqualRecord(currentProps, next)) return;
          currentProps = next;
          portal.props = currentProps;
          invalidate({ plane: portal.plane });
        },
        unmount() {
          if (!alive) return;
          const idx = portals.findIndex((p) => p.id === id);
          if (idx < 0) {
            alive = false;
            return;
          }
          alive = false;
          portals.splice(idx, 1);
          invalidate({ plane: portal.plane });
        },
      };
      invalidate({ plane: portal.plane });
      return handle;
    },
  };

  return { portals, runtime } as const;
}
