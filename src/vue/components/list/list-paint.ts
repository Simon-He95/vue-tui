import { formatInlineCellLine, padEndByCells, sliceByCellsRange } from "../../utils/text.js";

export function formatClippedInlineCellLine(
  raw: string,
  fullWidth: number,
  clipX: number,
  width: number,
): string {
  if (clipX === 0 && width === fullWidth) {
    return formatInlineCellLine(raw, width);
  }

  return padEndByCells(
    sliceByCellsRange(formatInlineCellLine(raw, fullWidth), clipX, clipX + width),
    width,
  );
}
