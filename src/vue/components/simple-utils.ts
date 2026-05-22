import type { Style } from "../../core/types.js";
import { padEndByCells, sanitizeInlineText, sliceByCells, textCellWidth } from "../utils/text.js";

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function mergeStyle(...styles: Array<Style | undefined>): Style {
  const out: Record<string, unknown> = {};
  for (const style of styles) {
    if (!style) continue;
    Object.assign(out, style);
  }
  return out as Style;
}

export function fitCellText(
  value: unknown,
  width: number,
  align: "left" | "right" = "left",
): string {
  const w = Math.max(0, Math.floor(width));
  if (w <= 0) return "";
  const text = sliceByCells(sanitizeInlineText(String(value ?? "")), w);
  if (align === "right") {
    const cells = textCellWidth(text);
    return `${" ".repeat(Math.max(0, w - cells))}${text}`;
  }
  return padEndByCells(text, w);
}

export function repeatToCells(ch: string, width: number): string {
  const w = Math.max(0, Math.floor(width));
  if (w <= 0) return "";
  return ch.repeat(w);
}
