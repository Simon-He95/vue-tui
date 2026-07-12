<script setup lang="ts">
import type { AgentConsoleApi } from "./AgentConsoleSurface";
import { onBeforeUnmount } from "vue";
import { TerminalProvider } from "@simon_he/vue-tui";
import { AgentConsoleSurface, AGENT_CONSOLE_LAYOUT } from "./AgentConsoleSurface";
import { consoleDefaultStyle, domPalette } from "./theme";

let removePerfHarness: (() => void) | null = null;
async function handleReady(api: AgentConsoleApi): Promise<void> {
  if (!new URLSearchParams(window.location.search).has("profile")) return;
  const { installAgentConsoleBrowserPerf } = await import("./perf-browser-harness");
  removePerfHarness?.();
  removePerfHarness = installAgentConsoleBrowserPerf(api);
}
onBeforeUnmount(() => removePerfHarness?.());
</script>

<template>
  <main class="agent-console-shell">
    <div class="agent-console-frame">
      <TerminalProvider
        :cols="AGENT_CONSOLE_LAYOUT.cols"
        :rows="AGENT_CONSOLE_LAYOUT.rows"
        :default-style="consoleDefaultStyle"
        :dom-renderer-options="{ palette: domPalette }"
        :selection="{ autoCopy: true, copyOnMouseUp: true }"
      >
        <AgentConsoleSurface :on-ready="handleReady" />
      </TerminalProvider>
    </div>
  </main>
</template>
