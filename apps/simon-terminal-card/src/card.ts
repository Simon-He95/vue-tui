import type { Component } from "vue";
import type { Style } from "@simon_he/vue-tui/core";
import { defineComponent, h } from "vue";
import { TAgentTerminalGraphic, createPngTerminalGraphicRenderer } from "@simon_he/vue-tui/agent";
import { TBox, TLink, TText } from "@simon_he/vue-tui";
import { TContributionGraph } from "@simon_he/vue-tui/experimental";
import { sliceByCells, textCellWidth, wrapByCells } from "@simon_he/vue-tui/vue";
import { cardBg, cardCols, cardRows, contentW, projectRepoHref } from "./constants.js";
import type {
  AvatarCell,
  AvatarMode,
  ContributionDay,
  DataSource,
  GitHubProfile,
} from "./types.js";
import { compactNumber, inlineText } from "./utils.js";

const avatarGraphicRenderer = createPngTerminalGraphicRenderer({
  toPngBase64: async (content, context) => ({
    base64: content,
    cols: context.width,
    rows: context.height,
  }),
});

function monthLabels(days: readonly ContributionDay[]): readonly { x: number; label: string }[] {
  const labels: { x: number; label: string }[] = [];
  let previousMonth = "";
  let lastEnd = -1;
  for (let i = 0; i < days.length; i++) {
    const date = new Date(`${days[i]!.date}T00:00:00Z`);
    const month = date.toLocaleString("en", { month: "short", timeZone: "UTC" });
    if (month === previousMonth) continue;
    previousMonth = month;
    const x = Math.floor(i / 7);
    if (x <= lastEnd) continue;
    labels.push({ x, label: month });
    lastEnd = x + textCellWidth(month);
  }
  return labels;
}

function topDay(days: readonly ContributionDay[]): ContributionDay {
  return days.reduce((best, day) => (day.count > best.count ? day : best), days[0]!);
}

function dateLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function textNodes(
  x: number,
  y: number,
  w: number,
  lines: readonly string[],
  style: Style,
): unknown[] {
  return lines.map((line, index) =>
    h(TText, { x, y: y + index, w, value: sliceByCells(line, w), style }),
  );
}

function avatarFallbackText(cells: readonly AvatarCell[], cols: number, rows: number): string {
  const lines = Array.from({ length: rows }, () => Array.from({ length: cols }, () => " "));
  for (const cell of cells) {
    if (cell.x < 0 || cell.x >= cols || cell.y < 0 || cell.y >= rows) continue;
    lines[cell.y]![cell.x] = cell.ch.trim() ? cell.ch : " ";
  }
  return lines.map((line) => line.join("")).join("\n");
}

function avatarNodes(options: {
  x: number;
  y: number;
  cells: readonly AvatarCell[];
  pngBase64?: string;
  mode: AvatarMode;
}): unknown[] {
  const cols = 14;
  const rows = 7;
  if (options.mode === "graphic" && options.pngBase64) {
    return [
      h(TAgentTerminalGraphic, {
        x: options.x,
        y: options.y,
        w: cols,
        h: rows,
        zIndex: 2_000_000,
        content: options.pngBase64,
        fallback: avatarFallbackText(options.cells, cols, rows),
        renderer: avatarGraphicRenderer,
        loadingText: "Loading avatar...",
        cacheKey: "github-profile-avatar",
      }),
    ];
  }
  return options.cells.map((cell) =>
    h(TText, {
      x: options.x + cell.x,
      y: options.y + cell.y,
      w: 1,
      value: cell.ch,
      style: cell.style,
    }),
  );
}

export function makeCardComponent(options: {
  profile: GitHubProfile;
  contributions: {
    days: readonly ContributionDay[];
    totalText: string;
  };
  avatar: readonly AvatarCell[];
  avatarPngBase64?: string;
  avatarMode: AvatarMode;
  source: DataSource;
  capturedAt: string;
}): Component {
  const { profile, contributions, avatar, avatarPngBase64, avatarMode, source, capturedAt } =
    options;
  const days = contributions.days;
  const graphX = 4;
  const graphY = 15;
  const graphW = Math.ceil(days.length / 7);
  const graphValues = days.map((day) => day.level);
  const graphLabels = days.map((day) => `${day.date}: ${day.count} contributions`);
  const latest = days[days.length - 1]!;
  const best = topDay(days);
  const profileName = inlineText(profile.name) || profile.login;
  const bio = inlineText(profile.bio) || "Terminal UI components for Vue.";
  const company = inlineText(profile.company);
  const location = inlineText(profile.location);
  const blog = inlineText(profile.blog);
  const profileMeta = [location, blog, company].filter(Boolean).join(" | ");
  const description = wrapByCells(bio, 52).slice(0, 2);
  const contributionText = contributions.totalText.replace(/\s+in the last year$/u, "");
  const statLine = `${contributionText} | ${compactNumber(profile.public_repos)} repos | ${compactNumber(profile.followers)} followers`;
  const sourceLine =
    source === "live" ? "live GitHub data" : `cached fallback from ${capturedAt.slice(0, 10)}`;
  const headerPrefix = "GitHub activity card rendered with ";
  const headerLink = "@simon_he/vue-tui";

  return defineComponent({
    name: "GitHubContributionCard",
    setup: () => () =>
      h(
        TBox,
        {
          x: 0,
          y: 0,
          w: cardCols,
          h: cardRows,
          border: true,
          padding: 1,
          title: ` ${profile.login} / TContributionGraph `,
          style: { fg: "whiteBright", bg: cardBg },
        },
        {
          default: () => [
            h(TText, {
              x: 0,
              y: 0,
              w: textCellWidth(headerPrefix),
              value: headerPrefix,
              style: { fg: "cyanBright", bold: true },
            }),
            h(TLink, {
              x: textCellWidth(headerPrefix),
              y: 0,
              href: projectRepoHref,
              label: headerLink,
              style: { fg: "cyanBright", bold: true, underline: true },
            }),
            h(TText, {
              x: 0,
              y: 1,
              w: contentW,
              value: sourceLine,
              style: { fg: "blackBright" },
            }),
            ...avatarNodes({
              x: 0,
              y: 3,
              cells: avatar,
              pngBase64: avatarPngBase64,
              mode: avatarMode,
            }),
            h(TText, {
              x: 17,
              y: 3,
              w: 52,
              value: profileName,
              style: { fg: "whiteBright", bold: true },
            }),
            h(TText, {
              x: 17,
              y: 4,
              w: 52,
              value: `@${profile.login}`,
              style: { fg: "greenBright" },
            }),
            ...textNodes(17, 6, 52, description, { fg: "white" }),
            h(TText, {
              x: 17,
              y: 8,
              w: 58,
              value: sliceByCells(profileMeta, 58),
              style: { fg: "blackBright" },
            }),
            h(TText, {
              x: 17,
              y: 9,
              w: 58,
              value: sliceByCells(statLine, 58),
              style: { fg: "yellowBright", bold: true },
            }),
            h(TText, {
              x: 0,
              y: 12,
              w: 28,
              value: "GitHub contributions",
              style: { fg: "whiteBright", bold: true },
            }),
            h(TLink, {
              x: 17,
              y: 10,
              href: profile.html_url,
              label: profile.html_url,
              style: { fg: "cyanBright", underline: true },
            }),
            ...monthLabels(days).map((item) =>
              h(TText, {
                x: graphX + item.x,
                y: graphY - 1,
                w: 3,
                value: item.label,
                style: { fg: "blackBright" },
              }),
            ),
            h(TText, { x: 0, y: graphY + 1, w: 3, value: "Mon", style: { fg: "blackBright" } }),
            h(TText, { x: 0, y: graphY + 3, w: 3, value: "Wed", style: { fg: "blackBright" } }),
            h(TText, { x: 0, y: graphY + 5, w: 3, value: "Fri", style: { fg: "blackBright" } }),
            h(TContributionGraph, {
              x: graphX,
              y: graphY,
              w: graphW,
              values: graphValues,
              labels: graphLabels,
              rows: 7,
              columns: graphW,
              gap: 0,
              max: 4,
              showTooltip: false,
              emptyStyle: { fg: "#161b22", dim: true },
              levelStyles: [
                { fg: "#0e4429" },
                { fg: "#006d32" },
                { fg: "#26a641" },
                { fg: "#39d353" },
              ],
            }),
            h(TText, { x: 60, y: graphY, w: 4, value: "Less", style: { fg: "blackBright" } }),
            h(TText, { x: 65, y: graphY, w: 1, value: "■", style: { fg: "#161b22" } }),
            h(TText, { x: 66, y: graphY, w: 1, value: "■", style: { fg: "#0e4429" } }),
            h(TText, { x: 67, y: graphY, w: 1, value: "■", style: { fg: "#006d32" } }),
            h(TText, { x: 68, y: graphY, w: 1, value: "■", style: { fg: "#26a641" } }),
            h(TText, { x: 69, y: graphY, w: 1, value: "■", style: { fg: "#39d353" } }),
            h(TText, { x: 71, y: graphY, w: 4, value: "More", style: { fg: "blackBright" } }),
            h(TText, {
              x: 60,
              y: graphY + 2,
              w: 16,
              value: sliceByCells(`${best.count} on ${dateLabel(best.date)}`, 16),
              style: { fg: "greenBright", bold: true },
            }),
            h(TText, {
              x: 60,
              y: graphY + 3,
              w: 16,
              value: "most active day",
              style: { fg: "blackBright" },
            }),
            h(TText, {
              x: 60,
              y: graphY + 5,
              w: 16,
              value: sliceByCells(`${latest.count} on ${dateLabel(latest.date)}`, 16),
              style: { fg: "cyanBright", bold: true },
            }),
            h(TText, {
              x: 60,
              y: graphY + 6,
              w: 16,
              value: "latest day",
              style: { fg: "blackBright" },
            }),
          ],
        },
      ),
  });
}
