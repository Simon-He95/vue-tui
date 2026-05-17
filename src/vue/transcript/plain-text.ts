import type { TTranscriptRow } from "./types.js";

export function plainTextForTranscriptRow(row: TTranscriptRow): string {
  if (row.selectableText != null) return row.selectableText;
  if (row.kind === "message") return row.segments.map((segment) => segment.text).join("");
  if (row.kind === "action") return row.label;
  if (row.kind === "approval") {
    const description = row.description?.map((segment) => segment.text).join("") ?? "";
    return description ? `${row.title}\n${description}` : row.title;
  }
  const summary = row.summary?.map((segment) => segment.text).join("") ?? "";
  const body = row.collapsed ? "" : (row.body?.map((segment) => segment.text).join("") ?? "");
  return [row.title, summary, body].filter(Boolean).join("\n");
}
