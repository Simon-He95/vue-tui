<script setup lang="ts">
import { computed, ref } from "vue";
import { TBox, TText } from "@simon_he/vue-tui";
import { useLayout } from "@simon_he/vue-tui/vue";

const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 0);
const rows = computed(() => layout.clipRect?.h ?? 0);

// 表格数据
interface TableRow {
  id: number;
  name: string;
  role: string;
  status: "active" | "inactive" | "pending";
  score: number;
}

const tableData = ref<TableRow[]>([
  { id: 1, name: "Alice Chen", role: "Engineer", status: "active", score: 95 },
  { id: 2, name: "Bob Wang", role: "Designer", status: "active", score: 88 },
  { id: 3, name: "Carol Liu", role: "Manager", status: "pending", score: 92 },
  { id: 4, name: "David Zhang", role: "Engineer", status: "inactive", score: 76 },
  { id: 5, name: "Eve Li", role: "Analyst", status: "active", score: 98 },
  { id: 6, name: "Frank Zhao", role: "Designer", status: "active", score: 85 },
  { id: 7, name: "Grace Wu", role: "Engineer", status: "pending", score: 91 },
  { id: 8, name: "Henry Sun", role: "Manager", status: "active", score: 89 },
]);

// 列配置
const columns = [
  { key: "id", title: "ID", width: 4 },
  { key: "name", title: "Name", width: 14 },
  { key: "role", title: "Role", width: 10 },
  { key: "status", title: "Status", width: 10 },
  { key: "score", title: "Score", width: 6 },
];

const totalWidth = computed(() => columns.reduce((sum, col) => sum + col.width + 1, 1));

// 状态颜色映射
function getStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "greenBright";
    case "inactive":
      return "redBright";
    case "pending":
      return "yellowBright";
    default:
      return "white";
  }
}

function getScoreColor(score: number): string {
  if (score >= 90) return "greenBright";
  if (score >= 80) return "yellowBright";
  return "redBright";
}

// 截断文本
function truncate(text: string, width: number): string {
  if (text.length <= width) return text.padEnd(width, " ");
  return text.slice(0, width - 1) + "…";
}
</script>

<template>
  <TBox
    :x="0"
    :y="0"
    :w="cols"
    :h="rows"
    border
    title="User Table Demo"
    :padding="1"
    :style="{ fg: 'whiteBright' }"
  >
    <!-- 表头 -->
    <TBox
      :x="0"
      :y="0"
      :w="totalWidth"
      :h="3"
      border
      title="Headers"
      :padding="0"
      :style="{ fg: 'cyanBright', bold: true }"
    >
      <TText
        :x="1"
        :y="0"
        :value="columns.map((col) => truncate(col.title, col.width)).join(' │ ')"
        :style="{ fg: 'cyanBright', bold: true }"
      />
      <TText
        :x="1"
        :y="1"
        :w="totalWidth - 2"
        :value="'─'.repeat(totalWidth - 2)"
        :style="{ dim: true }"
      />
    </TBox>

    <!-- 表格内容 -->
    <TBox
      :x="0"
      :y="4"
      :w="totalWidth"
      :h="rows - 6"
      border
      title="Data"
      :padding="0"
      :style="{ fg: 'white' }"
    >
      <template v-for="(row, index) in tableData" :key="row.id">
        <TText
          :x="1"
          :y="index"
          :w="4"
          :value="String(row.id).padStart(2, ' ')"
          :style="{ fg: 'blueBright' }"
        />
        <TText :x="6" :y="index" :w="14" :value="truncate(row.name, 14)" />
        <TText
          :x="21"
          :y="index"
          :w="10"
          :value="truncate(row.role, 10)"
          :style="{ fg: 'magentaBright' }"
        />
        <TText
          :x="32"
          :y="index"
          :w="10"
          :value="truncate(row.status, 10)"
          :style="{ fg: getStatusColor(row.status) }"
        />
        <TText
          :x="43"
          :y="index"
          :w="6"
          :value="String(row.score).padStart(3, ' ')"
          :style="{ fg: getScoreColor(row.score) }"
        />
      </template>
    </TBox>

    <!-- 统计信息 -->
    <TText
      :x="0"
      :y="rows - 1"
      :w="cols"
      :value="`Total: ${tableData.length} rows | Active: ${tableData.filter((r) => r.status === 'active').length} | Pending: ${tableData.filter((r) => r.status === 'pending').length}`"
      :style="{ fg: 'gray', dim: true }"
    />
  </TBox>
</template>
