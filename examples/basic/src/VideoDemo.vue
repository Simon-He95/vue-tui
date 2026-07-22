<script setup lang="ts">
import type { TVideoFrameEvent, TVideoFrameSource } from "@simon_he/vue-tui/experimental";
import { computed, ref } from "vue";
import { TBox, TText } from "@simon_he/vue-tui";
import { TVideo } from "@simon_he/vue-tui/experimental";
import { useLayout } from "@simon_he/vue-tui/vue";

const props = defineProps<{
  videoSrc: string;
  videoFrameSource: TVideoFrameSource;
}>();

const layout = useLayout();
const cols = computed(() => Math.max(1, layout.clipRect?.w ?? 86));
const rows = computed(() => Math.max(1, layout.clipRect?.h ?? 26));
const innerW = computed(() => Math.max(1, cols.value - 4));
const videoH = computed(() => Math.max(1, rows.value - 8));
const footerY = computed(() => Math.max(0, rows.value - 6));
const youtubeSource = computed(() => /(?:youtube\.com|youtu\.be)/iu.test(props.videoSrc));
const title = computed(() =>
  youtubeSource.value ? "TVideo · YouTube 4K60" : "TVideo · Big Buck Bunny clip",
);
const sourceLabel = computed(() =>
  youtubeSource.value
    ? "YouTube 4K60 → adaptive source (typically 360p/≤30fps) → PNG/ASCII"
    : "Bundled CC clip · 640×360 H.264 · offline fallback",
);
const paused = ref(false);
const playbackRate = ref(1);
const discoveredDurationMs = ref<number>();
const frameStatus = ref("starting video decoder…");
const durationMs = computed(() => (youtubeSource.value ? discoveredDurationMs.value : 6000));
const playbackStatus = computed(() => {
  const totalSeconds = Math.max(0, Math.round((durationMs.value ?? 0) / 1000));
  const duration =
    durationMs.value == null
      ? "--:--"
      : `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  return `${frameStatus.value} · ${paused.value ? "paused" : "playing"} · ${playbackRate.value}x · duration ${duration}`;
});
let displayedSecond = -1;

function onFrame(event: TVideoFrameEvent) {
  if (event.durationMs != null) discoveredDurationMs.value = event.durationMs;
  const second = Math.floor(event.timestampMs / 1000);
  if (second === displayedSecond) return;
  displayedSecond = second;
  frameStatus.value = `${event.pixelWidth}x${event.pixelHeight} · ${second}s · dropped ${event.droppedFrames}`;
}

function onError(error: unknown) {
  frameStatus.value = error instanceof Error ? error.message : String(error);
}
</script>

<template>
  <TBox
    :x="0"
    :y="0"
    :w="cols"
    :h="rows"
    border
    :title="title"
    :padding="1"
    :style="{ fg: 'cyanBright' }"
  >
    <TText :x="0" :y="0" :w="innerW" :value="playbackStatus" :style="{ dim: true }" />
    <TVideo
      :x="0"
      :y="2"
      :w="innerW"
      :h="videoH"
      :src="videoSrc"
      :frame-source="videoFrameSource"
      :max-fps="12"
      :duration-ms="youtubeSource ? undefined : 6000"
      v-model:paused="paused"
      v-model:playback-rate="playbackRate"
      controls
      :controls-layout="youtubeSource ? 'cinema' : 'compact'"
      loop
      fallback="Waiting for the first decoded video frame…"
      @frame="onFrame"
      @error="onError"
    />
    <TText
      :x="0"
      :y="footerY"
      :w="innerW"
      value="Big Buck Bunny © 2008 Blender Foundation / www.bigbuckbunny.org · CC BY 3.0"
      :style="{ fg: 'yellowBright' }"
    />
    <TText :x="0" :y="footerY + 1" :w="innerW" :value="sourceLabel" :style="{ dim: true }" />
  </TBox>
</template>
