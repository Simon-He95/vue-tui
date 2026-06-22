<script setup lang="ts">
import { computed } from "vue";
import { TBox, TText } from "@simon_he/vue-tui";
import { TFlex, TFlexItem, useLayout, type TFlexMeasure } from "@simon_he/vue-tui/vue";

const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 88);
const rows = computed(() => layout.clipRect?.h ?? 26);
const shellW = computed(() => Math.max(1, cols.value));
const shellH = computed(() => Math.max(1, rows.value));

const bodyDirection = computed(() => (shellW.value < 72 ? "column" : "row"));

const panelMeasure: TFlexMeasure = ({ maxWidth, maxHeight }) => ({
  width: Math.min(maxWidth, 18),
  height: Math.min(maxHeight, 5),
});

const cards = [
  { label: "Build", value: "86%", style: { fg: "greenBright" } },
  { label: "Tests", value: "124", style: { fg: "cyanBright" } },
  { label: "Alerts", value: "3", style: { fg: "yellowBright" } },
  { label: "Queue", value: "17", style: { fg: "magentaBright" } },
];

const navItems = ["Overview", "Deploys", "Logs", "Settings"];
const activity = ["typecheck passed", "docs generated", "terminal smoke queued", "PR review ready"];
</script>

<template>
  <TFlex
    :x="0"
    :y="0"
    :w="shellW"
    :h="shellH"
    direction="column"
    :gap="1"
    :padding-x="1"
    :padding-y="1"
  >
    <TFlexItem :height="3">
      <template #default="{ rect }">
        <TBox :x="0" :y="0" :w="rect.w" :h="rect.h" border title="TFlex workspace" :padding="0">
          <TText
            :x="1"
            :y="1"
            :w="Math.max(1, rect.w - 2)"
            value="Header / content / footer without precomputed child rects"
          />
        </TBox>
      </template>
    </TFlexItem>

    <TFlexItem :grow="1" :min-height="9">
      <template #default="{ rect }">
        <TFlex
          :x="0"
          :y="0"
          :w="rect.w"
          :h="rect.h"
          :direction="bodyDirection"
          :gap="1"
          :row-gap="1"
          :column-gap="2"
          align-items="stretch"
          align-content="stretch"
          wrap
        >
          <TFlexItem :basis="bodyDirection === 'row' ? '24%' : 4" :min-width="18" :order="1">
            <template #default="{ rect: navRect }">
              <TBox :x="0" :y="0" :w="navRect.w" :h="navRect.h" border title="Nav" :padding="1">
                <TText
                  v-for="(item, index) in navItems"
                  :key="item"
                  :x="0"
                  :y="index"
                  :w="Math.max(1, navRect.w - 2)"
                  :value="index === 0 ? `▶ ${item}` : `  ${item}`"
                  :style="{ fg: index === 0 ? 'cyanBright' : 'whiteBright' }"
                />
              </TBox>
            </template>
          </TFlexItem>

          <TFlexItem :grow="2" :min-width="28" :order="2">
            <template #default="{ rect: mainRect }">
              <TBox :x="0" :y="0" :w="mainRect.w" :h="mainRect.h" border title="Main" :padding="1">
                <TFlex
                  :x="0"
                  :y="0"
                  :w="Math.max(0, mainRect.w - 4)"
                  :h="Math.max(0, mainRect.h - 4)"
                  direction="row"
                  :column-gap="2"
                  :row-gap="1"
                  wrap
                  align-items="start"
                  align-content="stretch"
                >
                  <TFlexItem
                    v-for="(card, index) in cards"
                    :key="card.label"
                    :width="'45%'"
                    :min-width="14"
                    :height="3"
                    :margin-bottom="1"
                    :order="index === 2 ? 4 : index"
                  >
                    <template #default="{ rect: cardRect }">
                      <TBox
                        :x="0"
                        :y="0"
                        :w="cardRect.w"
                        :h="cardRect.h"
                        border
                        :padding="0"
                        :style="card.style"
                      >
                        <TText
                          :x="1"
                          :y="0"
                          :w="Math.max(1, cardRect.w - 2)"
                          :value="card.label"
                          :style="{ dim: true }"
                        />
                        <TText
                          :x="1"
                          :y="1"
                          :w="Math.max(1, cardRect.w - 2)"
                          :value="card.value"
                          :style="{ ...card.style, bold: true }"
                        />
                      </TBox>
                    </template>
                  </TFlexItem>
                </TFlex>
              </TBox>
            </template>
          </TFlexItem>

          <TFlexItem
            :basis="bodyDirection === 'row' ? '24%' : undefined"
            :measure="panelMeasure"
            :min-width="18"
            :order="3"
          >
            <template #default="{ rect: sideRect }">
              <TBox
                :x="0"
                :y="0"
                :w="sideRect.w"
                :h="sideRect.h"
                border
                title="Activity"
                :padding="1"
              >
                <TText
                  v-for="(item, index) in activity"
                  :key="item"
                  :x="0"
                  :y="index"
                  :w="Math.max(1, sideRect.w - 2)"
                  :value="`• ${item}`"
                  :style="{ fg: index === 0 ? 'greenBright' : 'whiteBright' }"
                />
              </TBox>
            </template>
          </TFlexItem>
        </TFlex>
      </template>
    </TFlexItem>

    <TFlexItem :height="1">
      <template #default="{ rect }">
        <TFlex
          :x="0"
          :y="0"
          :w="rect.w"
          :h="rect.h"
          direction="row"
          justify-content="space-between"
        >
          <TFlexItem :width="18">
            <TText :x="0" :y="0" value="status: responsive" :style="{ fg: 'greenBright' }" />
          </TFlexItem>
          <TFlexItem :width="24">
            <TText
              :x="0"
              :y="0"
              :value="`${bodyDirection} ${shellW}x${shellH}`"
              :style="{ fg: 'cyanBright' }"
            />
          </TFlexItem>
        </TFlex>
      </template>
    </TFlexItem>
  </TFlex>
</template>
