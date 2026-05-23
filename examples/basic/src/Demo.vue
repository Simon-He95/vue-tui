<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { TBox, TDialog, TInput, TSelect, TText, TView } from "@simon_he/vue-tui";
import { useLayout } from "@simon_he/vue-tui/vue";
import { wrapByCells } from "../../shared/text-utils";

const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 0);
const rows = computed(() => layout.clipRect?.h ?? 0);

const leftW = 30;
const contentW = computed(() => Math.max(0, cols.value - 4));
const contentH = computed(() => Math.max(0, rows.value - 4));
const rightX = computed(() => leftW + 1);
const rightW = computed(() => Math.max(0, contentW.value - rightX.value));

const count = ref(0);
const showHint = ref(true);
const status = ref("Click the button area to focus, then press Enter to open select.");
const inputValue = ref("");
const boxTitle = computed(() => `vue-terminal demo • count=${count.value}`);

type TodoItem = { id: number; text: string };
let nextTodoId = 1;
const showTodos = ref(true);
const todoInput = ref("");
const todos = ref<TodoItem[]>([
  { id: nextTodoId++, text: "Try add/delete todos" },
  { id: nextTodoId++, text: "This list is rendered via v-for" },
]);
const todoViewportH = computed(() => Math.max(0, contentH.value - 7));

type TodoRow = Readonly<{
  rowId: string;
  todo: TodoItem;
  first: boolean;
  text: string;
}>;

const todoTextW = computed(() => Math.max(0, rightW.value - 9));
const todoScrollTop = ref(0); // row-based
const todoRows = computed<TodoRow[]>(() => {
  const w = todoTextW.value;
  const avail = Math.max(0, w - 2);
  const out: TodoRow[] = [];
  for (const t of todos.value) {
    const safe = t.text.replace(/\r/g, "").replace(/\n/g, " ");
    const parts = avail > 0 ? wrapByCells(safe, avail) : [""];
    if (!parts.length) parts.push("");
    for (let i = 0; i < parts.length; i++) {
      const first = i === 0;
      const prefix = first ? "• " : "  ";
      out.push({
        rowId: `${t.id}:${i}`,
        todo: t,
        first,
        text: `${prefix}${parts[i] ?? ""}`,
      });
    }
  }
  return out;
});
const todoMaxScrollTop = computed(() => Math.max(0, todoRows.value.length - todoViewportH.value));
const visibleTodoRows = computed(() =>
  todoRows.value.slice(todoScrollTop.value, todoScrollTop.value + todoViewportH.value),
);

const showSelect = ref(false);
const selectX = ref(40);
const selectY = ref(10);
const selectOptions = ref<string[]>(["Option A", "Option B", "Option C"]);
const selected = ref(0);
const committed = ref("");

const confirmDeleteOpen = ref(false);
const pendingDelete = ref<TodoItem | null>(null);

const popupW = 26;
const popupInnerW = computed(() => Math.max(0, popupW - 2));
const popupSelectH = computed(() => Math.min(5, Math.max(1, selectOptions.value.length)));
const popupPreviewText = computed(() => {
  const label = selectOptions.value[selected.value] ?? "";
  const body = committed.value || "";
  return label ? `${label}:\n${body}` : body;
});
const popupPreviewLines = computed(() =>
  popupInnerW.value > 0 ? wrapByCells(popupPreviewText.value, popupInnerW.value) : [""],
);
const popupMaxH = computed(() => Math.max(5, rows.value - selectY.value - 1));
const popupPreviewH = computed(() => {
  const fixed = 2 + popupSelectH.value + 1; // border + select + separator
  const max = Math.max(1, popupMaxH.value - fixed);
  return Math.min(max, Math.max(1, popupPreviewLines.value.length));
});
const popupH = computed(() =>
  Math.min(popupMaxH.value, 2 + popupSelectH.value + 1 + popupPreviewH.value),
);

function addTodo(v: string) {
  const text = v.trim();
  if (!text) return;
  const wasAtBottom = todoScrollTop.value >= todoMaxScrollTop.value;
  todos.value = [...todos.value, { id: nextTodoId++, text }];
  todoInput.value = "";
  if (wasAtBottom) todoScrollTop.value = todoMaxScrollTop.value;
}

function closeDeleteConfirm() {
  confirmDeleteOpen.value = false;
  pendingDelete.value = null;
}

function requestDeleteTodo(id: number) {
  const item = todos.value.find((t) => t.id === id) ?? null;
  if (!item) return;
  pendingDelete.value = item;
  confirmDeleteOpen.value = true;
}

function removeTodo(id: number) {
  todos.value = todos.value.filter((t) => t.id !== id);
}

function confirmDeleteTodo() {
  const item = pendingDelete.value;
  if (!item) return closeDeleteConfirm();
  removeTodo(item.id);
  closeDeleteConfirm();
}

function onTodoWheel(e: any) {
  const delta = e?.deltaY ?? 0;
  if (!delta) return;
  const dir = delta > 0 ? 1 : -1;
  todoScrollTop.value = Math.max(0, Math.min(todoMaxScrollTop.value, todoScrollTop.value + dir));
}

function onTodoListClick(e: any) {
  const rect = e?.currentTarget?.rect;
  if (!rect) return;
  const relY = e.cellY - rect.y;
  const idx = todoScrollTop.value + relY;
  const row = todoRows.value[idx];
  if (!row) return;
  const relX = e.cellX - rect.x;
  const deleteX = rightW.value - 9;
  if (relX >= deleteX && relX < deleteX + 5 && row.first) {
    status.value = `Confirm delete: ${row.todo.text}`;
    requestDeleteTodo(row.todo.id);
    return;
  }
  status.value = `Selected todo: ${row.todo.text}`;
}

watch([() => todoRows.value.length, () => todoViewportH.value], () => {
  todoScrollTop.value = Math.max(0, Math.min(todoMaxScrollTop.value, todoScrollTop.value));
});

watch(confirmDeleteOpen, (open) => {
  if (!open) pendingDelete.value = null;
});

function openSelect(options: string[]) {
  selectOptions.value = options;
  selected.value = 0;
  showSelect.value = true;
}

function closeSelect() {
  showSelect.value = false;
}

function onPick(v: string | null) {
  status.value = `Selected: ${v ?? ""}`;
  closeSelect();
}

function onButtonClick() {
  count.value++;
  status.value = "Clicked! Now press Enter to open select.";
}

function onButtonKeydown(e: any) {
  if (e.key === "Enter") openSelect(["Option A", "Option B", "Option C"]);
  if (e.key === "h" || e.key === "H") showHint.value = !showHint.value;
  if (e.key === "t" || e.key === "T") showTodos.value = !showTodos.value;
}

function onInputCommit(v: string) {
  committed.value = v;
  openSelect(["Run", "Search", "Help"]);
}

function onOverlayKeydown(e: any) {
  if (e.key === "Escape") closeSelect();
}

function onDialogConfirm(btn: any) {
  if (btn?.value === "yes") confirmDeleteTodo();
  else closeDeleteConfirm();
}
</script>

<template>
  <TBox
    :x="0"
    :y="0"
    :w="cols"
    :h="rows"
    border
    :title="boxTitle"
    :padding="1"
    :style="{ fg: 'magentaBright' }"
  >
    <TText :x="0" :y="0" :w="leftW" :value="status" :style="{ fg: 'blueBright' }" />
    <TText
      :x="0"
      :y="2"
      :w="leftW"
      :value="`Reactive count: ${count}`"
      :style="{ fg: 'greenBright' }"
    />

    <TText
      v-show="showHint"
      :x="0"
      :y="3"
      :w="leftW"
      :value="'(v-show) Hint: press H to toggle this line'"
      :style="{ fg: 'redBright' }"
    />
    <TText
      v-for="(line, i) in [
        `v-if: overlay=${showSelect} • todoPanel=${showTodos}`,
        `v-show: hint=${showHint}`,
        `v-for: helpLines=${3} • todos=${todos.length}`,
      ]"
      :key="i"
      :x="0"
      :y="4 + i"
      :w="leftW"
      :value="line"
      :style="{ fg: 'blueBright' }"
    />

    <TView
      :x="0"
      :y="8"
      :w="28"
      :h="5"
      :zIndex="10"
      focusable
      @click="onButtonClick"
      @keydown="onButtonKeydown"
    >
      <TBox
        :x="0"
        :y="0"
        :w="28"
        :h="5"
        border
        title="Button Area"
        :padding="0"
        :style="{ fg: 'redBright' }"
      >
        <TText :x="0" :y="0" value="Click to focus" />
        <TText :x="0" :y="1" value="Enter: open select" />
        <TText :x="0" :y="2" value="H: hint • T: todos" />
      </TBox>
    </TView>

    <TBox
      :x="0"
      :y="rows - 9"
      :w="leftW"
      :h="5"
      border
      title="Input"
      :padding="0"
      :style="{ fg: 'yellowBright' }"
    >
      <TInput
        :x="0"
        :y="0"
        :w="leftW - 2"
        :h="3"
        v-model="inputValue"
        placeholder="Type here (Shift+Enter/Ctrl+J = newline, Enter = open select)"
        @change="onInputCommit"
        @keydown="
          (e) => {
            if (e.key === 'h' || e.key === 'H') showHint = !showHint;
          }
        "
      />
    </TBox>

    <TBox
      v-if="showTodos"
      :x="rightX"
      :y="0"
      :w="rightW"
      :h="contentH"
      border
      title="Todos (v-for)"
      :padding="1"
      :style="{ fg: 'blueBright' }"
    >
      <TText
        :x="0"
        :y="0"
        :w="rightW - 4"
        value="Enter: add • Click del: remove"
        :style="{ dim: true }"
      />
      <TInput
        :x="0"
        :y="1"
        :w="rightW - 4"
        v-model="todoInput"
        placeholder="New todo..."
        @change="addTodo"
      />

      <TText
        v-if="todos.length === 0"
        :x="0"
        :y="3"
        :w="rightW - 4"
        value="(empty)"
        :style="{ dim: true }"
      />
      <template v-else>
        <TView
          :x="0"
          :y="3"
          :w="rightW - 4"
          :h="todoViewportH"
          @wheel="onTodoWheel"
          @click="onTodoListClick"
        />

        <template v-for="(r, i) in visibleTodoRows" :key="r.rowId">
          <TText :x="0" :y="3 + i" :w="todoTextW" :value="r.text" />
          <TText
            :x="rightW - 9"
            :y="3 + i"
            :w="5"
            :value="r.first ? '[del]' : ''"
            :style="r.first ? { fg: 'redBright', bold: true } : undefined"
          />
        </template>
      </template>
    </TBox>

    <TDialog
      v-model="confirmDeleteOpen"
      :w="34"
      :h="9"
      title="Confirm"
      :style="{ fg: 'redBright' }"
      placement="center"
      teleport
      :buttons="[
        { label: 'Yes', value: 'yes', kind: 'danger', default: true },
        { label: 'No', value: 'no' },
      ]"
      @confirm="onDialogConfirm"
      @close="closeDeleteConfirm"
    >
      <TText
        :x="0"
        :y="0"
        :w="30"
        :value="pendingDelete ? `Delete: ${pendingDelete.text}` : 'Delete item?'"
        :style="{ fg: 'whiteBright' }"
      />
      <TText :x="0" :y="1" :w="30" value="This action cannot be undone." :style="{ dim: true }" />
      <TText
        :x="0"
        :y="3"
        :w="30"
        value="←/→ select • Enter confirm • Click outside to cancel"
        :style="{ dim: true }"
      />
    </TDialog>

    <TView
      v-if="showSelect"
      :x="0"
      :y="0"
      :w="cols"
      :h="rows"
      :zIndex="999"
      focusable
      @click="closeSelect"
      @keydown="onOverlayKeydown"
    >
      <TBox
        :x="selectX"
        :y="selectY"
        :w="popupW"
        :h="popupH"
        border
        title="Popup"
        :padding="0"
        :style="{ fg: 'cyanBright' }"
      >
        <TSelect
          :x="0"
          :y="0"
          :w="popupW - 2"
          :h="popupSelectH"
          :options="selectOptions"
          v-model="selected"
          autoFocus
          closeOnBlur
          @change="onPick"
          @close="closeSelect"
        />
        <TText
          :x="0"
          :y="popupSelectH"
          :w="popupW - 2"
          :value="'─'.repeat(Math.max(0, popupW - 2))"
          :style="{ dim: true }"
        />
        <TText
          :x="0"
          :y="popupSelectH + 1"
          :w="popupW - 2"
          :h="popupPreviewH"
          wrap
          :value="popupPreviewText"
        />
      </TBox>
    </TView>
  </TBox>
</template>
