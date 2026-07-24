/**
 * Vue terminal app that renders a repo 3D badge.
 *
 * Mirrors the vue-tui t3d-terminal-badge example but drives it from
 * dynamically-fetched repo data instead of a hardcoded scene.
 */

import type { T3DHitResult, TVideoFrameEvent } from "@simon_he/vue-tui/experimental";
import { T3DViewport } from "@simon_he/vue-tui/experimental";
import { TBox, TText } from "@simon_he/vue-tui";
import { computed, defineComponent, h, ref } from "vue";
import type { RepoBadgeBuildResult } from "./renderer.js";
import type { Repo3DData } from "./types.js";

export interface RepoBadgeAppOptions {
  /** Fetched repo data (from fetchRepo3DData). */
  data: Repo3DData;
  /** Optional pre-built renderer result. If omitted, one is built here. */
  buildResult?: RepoBadgeBuildResult;
  /** Terminal columns. */
  cols: number;
  /** Terminal rows. */
  rows: number;
  /** Smoke test mode (non-interactive, no TTY). */
  smoke?: boolean;
}

export interface RepoBadgeAppState {
  /** Reactive frame / hover / error status exposed for the status bar. */
  frameStatus: ReturnType<typeof ref<string>>;
  errorStatus: ReturnType<typeof ref<string>>;
  hovered: ReturnType<typeof ref<T3DHitResult | null>>;
  selected: ReturnType<typeof ref<T3DHitResult | null>>;
  ready: ReturnType<typeof ref<boolean>>;
  contributorCount: number;
}

export function defineRepoBadgeApp(_options: RepoBadgeAppOptions) {
  // Re-exported for potential programmatic use; the real mounting happens
  // in cli.ts via createTerminalApp.
  void _options;
}

export function createRepoBadgeComponent(
  data: Repo3DData,
  buildPromise: Promise<RepoBadgeBuildResult>,
  opts: { cols: number; rows: number; smoke?: boolean },
) {
  const cols = ref(opts.cols);
  const rows = ref(opts.rows);
  const frameStatus = ref("building renderer…");
  const errorStatus = ref("");
  const hoveredContributor = ref<T3DHitResult | null>(null);
  const selectedContributor = ref<T3DHitResult | null>(null);
  const buildResultRef = ref<RepoBadgeBuildResult | null>(null);

  const RepoBadge3D = defineComponent({
    name: "RepoBadge3D",
    setup() {
      const boxWidth = computed(() => Math.max(20, cols.value));
      const boxHeight = computed(() => Math.max(10, rows.value));
      const contentWidth = computed(() => Math.max(16, boxWidth.value - 4));
      const viewportHeight = computed(() => Math.max(4, boxHeight.value - 9));

      const contributorStatus = computed(() => {
        const hit = selectedContributor.value ?? hoveredContributor.value;
        const count = buildResultRef.value?.contributorCount ?? data.contributors.length;
        if (!hit) {
          const owner = data.meta.ownerLogin;
          return `${count} CONTRIBUTORS · ${data.meta.fullName} · ${owner}`;
        }
        const prefix = selectedContributor.value ? "LOCKED" : "HOVER";
        const order = String(hit.objectId + 1).padStart(3, "0");
        const ownerTag = hit.objectId === 0 ? ` · ${data.meta.ownerType}` : "";
        return `${prefix} · #${order} · @${hit.label ?? "unknown"}${ownerTag}`;
      });

      function onFrame(event: TVideoFrameEvent): void {
        frameStatus.value = `${event.pixelWidth}×${event.pixelHeight} · ${event.droppedFrames} coalesced`;
      }

      function onError(error: unknown): void {
        errorStatus.value = error instanceof Error ? error.message : String(error);
      }

      return () =>
        h(
          TBox,
          {
            x: 0,
            y: 0,
            w: boxWidth.value,
            h: boxHeight.value,
            border: true,
            padding: 1,
            title: ` ${data.meta.fullName} · 3D BADGE `,
            style: { fg: "greenBright", bg: "black" },
            titleStyle: { fg: "cyanBright", bold: true },
          },
          () => {
            const children: ReturnType<typeof h>[] = [
              h(TText, {
                x: 0,
                y: 0,
                w: contentWidth.value,
                value: `${data.meta.fullName} · ⭐ ${data.meta.stargazersCount} · ${data.contributors.length} CONTRIBUTORS`,
                style: { fg: "greenBright", bold: true },
              }),
            ];

            if (buildResultRef.value) {
              children.push(
                h(T3DViewport, {
                  x: 0,
                  y: 2,
                  w: contentWidth.value,
                  h: viewportHeight.value,
                  renderer: buildResultRef.value.renderer,
                  maxFps: 24,
                  pixelWidth: 480,
                  pixelHeight: 288,
                  initialYaw: -0.28,
                  initialPitch: 0.13,
                  initialZoom: 0.82,
                  minZoom: 0.62,
                  maxZoom: 1.8,
                  zoomSensitivity: 0.14,
                  autoRotateSpeed: 0.42,
                  fallback: "[WebGPU repo badge]",
                  style: { fg: "greenBright", bg: "black" },
                  onFrame,
                  onError,
                  onObjecthover: (hit: T3DHitResult | null) => {
                    hoveredContributor.value = hit;
                  },
                  onObjectselect: (hit: T3DHitResult | null) => {
                    selectedContributor.value = hit;
                  },
                }),
              );
            }

            children.push(
              h(TText, {
                x: 0,
                y: viewportHeight.value + 2,
                w: contentWidth.value,
                value: contributorStatus.value,
                style: { fg: selectedContributor.value ? "greenBright" : "cyanBright", bold: true },
              }),
              h(TText, {
                x: 0,
                y: viewportHeight.value + 3,
                w: contentWidth.value,
                value: errorStatus.value || `LIVE · ${frameStatus.value}`,
                style: errorStatus.value ? { fg: "redBright", bold: true } : { fg: "cyanBright" },
              }),
              h(TText, {
                x: 0,
                y: viewportHeight.value + 4,
                w: contentWidth.value,
                value: opts.smoke
                  ? "SMOKE PREVIEW"
                  : "DRAG rotates · HOVER previews · CLICK locks · SCROLL zooms · Q quits",
                style: { fg: "white", dim: true },
              }),
            );
            return children;
          },
        );
    },
  });

  // Kick off the renderer build; when done, assign so the viewport mounts.
  void buildPromise.then((result) => {
    buildResultRef.value = result;
    frameStatus.value = "ready";
  });

  return { component: RepoBadge3D, refs: { cols, rows, frameStatus, errorStatus } };
}
