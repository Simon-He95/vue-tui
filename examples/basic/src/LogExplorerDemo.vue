<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { TBox, TInput, TText, TView } from "@simon_he/vue-tui";
import { useLayout } from "@simon_he/vue-tui/vue";
import { TLogView, createAppendOnlyLogStore } from "@simon_he/vue-tui/experimental";

const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 90);
const rows = computed(() => layout.clipRect?.h ?? 26);

const store = createAppendOnlyLogStore({ maxLines: 240 });
const query = ref("error");
const searchSummary = ref("search: error");
const appended = ref(0);
const logVersion = computed(() => store.version.value);

function line(index: number): string {
  const level = index % 17 === 0 ? "ERROR" : index % 7 === 0 ? "WARN" : "INFO";
  const service = ["api", "worker", "renderer", "agent"][index % 4]!;
  const latency = 12 + ((index * 37) % 420);
  const suffix =
    level === "ERROR"
      ? "failed to connect https://status.example.dev/runbook"
      : level === "WARN"
        ? "retry scheduled after transient queue pressure"
        : "processed batch and updated checkpoint";
  return `${String(index).padStart(3, "0")} ${level.padEnd(5)} ${service.padEnd(8)} ${latency}ms ${suffix}`;
}

function appendSample() {
  appended.value++;
  const level = appended.value % 3 === 0 ? "ERROR" : "INFO";
  store.appendLine(
    `${String(100 + appended.value).padStart(3, "0")} ${level.padEnd(5)} live     ${80 + appended.value}ms appended log event ${appended.value}`,
  );
}

function setQuery(value: string) {
  query.value = value;
  searchSummary.value = `search: ${value || "(empty)"}`;
}

function onSearch(payload: { query: string; status: string; matchCount: number }) {
  searchSummary.value = `search: ${payload.query || "(empty)"} · ${payload.matchCount} matches · ${payload.status}`;
}

onMounted(() => {
  store.clear();
  store.appendLines(Array.from({ length: 96 }, (_, index) => line(index + 1)));
});
</script>

<template>
  <TBox
    :x="0"
    :y="0"
    :w="cols"
    :h="rows"
    border
    title="Terminal Log Explorer"
    :padding="1"
    :style="{ fg: 'blueBright' }"
  >
    <TText :x="0" :y="0" :w="cols - 4" value="Search retained logs with TLogView." />
    <TText :x="0" :y="2" value="Query:" :style="{ bold: true }" />
    <TInput
      :x="8"
      :y="2"
      :w="Math.min(26, cols - 12)"
      v-model="query"
      placeholder="error, warn, renderer..."
      @change="setQuery"
    />
    <TView :x="38" :y="2" :w="14" :h="1" @click="appendSample" />
    <TText :x="38" :y="2" value="[ Append log ]" :style="{ fg: 'greenBright', bold: true }" />
    <TText :x="0" :y="4" :w="cols - 4" :value="searchSummary" :style="{ fg: 'yellowBright' }" />

    <TBox :x="0" :y="6" :w="cols - 4" :h="rows - 9" border title="Logs" :padding="0">
      <TLogView
        :x="0"
        :y="0"
        :w="cols - 6"
        :h="rows - 11"
        :source="store.source"
        :version="logVersion"
        :search-query="query"
        :search-options="{ mode: 'text', caseSensitive: false }"
        wrap
        linkify
        :style="{ fg: 'whiteBright' }"
        :match-style="{ fg: '#111827', bg: '#facc15', bold: true }"
        @search="onSearch"
      />
    </TBox>
  </TBox>
</template>
