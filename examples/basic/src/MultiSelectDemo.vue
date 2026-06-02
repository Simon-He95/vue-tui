<script setup lang="ts">
import { computed, ref } from "vue";
import { TBox, TSelect, TText } from "@simon_he/vue-tui";
import { useLayout } from "@simon_he/vue-tui/vue";

const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 0);
const rows = computed(() => layout.clipRect?.h ?? 0);
const props = defineProps<{
  exit?: () => void;
}>();

const options = [
  {
    label:
      "AppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleApple",
    detail: "fruit",
  },
  { label: "Banana", detail: "fruit" },
  { label: "Carrot", detail: "vegetable" },
  { label: "Duck", detail: "meat" },
  { label: "Egg", detail: "protein" },
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

const selectedIndices = ref<number[]>([1, 3]);
const selectedValues = computed(
  () => selectedIndices.value.map((i) => options[i]?.label).filter(Boolean) as string[],
);
const confirmedValues = ref<string[]>([]);

const cardPadding = 1;
const cardW = computed(() => clamp(cols.value - 4, 34, 76));
const cardH = computed(() => clamp(rows.value - 4, 14, 22));
const cardX = computed(() => Math.max(0, Math.floor((cols.value - cardW.value) / 2)));
const cardY = computed(() => Math.max(0, Math.floor((rows.value - cardH.value) / 3)));

const contentW = computed(() => Math.max(0, cardW.value - 2 - cardPadding * 2));
const contentH = computed(() => Math.max(0, cardH.value - 2 - cardPadding * 2));

const headerH = 4; // title + help + selected + separator
const footerH = 2; // confirmed + indices
const selectVisibleH = computed(() => {
  const available = Math.max(3, contentH.value - headerH - footerH - 2); // minus inner box border
  return Math.min(options.length, available);
});
const selectBoxH = computed(() => Math.max(3, selectVisibleH.value + 2));

function onClose() {
  props.exit?.();
}

function onChange(values: string[]) {
  // Values are already reflected by v-model; keep handler for demo wiring.
  void values;
}

function onConfirm(values: string[]) {
  confirmedValues.value = values;
}
</script>

<template>
  <TBox :x="0" :y="0" :w="cols" :h="rows" :border="false" :padding="0" :style="{ bg: 'black' }">
    <TBox
      :x="cardX"
      :y="cardY"
      :w="cardW"
      :h="cardH"
      border
      title="Multi-select"
      :padding="cardPadding"
      :style="{ fg: 'cyanBright', bg: 'black' }"
    >
      <TText
        :x="0"
        :y="0"
        :w="contentW"
        value="TSelect • multiple"
        :style="{ fg: 'cyanBright', bold: true, bg: 'black' }"
      />
      <TText
        :x="0"
        :y="1"
        :w="contentW"
        value="↑/↓ Move   Space Toggle   Enter Confirm   Esc Exit"
        :style="{ dim: true, bg: 'black' }"
      />
      <TText
        :x="0"
        :y="2"
        :w="contentW"
        :value="`Selected: ${selectedValues.join(', ') || '(none)'}`"
        :style="{ fg: 'yellowBright', bg: 'black' }"
      />
      <TText
        :x="0"
        :y="3"
        :w="contentW"
        :value="'─'.repeat(Math.max(0, contentW))"
        :style="{ dim: true, bg: 'black' }"
      />

      <TBox
        :x="0"
        :y="4"
        :w="contentW"
        :h="selectBoxH"
        border
        title="Options"
        :padding="0"
        :style="{ fg: 'whiteBright', dim: true, bg: 'black' }"
      >
        <TSelect
          :x="0"
          :y="0"
          :w="Math.max(0, contentW - 2)"
          :h="selectVisibleH"
          :options="options"
          multiple
          v-model="selectedIndices"
          autoFocus
          closeOnBlur
          :style="{ fg: 'whiteBright', bg: 'black' }"
          :highlightStyle="{ fg: '#111827', bg: '#5eead4', bold: true }"
          @close="onClose"
          @change="onChange"
          @confirm="onConfirm"
        />
      </TBox>

      <TText
        :x="0"
        :y="4 + selectBoxH"
        :w="contentW"
        :value="`Confirmed: ${confirmedValues.join(', ') || '(none)'}`"
        :style="{ fg: 'greenBright', bg: 'black' }"
      />
      <TText
        :x="0"
        :y="5 + selectBoxH"
        :w="contentW"
        :value="`Indices: [${selectedIndices.join(', ')}]`"
        :style="{ dim: true, bg: 'black' }"
      />
    </TBox>
  </TBox>
</template>
