import type { ParsedNode } from "stream-markdown-parser";
import { markdownAstToBlocks } from "./ast.js";
import { layoutMarkdownBlocks } from "./layout.js";
import { type TuiMarkdownParser } from "./parser.js";
import { resolveTuiMarkdownTheme, type TuiMarkdownThemeOverrides } from "./theme.js";
import type { TuiMarkdownBlock, TuiMarkdownVisualRow } from "./types.js";

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
  const nodes = parser.parse(content, options?.final ?? true);
  const blocks = markdownAstToBlocks(nodes, resolveTuiMarkdownTheme(options?.theme));
  return { nodes, blocks };
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
