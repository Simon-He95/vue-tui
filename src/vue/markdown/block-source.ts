import { buildMarkdownBlocks } from "./document.js";
import { createTuiMarkdownParser, type TuiMarkdownParser } from "./parser.js";
import type { TuiMarkdownThemeOverrides } from "./theme.js";
import type { TuiMarkdownBlock } from "./types.js";

export type TuiMarkdownBlockSourceSnapshot = Readonly<{
  version: number;
  blocks: readonly TuiMarkdownBlock[];
}>;

export type TuiMarkdownBlockSource = Readonly<{
  version: number;
  blocks: readonly TuiMarkdownBlock[];
  appendDelta: (text: string) => void;
  replaceTailBlock: (text: string) => void;
  finalizeBlock: () => void;
  clear: () => void;
  snapshot: () => TuiMarkdownBlockSourceSnapshot;
}>;

export type TuiMarkdownBlockSourceOptions = Readonly<{
  parser?: TuiMarkdownParser;
  customHtmlTags?: readonly string[];
  theme?: TuiMarkdownThemeOverrides;
}>;

type BlockGroup = Readonly<{
  key: string;
  blocks: readonly TuiMarkdownBlock[];
}>;

function withBlockKeyPrefix(
  block: TuiMarkdownBlock,
  prefix: string,
  index: number,
): TuiMarkdownBlock {
  const key = `${prefix}:${index}:${block.key}`;
  switch (block.type) {
    case "inline":
      return { ...block, key };
    case "code_block":
      return { ...block, key };
    case "thematic_break":
      return { ...block, key };
    case "table":
      return { ...block, key };
    case "blank":
      return { ...block, key };
  }
}

function parseBlockGroup(
  text: string,
  key: string,
  parser: TuiMarkdownParser,
  theme: TuiMarkdownThemeOverrides | undefined,
  final: boolean,
): BlockGroup {
  const { blocks } = buildMarkdownBlocks(text, parser, { final, theme });
  return {
    key,
    blocks: blocks.map((block, index) => withBlockKeyPrefix(block, key, index)),
  };
}

function shouldInsertGap(
  previous: TuiMarkdownBlock | undefined,
  next: TuiMarkdownBlock | undefined,
): boolean {
  return previous != null && next != null && previous.type !== "blank" && next.type !== "blank";
}

function mergeGroups(groups: readonly BlockGroup[]): readonly TuiMarkdownBlock[] {
  const out: TuiMarkdownBlock[] = [];
  for (const group of groups) {
    if (!group.blocks.length) continue;
    if (shouldInsertGap(out[out.length - 1], group.blocks[0])) {
      out.push({ type: "blank", key: `${group.key}:gap` });
    }
    out.push(...group.blocks);
  }
  return out;
}

export function createMarkdownBlockSource(
  options?: TuiMarkdownBlockSourceOptions,
): TuiMarkdownBlockSource {
  const parser =
    options?.parser ??
    createTuiMarkdownParser({
      streaming: true,
      customHtmlTags: options?.customHtmlTags,
    });
  const theme = options?.theme;
  const finalizedGroups: BlockGroup[] = [];
  let tailText = "";
  let nextGroupIndex = 0;
  let version = 0;
  let cachedVersion = -1;
  let cachedBlocks: readonly TuiMarkdownBlock[] = [];

  const invalidate = () => {
    version++;
    cachedVersion = -1;
  };

  const currentGroups = (): readonly BlockGroup[] => {
    if (!tailText) return finalizedGroups;
    return [
      ...finalizedGroups,
      parseBlockGroup(tailText, `md-tail-${nextGroupIndex}`, parser, theme, false),
    ];
  };

  const blocks = (): readonly TuiMarkdownBlock[] => {
    if (cachedVersion === version) return cachedBlocks;
    cachedBlocks = mergeGroups(currentGroups());
    cachedVersion = version;
    return cachedBlocks;
  };

  const snapshot = (): TuiMarkdownBlockSourceSnapshot => ({
    version,
    blocks: blocks(),
  });

  return {
    get version() {
      return version;
    },
    get blocks() {
      return blocks();
    },
    appendDelta(text) {
      if (!text) return;
      tailText += text;
      invalidate();
    },
    replaceTailBlock(text) {
      if (tailText === text) return;
      tailText = text;
      invalidate();
    },
    finalizeBlock() {
      if (!tailText) return;
      const key = `md-block-${nextGroupIndex++}`;
      finalizedGroups.push(parseBlockGroup(tailText, key, parser, theme, true));
      tailText = "";
      invalidate();
    },
    clear() {
      if (!tailText && finalizedGroups.length === 0) return;
      finalizedGroups.length = 0;
      tailText = "";
      nextGroupIndex = 0;
      invalidate();
    },
    snapshot,
  };
}
