import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

if (new URLSearchParams(window.location.search).has("profile")) {
  (globalThis as any).__VT_DEBUG_PERF__ = true;
}

createApp(App).mount("#app");
