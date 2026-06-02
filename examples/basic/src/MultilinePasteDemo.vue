<script setup lang="ts">
import { ref } from "vue";
import { TBox, TInput, TText } from "@simon_he/vue-tui";
import { TMultilineModal } from "@simon_he/vue-tui/vue";

const inputValue = ref("");
const multilineTexts = ref<string[]>([]);
const mentions = ref<string[]>([]);

const modalVisible = ref(false);
const modalContent = ref("");
const modalTitle = ref("Multiline Text");

function handleMultilineClick(index: number) {
  const text = multilineTexts.value[index];
  if (text) {
    modalContent.value = text;
    const lineCount = (text.match(/\n/g) || []).length + 1;
    modalTitle.value = `Multiline Text (${lineCount} lines)`;
    modalVisible.value = true;
  }
}

function handleModalClose() {
  modalVisible.value = false;
}
</script>

<template>
  <TBox :x="0" :y="0" :w="70" :h="22" title="Multi-line Paste Test" :padding="1">
    <TText :x="0" :y="0" :w="66" :h="1" value="Try pasting single-line or multi-line text below:" />
    <TText
      :x="0"
      :y="1"
      :w="66"
      :h="1"
      value="- Single line: inserted directly"
      :style="{ dim: true }"
    />
    <TText
      :x="0"
      :y="2"
      :w="66"
      :h="1"
      value="- Multi-line (≥2 lines): shown as [... x lines] chip"
      :style="{ dim: true }"
    />
    <TText
      :x="0"
      :y="3"
      :w="66"
      :h="1"
      value="- Click chip to view full content in modal"
      :style="{ dim: true }"
    />
    <TText
      :x="0"
      :y="4"
      :w="66"
      :h="1"
      value="- Backspace at start deletes chips (newest first)"
      :style="{ dim: true }"
    />

    <TText :x="0" :y="6" :w="66" :h="1" value="Input:" :style="{ bold: true }" />
    <TInput
      :x="0"
      :y="7"
      :w="66"
      :h="3"
      v-model="inputValue"
      v-model:multiline-texts="multilineTexts"
      v-model:mentions="mentions"
      :collapse-multiline="true"
      placeholder="Paste text here..."
      :auto-focus="true"
      @multiline-click="handleMultilineClick"
    />

    <TText :x="0" :y="11" :w="66" :h="1" value="Current input value:" :style="{ bold: true }" />
    <TText :x="0" :y="12" :w="66" :h="1" :value="`'${inputValue}'`" :style="{ fg: 'cyan' }" />

    <TText :x="0" :y="14" :w="66" :h="1" value="Multiline texts stored:" :style="{ bold: true }" />
    <TText
      :x="0"
      :y="15"
      :w="66"
      :h="1"
      :value="`${multilineTexts.length} items`"
      :style="{ fg: 'yellow' }"
    />

    <TText
      :x="0"
      :y="17"
      :w="66"
      :h="1"
      value="Test instructions:"
      :style="{ bold: true, fg: 'green' }"
    />
    <TText
      :x="0"
      :y="18"
      :w="66"
      :h="1"
      value="1. Copy and paste: 'Hello World' (single line)"
      :style="{ dim: true }"
    />
    <TText
      :x="0"
      :y="19"
      :w="66"
      :h="1"
      value="2. Copy and paste multi-line code or text"
      :style="{ dim: true }"
    />
  </TBox>

  <TMultilineModal
    :visible="modalVisible"
    :content="modalContent"
    :title="modalTitle"
    @close="handleModalClose"
  />
</template>
