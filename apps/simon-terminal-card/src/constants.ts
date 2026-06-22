export const defaultUser = "Simon-He95";
export const cardCols = 80;
export const cardRows = 26;
export const contentW = cardCols - 4;
export const outputName = "simon-terminal-card";
export const cellW = 10;
export const cellH = 18;
export const fontSize = 14;
export const cardBg = "#000000";
export const userAgent = "vue-tui-github-contribution-card";
export const ansiReset = "\u001B[0m";
export const fetchAttempts = 2;
export const fetchTimeoutMs = 12_000;
export const fallbackSnapshotUrl = new URL("./data/simon-he95.snapshot.json", import.meta.url);
export const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const projectRepoHref = "https://github.com/Simon-He95/vue-tui";

export const fgColors: Record<string, string> = {
  black: "#111827",
  blackBright: "#6b7280",
  blue: "#2563eb",
  blueBright: "#60a5fa",
  cyan: "#06b6d4",
  cyanBright: "#67e8f9",
  green: "#22c55e",
  greenBright: "#4ade80",
  magenta: "#d946ef",
  magentaBright: "#f0abfc",
  red: "#ef4444",
  redBright: "#f87171",
  white: "#d1d5db",
  whiteBright: "#f9fafb",
  yellow: "#eab308",
  yellowBright: "#fef08a",
};

export const ansiFgCodes: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  blackBright: 90,
  redBright: 91,
  greenBright: 92,
  yellowBright: 93,
  blueBright: 94,
  magentaBright: 95,
  cyanBright: 96,
  whiteBright: 97,
};

export const ansiBgCodes: Record<string, number> = {
  black: 40,
  red: 41,
  green: 42,
  yellow: 43,
  blue: 44,
  magenta: 45,
  cyan: 46,
  white: 47,
  blackBright: 100,
  redBright: 101,
  greenBright: 102,
  yellowBright: 103,
  blueBright: 104,
  magentaBright: 105,
  cyanBright: 106,
  whiteBright: 107,
};
