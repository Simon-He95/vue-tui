<script setup lang="ts">
import { computed } from "vue";
import { TBox, TText } from "@simon_he/vue-tui";
import {
  TCandlestickChart,
  TContributionGraph,
  TLineChart,
  TPieChart,
} from "@simon_he/vue-tui/experimental";
import { useLayout } from "@simon_he/vue-tui/vue";

const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 90);
const rows = computed(() => layout.clipRect?.h ?? 26);
const innerW = computed(() => Math.max(1, cols.value - 4));
const leftW = computed(() => Math.max(28, Math.floor(innerW.value * 0.58)));
const rightW = computed(() => Math.max(10, innerW.value - leftW.value - 2));
const lowerY = computed(() => Math.min(12, Math.max(10, rows.value - 9)));
const lowerH = computed(() => Math.max(6, rows.value - lowerY.value - 3));
const summaryText = computed(() =>
  cols.value < 56
    ? "Agent tokens, trend, candles, mix."
    : "Agent token usage, trend, market-style candles, and token mix.",
);
const contributionTitle = computed(() =>
  leftW.value < 36 ? "Contrib: tokens/turn" : "ContributionGraph: tokens per turn",
);
const candleTitle = computed(() => (rightW.value < 14 ? "OHLC" : "Candles"));

const usageValues = Array.from({ length: 18 * 7 }, (_, index) =>
  index % 13 === 0 ? 0 : ((index * 9) % 31) + 2,
);
const usageLabels = usageValues.map((_, index) => `turn ${index + 1}`);
const trendValues = [18, 24, 21, 30, 44, 40, 58, 53, 62, 76, 70, 88, 92, 84, 99, 110, 104];
const trendLabels = trendValues.map((_, index) => `turn ${index + 1}`);
const candles = [
  { open: 34, high: 42, low: 28, close: 39 },
  { open: 39, high: 48, low: 36, close: 45 },
  { open: 45, high: 47, low: 32, close: 35 },
  { open: 35, high: 52, low: 34, close: 50 },
  { open: 50, high: 58, low: 44, close: 47 },
  { open: 47, high: 60, low: 43, close: 56 },
  { open: 56, high: 68, low: 52, close: 63 },
  { open: 63, high: 66, low: 54, close: 57 },
  { open: 57, high: 74, low: 55, close: 71 },
  { open: 71, high: 79, low: 64, close: 75 },
];
const candleLabels = candles.map((_, index) => `session ${index + 1}`);
const tokenSegments = [58, 29, 13];
const tokenSegmentLabels = ["prompt", "output", "cache"];
</script>

<template>
  <TBox
    :x="0"
    :y="0"
    :w="cols"
    :h="rows"
    border
    title="Charts Dashboard"
    :padding="1"
    :style="{ fg: 'whiteBright' }"
  >
    <TText
      :x="0"
      :y="0"
      :w="innerW"
      :value="summaryText"
      :style="{ fg: 'cyanBright', bold: true }"
    />

    <TText :x="0" :y="2" :w="leftW" :value="contributionTitle" />
    <TContributionGraph
      :x="0"
      :y="3"
      :w="leftW"
      :values="usageValues"
      :labels="usageLabels"
      unit="tokens"
      :rows="7"
      :columns="18"
      :max="32"
    />

    <TText :x="leftW + 2" :y="2" :w="rightW" value="Token mix" />
    <TPieChart
      :x="leftW + 2"
      :y="3"
      :w="Math.min(18, rightW)"
      :h="8"
      :values="tokenSegments"
      :labels="tokenSegmentLabels"
      :segment-styles="[{ fg: 'cyanBright' }, { fg: 'magentaBright' }, { fg: 'yellowBright' }]"
    />

    <TBox :x="0" :y="lowerY" :w="leftW" :h="lowerH" border title="Line" :padding="1">
      <TLineChart
        :x="0"
        :y="0"
        :w="Math.max(1, leftW - 4)"
        :h="Math.max(1, lowerH - 4)"
        :values="trendValues"
        :labels="trendLabels"
        unit="tokens"
        :line-style="{ fg: 'greenBright' }"
        y-label="tokens"
        start-label="turn 1"
        end-label="turn 17"
      />
    </TBox>

    <TBox
      :x="leftW + 2"
      :y="lowerY"
      :w="rightW"
      :h="lowerH"
      border
      :title="candleTitle"
      :padding="1"
    >
      <TCandlestickChart
        :x="0"
        :y="0"
        :w="Math.max(1, rightW - 4)"
        :h="Math.max(1, lowerH - 4)"
        :candles="candles"
        :labels="candleLabels"
        y-label="price"
        start-label="open"
        end-label="latest"
      />
    </TBox>
  </TBox>
</template>
