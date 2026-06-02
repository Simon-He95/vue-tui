<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { TBox, TText, TView } from "@simon_he/vue-tui";
import { useLayout } from "@simon_he/vue-tui/vue";

type Point = { x: number; y: number };
type Direction = "up" | "down" | "left" | "right";

const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 64);
const rows = computed(() => layout.clipRect?.h ?? 26);

const boardW = 34;
const boardH = 16;
const boardX = computed(() => Math.max(1, Math.floor((cols.value - boardW - 2) / 2)));
const boardY = 4;
const foodCellX = computed(() => boardX.value + 1 + (food.value?.x ?? 0));
const foodCellY = computed(() => boardY + 1 + (food.value?.y ?? 0));

const snake = ref<Point[]>([]);
const food = ref<Point | null>({ x: 24, y: 8 });
const direction = ref<Direction>("right");
const directionQueue = ref<Direction[]>([]);
const score = ref(0);
const paused = ref(false);
const gameOver = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;
let foodSeed = 0;

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function resetGame() {
  snake.value = [
    { x: 8, y: 8 },
    { x: 7, y: 8 },
    { x: 6, y: 8 },
    { x: 5, y: 8 },
  ];
  food.value = { x: 24, y: 8 };
  direction.value = "right";
  directionQueue.value = [];
  score.value = 0;
  paused.value = false;
  gameOver.value = false;
  foodSeed = 0;
}

function nextFood(body: readonly Point[]): Point | null {
  const openCells: Point[] = [];
  for (let y = 0; y < boardH; y++) {
    for (let x = 0; x < boardW; x++) {
      const point = { x, y };
      if (!body.some((part) => samePoint(part, point))) openCells.push(point);
    }
  }
  if (!openCells.length) return null;
  foodSeed = (Math.imul(foodSeed, 1664525) + 1013904223) >>> 0;
  return openCells[foodSeed % openCells.length] ?? openCells[0]!;
}

function isReverse(a: Direction, b: Direction): boolean {
  return (
    (a === "up" && b === "down") ||
    (a === "down" && b === "up") ||
    (a === "left" && b === "right") ||
    (a === "right" && b === "left")
  );
}

function moveHead(head: Point, dir: Direction): Point {
  if (dir === "up") return { x: head.x, y: head.y - 1 };
  if (dir === "down") return { x: head.x, y: head.y + 1 };
  if (dir === "left") return { x: head.x - 1, y: head.y };
  return { x: head.x + 1, y: head.y };
}

function tick() {
  if (paused.value || gameOver.value) return;
  const queued = directionQueue.value[0];
  if (queued && !isReverse(direction.value, queued)) direction.value = queued;
  if (queued) directionQueue.value = directionQueue.value.slice(1);
  const current = snake.value;
  const head = current[0] ?? { x: 0, y: 0 };
  const next = moveHead(head, direction.value);
  const eats = food.value != null && samePoint(next, food.value);
  const bodyToCheck = eats ? current : current.slice(0, -1);

  if (
    next.x < 0 ||
    next.y < 0 ||
    next.x >= boardW ||
    next.y >= boardH ||
    bodyToCheck.some((part) => samePoint(part, next))
  ) {
    gameOver.value = true;
    return;
  }

  const nextSnake = [next, ...current];
  if (!eats) nextSnake.pop();
  else {
    score.value += 10;
    food.value = nextFood(nextSnake);
    if (!food.value) gameOver.value = true;
  }
  snake.value = nextSnake;
}

function onKeydown(event: any) {
  const key = String(event?.key ?? "").toLowerCase();
  const next =
    key === "arrowup" || key === "w"
      ? "up"
      : key === "arrowdown" || key === "s"
        ? "down"
        : key === "arrowleft" || key === "a"
          ? "left"
          : key === "arrowright" || key === "d"
            ? "right"
            : null;
  if (next) {
    event.preventDefault?.();
    const queue = directionQueue.value;
    const previous = queue[queue.length - 1] ?? direction.value;
    if (next !== previous && !isReverse(previous, next)) {
      directionQueue.value = [...queue, next].slice(0, 8);
    }
  } else if (key === " ") {
    event.preventDefault?.();
    paused.value = !paused.value;
  } else if (key === "r") {
    event.preventDefault?.();
    resetGame();
  }
}

const boardRows = computed(() => {
  const body = snake.value;
  const head = body[0];
  const foodPoint = food.value;
  return Array.from({ length: boardH }, (_, y) => {
    let line = "";
    for (let x = 0; x < boardW; x++) {
      const point = { x, y };
      if (head && samePoint(head, point)) line += "O";
      else if (body.some((part) => samePoint(part, point))) line += "o";
      else if (foodPoint && samePoint(foodPoint, point)) line += "*";
      else line += ".";
    }
    return line;
  });
});

const stateLabel = computed(() =>
  gameOver.value ? "Game over" : paused.value ? "Paused" : "Running",
);
const foodLabel = computed(() => (food.value ? `${food.value.x},${food.value.y}` : "none"));

onMounted(() => {
  resetGame();
  timer = setInterval(tick, 140);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <TView :x="0" :y="0" :w="cols" :h="rows" focusable autoFocus @keydown="onKeydown">
    <TBox
      :x="0"
      :y="0"
      :w="cols"
      :h="rows"
      border
      title="terminal-snake.vue"
      :padding="1"
      :style="{ fg: 'greenBright' }"
    >
      <TText
        :x="0"
        :y="0"
        :w="cols - 4"
        :value="`Score: ${score}  Status: ${stateLabel}  Food: ${foodLabel}`"
      />
      <TText
        :x="0"
        :y="1"
        :w="cols - 4"
        value="WASD / Arrow keys move · Space pause · R restart"
        :style="{ dim: true }"
      />

      <TBox
        :x="boardX"
        :y="boardY"
        :w="boardW + 2"
        :h="boardH + 2"
        border
        title="Snake"
        :padding="0"
        :style="{ fg: gameOver ? 'redBright' : 'greenBright' }"
      >
        <TText
          v-for="(line, index) in boardRows"
          :key="`${index}:${line}`"
          :x="0"
          :y="index"
          :w="boardW"
          :value="line"
          :deps-key="`${score}:${foodLabel}:${index}`"
          :style="{ fg: 'greenBright' }"
        />
      </TBox>
      <TText
        v-if="food"
        :x="foodCellX"
        :y="foodCellY"
        :zIndex="100"
        value="*"
        :style="{ fg: 'yellowBright', bold: true }"
      />
      <TText
        v-if="gameOver"
        :x="boardX + 10"
        :y="boardY + 8"
        :w="18"
        value="Press R to restart"
        :style="{ fg: 'redBright', bold: true }"
      />
    </TBox>
  </TView>
</template>
