import assert from "node:assert/strict";
import { nextTick, watch } from "vue";
import { createSyntheticAgentEvent } from "./mock-agent-stream";
import { createAgentTranscriptStore } from "./transcript-store";

const store = createAgentTranscriptStore();
const observedLengths: number[] = [];
const stop = watch(
  () => store.eventLog.value.length,
  (length) => observedLengths.push(length),
  { flush: "sync" },
);

store.appendSyntheticChunk(1);
store.appendSyntheticChunk(2);
assert.equal(store.markdownBlocks.value.length, 0, "log-mode append keeps Markdown blocks lazy");
const firstBlocks = store.syncMarkdownBlocks();
assert.ok(firstBlocks.length > 0, "visible Markdown sync publishes blocks");
store.appendSyntheticChunk(3);
assert.equal(
  store.markdownBlocks.value,
  firstBlocks,
  "later appends do not eagerly rematerialize hidden Markdown blocks",
);
assert.notEqual(
  store.syncMarkdownBlocks(),
  firstBlocks,
  "next visible sync publishes fresh blocks",
);
await nextTick();
assert.deepEqual(observedLengths, [1, 2, 3], "append must notify eventLog length watchers");
assert.equal(store.captureReplayLog().events.length, 3, "capture includes every appended event");

store.clear();
await nextTick();
assert.equal(store.eventLog.value.length, 0, "clear resets the backing array and ref");
assert.equal(observedLengths.at(-1), 0, "clear notifies eventLog watchers");

const replay = {
  version: 1 as const,
  events: Array.from({ length: 12 }, (_, index) => createSyntheticAgentEvent(index + 20)),
};
store.loadReplayLog(replay, 7);
assert.equal(store.eventLog.value.length, 7, "loadReplayLog restores the requested cursor");
assert.deepEqual(store.captureReplayLog().events, replay.events.slice(0, 7));

const beforeExpansion = store.captureReplayLog();
store.setFixtureExpansion({ thinkingExpanded: false, toolCallExpanded: false });
assert.deepEqual(
  store.captureReplayLog(),
  beforeExpansion,
  "fixture expansion toggles must not mutate replay history",
);
store.setFixtureExpansion({ thinkingExpanded: true, toolCallExpanded: true });
assert.deepEqual(store.captureReplayLog(), beforeExpansion);

store.loadReplayLog(replay, 3);
const seekSnapshot = store.captureReplayLog();
assert.deepEqual(seekSnapshot.events, replay.events.slice(0, 3), "seek snapshot is stable");
store.loadReplayLog(replay);
assert.deepEqual(store.captureReplayLog().events, replay.events, "full replay restores all events");
store.loadReplayLog(seekSnapshot);
assert.deepEqual(
  store.captureReplayLog(),
  seekSnapshot,
  "load → seek → restore preserves the replay snapshot",
);

stop();
process.stdout.write("Agent transcript store smoke passed\n");
