import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

const search = new URLSearchParams(window.location.search);
if (search.has("profile")) {
  (globalThis as any).__VT_DEBUG_PERF__ = true;
  const variant = search.get("variant");
  if (variant === "A" || variant === "B" || variant === "C") {
    (globalThis as any).__AGENT_CONSOLE_PROFILE_VARIANT__ = variant;
  }
}

createApp(App).mount("#app");
