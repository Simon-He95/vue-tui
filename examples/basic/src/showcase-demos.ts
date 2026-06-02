import type { Component } from "vue";
import { markRaw } from "vue";
import CommandCenterDemo from "./CommandCenterDemo.vue";
import DeployRunnerDemo from "./DeployRunnerDemo.vue";
import Demo from "./Demo.vue";
import Essay30Demo from "./Essay30Demo.vue";
import EssayDemo from "./EssayDemo.vue";
import LogExplorerDemo from "./LogExplorerDemo.vue";
import MiniAgentShellDemo from "./MiniAgentShellDemo.vue";
import MultilinePasteDemo from "./MultilinePasteDemo.vue";
import MultiSelectDemo from "./MultiSelectDemo.vue";
import SnakeDemo from "./SnakeDemo.vue";
import TableDemo from "./TableDemo.vue";

export type ShowcaseDemo = {
  id: string;
  label: string;
  summary: string;
  cols: number;
  rows: number;
  component: Component;
  defaultStyle: Record<string, unknown>;
};

export const showcaseDemos: ShowcaseDemo[] = [
  {
    id: "command-center",
    label: "Command Center",
    summary: "Command palette、快捷键和近期动作流。",
    cols: 82,
    rows: 24,
    component: markRaw(CommandCenterDemo),
    defaultStyle: { fg: "whiteBright", bg: "black" },
  },
  {
    id: "snake",
    label: "贪吃蛇",
    summary: "键盘事件、cell rendering、游戏循环和局部状态刷新。",
    cols: 64,
    rows: 26,
    component: markRaw(SnakeDemo),
    defaultStyle: { fg: "whiteBright", bg: "black" },
  },
  {
    id: "deploy-runner",
    label: "Deploy Runner",
    summary: "命令选择、任务进度、状态栏和流式输出。",
    cols: 86,
    rows: 26,
    component: markRaw(DeployRunnerDemo),
    defaultStyle: { fg: "whiteBright", bg: "black" },
  },
  {
    id: "log-explorer",
    label: "Log Explorer",
    summary: "TLogView 日志检索、匹配高亮、链接识别和追加日志。",
    cols: 90,
    rows: 26,
    component: markRaw(LogExplorerDemo),
    defaultStyle: { fg: "whiteBright", bg: "black" },
  },
  {
    id: "agent-shell",
    label: "Agent Shell",
    summary: "迷你 agent transcript、tool call、输入框和 command palette。",
    cols: 86,
    rows: 28,
    component: markRaw(MiniAgentShellDemo),
    defaultStyle: { fg: "whiteBright", bg: "black" },
  },
  {
    id: "basic",
    label: "基础交互",
    summary: "v-if / v-show / v-for、输入、选择器、弹层和鼠标事件。",
    cols: 70,
    rows: 22,
    component: markRaw(Demo),
    defaultStyle: { fg: "whiteBright" },
  },
  {
    id: "table",
    label: "表格",
    summary: "带边框的 terminal table、状态颜色和行统计。",
    cols: 60,
    rows: 16,
    component: markRaw(TableDemo),
    defaultStyle: { fg: "whiteBright" },
  },
  {
    id: "multi-select",
    label: "多选",
    summary: "TSelect multiple 的键盘选择、确认和长文本裁剪。",
    cols: 70,
    rows: 22,
    component: markRaw(MultiSelectDemo),
    defaultStyle: { fg: "whiteBright", bg: "black" },
  },
  {
    id: "multiline-paste",
    label: "多行粘贴",
    summary: "TInput 多行粘贴 chip、点击预览和 modal 展示。",
    cols: 70,
    rows: 22,
    component: markRaw(MultilinePasteDemo),
    defaultStyle: { fg: "whiteBright" },
  },
  {
    id: "essay-20",
    label: "20字小作文",
    summary: "中文输入、字符统计和确认更新。",
    cols: 80,
    rows: 24,
    component: markRaw(EssayDemo),
    defaultStyle: { fg: "whiteBright" },
  },
  {
    id: "essay-30",
    label: "30字小作文",
    summary: "预设生成、进度条和状态反馈。",
    cols: 80,
    rows: 26,
    component: markRaw(Essay30Demo),
    defaultStyle: { fg: "whiteBright" },
  },
];
