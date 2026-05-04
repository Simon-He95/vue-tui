import type { ParsedNode } from "stream-markdown-parser";
import { markdownAstToBlocks } from "./ast.js";
import { layoutMarkdownBlocks } from "./layout.js";
import { type TuiMarkdownParser } from "./parser.js";
import { resolveTuiMarkdownTheme, type TuiMarkdownThemeOverrides } from "./theme.js";
import type { TuiMarkdownBlock, TuiMarkdownVisualRow } from "./types.js";
import { sanitizeInlineText, sanitizeTextBlock } from "../utils/text.js";

/**
 * Markdown currently rebuilds from the full source string on every scheduled update.
 * Streaming components coalesce burst updates to at most one rebuild per frame,
 * but the rebuild itself is still full-document parse -> block -> visual-row layout.
 */
export function buildMarkdownBlocks(
  content: string,
  parser: TuiMarkdownParser,
  options?: Readonly<{
    final?: boolean;
    theme?: TuiMarkdownThemeOverrides;
  }>,
): Readonly<{
  nodes: readonly ParsedNode[];
  blocks: readonly TuiMarkdownBlock[];
}> {
  const theme = resolveTuiMarkdownTheme(options?.theme);
  try {
    const nodes = parser.parse(content, options?.final ?? true);
    const blocks = markdownAstToBlocks(nodes, theme);
    return { nodes, blocks };
  } catch (error) {
    console.warn("[vue-tui] Markdown parse failed; falling back to plain text rendering.", error);
    return {
      nodes: [],
      blocks: plainTextFallbackBlocks(content),
    };
  }
}

export function buildMarkdownVisualRows(
  content: string,
  width: number,
  parser: TuiMarkdownParser,
  options?: Readonly<{
    final?: boolean;
    theme?: TuiMarkdownThemeOverrides;
  }>,
): readonly TuiMarkdownVisualRow[] {
  const { blocks } = buildMarkdownBlocks(content, parser, options);
  return layoutMarkdownBlocks(blocks, width);
}

function plainTextFallbackBlocks(content: string): readonly TuiMarkdownBlock[] {
  const normalized = sanitizeTextBlock(content);
  const lines = normalized.split("\n");
  const blocks: TuiMarkdownBlock[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = sanitizeInlineText(lines[index] ?? "");
    if (!line) {
      blocks.push({ type: "blank", key: `md-fallback:${index}` });
      continue;
    }
    blocks.push({
      type: "inline",
      key: `md-fallback:${index}`,
      segments: [{ text: line }],
    });
  }
  return blocks.length ? blocks : [{ type: "blank", key: "md-fallback:0" }];
}
