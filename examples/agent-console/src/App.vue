<script setup lang="ts">
import { TerminalProvider } from "@simon_he/vue-tui";
import { AgentConsoleSurface, AGENT_CONSOLE_LAYOUT } from "./AgentConsoleSurface";
import { consoleDefaultStyle, domPalette } from "./theme";
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
        <AgentConsoleSurface auto-start />
      </TerminalProvider>
    </div>
  </main>
</template>
