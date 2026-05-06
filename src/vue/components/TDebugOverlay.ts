import type { PropType } from "vue";
import type { FramePerfSample } from "../../observability/frame-perf.js";
import type { Style } from "../../core/types.js";
import { defineComponent, h, onMounted, onUnmounted, shallowRef } from "vue";
import { useTerminal } from "../composables/use-terminal.js";
import { TBox } from "./TBox.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";

export const TDebugOverlay = defineComponent({
  name: "TDebugOverlay",
  props: {
    mode: { type: String as PropType<"focus" | "all">, default: "focus" },
    panel: { type: Boolean, default: true },
    maxRects: { type: Number, default: 40 },
    zIndex: { type: Number, default: 90 },
  },
  setup(props) {
    const { terminal, events, observability, scheduler } = useTerminal();
    const trace = observability.trace;
    const framePerf = observability.framePerf;
    const releasePerf = framePerf.acquire("debug-overlay");
    const latestPerf = shallowRef<FramePerfSample | null>(framePerf.latest());
    let timer: ReturnType<typeof setInterval> | null = null;

    function refreshLatestPerf(): void {
      const next = framePerf.latest();
      if (!next) return;
      if (next.reason === "manual") return;
      if (latestPerf.value?.frameId === next.frameId) return;
      latestPerf.value = next;
      scheduler.invalidate({ priority: "low", reason: "manual" });
    }

    onMounted(() => {
      refreshLatestPerf();
      timer = setInterval(refreshLatestPerf, 250);
    });

    onUnmounted(() => {
      releasePerf();
      if (timer) clearInterval(timer);
      timer = null;
    });

    function boxStyle(kind: "panel" | "focus" | "rect"): Style {
      if (kind === "panel") return { fg: "whiteBright", bg: "black" };
      if (kind === "focus") return { fg: "cyanBright" };
      return { fg: "magentaBright" };
    }

    return () => {
      const { cols, rows } = terminal.size();
      if (cols <= 0 || rows <= 0) return null;

      const mgr: any = events.value as any;
      const debugNodes = (() => {
        const nodes = typeof mgr?.debugNodes === "function" ? (mgr.debugNodes() as any[]) : [];
        return nodes.filter((n) => n && n.rect && n.visible);
      })();
      const focused =
        typeof mgr?.getFocused === "function" ? (mgr.getFocused() as string | null) : null;
      const focusedRect = debugNodes.find((n) => n.id === focused)?.rect ?? null;

      const panelText = (() => {
        if (!props.panel) return "";
        const records = trace.records;
        const last = [...records].reverse().find((r) => r.type === "commit") as any;
        const perf = latestPerf.value ?? framePerf.latest();
        const dirty = last
          ? last.dirtyRows === null
            ? "all"
            : String(last.dirtyRows?.length ?? 0)
          : "0";
        const lines = [
          `trace: ${trace.enabled.value ? "ON" : "OFF"}`,
          `focus: ${focused ?? "null"}`,
          last ? `last commit: dirtyRows=${dirty}` : "last commit: -",
        ];
        if (perf) {
          lines.push(
            `frame: ${perf.durationMs.toFixed(1)}ms`,
            `reason: ${perf.reason}`,
            `dirtyRows: ${perf.dirtyRows === null ? "all" : perf.dirtyRows}`,
            `scannedNodes: ${perf.scannedNodes}`,
            `paintedNodes: ${perf.paintedNodes}`,
            `commit: ${perf.commitMs.toFixed(1)}ms`,
            `domFlush: ${perf.domFlushMs == null ? "-" : `${perf.domFlushMs.toFixed(1)}ms`}`,
            `coalescedInvalidates: ${perf.coalescedInvalidates}`,
            `frameTasks: ${perf.frameTaskCount} queue:${perf.frameTaskQueueDepthBeforeRun}->${perf.frameTaskQueueDepthAfterRun}`,
            `coalescedTasks: ${perf.coalescedFrameTasks}`,
            `droppedUpdates: ${perf.droppedUpdates}`,
            `queueDepth: ${perf.queueDepth}`,
          );
        } else {
          lines.push("frame: -");
        }
        return lines.join("\n");
      })();

      const children: any[] = [];

      if (props.mode === "all") {
        for (const n of debugNodes.slice(0, Math.max(0, Math.floor(props.maxRects)))) {
          const r = n.rect;
          if (!r || r.w < 2 || r.h < 2) continue;
          children.push(
            h(TBox as any, {
              x: r.x,
              y: r.y,
              w: r.w,
              h: r.h,
              zIndex: props.zIndex,
              clear: false,
              padding: 0,
              title: n.id,
              style: boxStyle("rect"),
            }),
          );
        }
      }

      const fr = focusedRect;
      if (fr && fr.w >= 2 && fr.h >= 2) {
        children.push(
          h(TBox as any, {
            x: fr.x,
            y: fr.y,
            w: fr.w,
            h: fr.h,
            zIndex: props.zIndex,
            clear: false,
            padding: 0,
            title: `focus:${focused ?? ""}`,
            style: boxStyle("focus"),
          }),
        );
      }

      if (props.panel) {
        const panelW = Math.min(cols, 42);
        const panelH = rows >= 16 ? Math.min(rows, 17) : Math.min(rows, 6);
        children.push(
          h(
            TBox as any,
            {
              x: 0,
              y: 0,
              w: panelW,
              h: panelH,
              zIndex: props.zIndex,
              clear: true,
              padding: 0,
              title: "debug",
              style: boxStyle("panel"),
            },
            () =>
              h(TText as any, {
                x: 0,
                y: 0,
                w: panelW - 2,
                h: panelH - 2,
                wrap: true,
                value: panelText,
              }),
          ),
        );
      }

      return h(
        TView as any,
        { x: 0, y: 0, w: cols, h: rows, zIndex: props.zIndex },
        () => children,
      );
    };
  },
});
