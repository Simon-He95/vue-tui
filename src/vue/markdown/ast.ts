import type {
  CodeBlockNode,
  HeadingNode,
  HtmlBlockNode,
  ListItemNode,
  ListNode,
  ParagraphNode,
  ParsedNode,
} from "stream-markdown-parser";
import { sanitizeInlineText, sanitizeTextBlock, spaces, textCellWidth } from "../utils/text.js";
import { type TuiMarkdownTheme } from "./theme.js";
import type { TuiMarkdownBlock, TuiMarkdownInlineSegment } from "./types.js";

type BlockContext = Readonly<{
  prefixSegments: readonly TuiMarkdownInlineSegment[];
  continuationPrefixSegments: readonly TuiMarkdownInlineSegment[];
}>;

const EMPTY_PREFIX: readonly TuiMarkdownInlineSegment[] = Object.freeze([]);
const HARD_BREAK_SEGMENT = Object.freeze({
  text: "",
  hardBreak: true,
} satisfies TuiMarkdownInlineSegment);

function mergeStyle(
  base: TuiMarkdownInlineSegment["style"],
  overlay?: TuiMarkdownInlineSegment["style"],
) {
  if (!base) return overlay;
  if (!overlay) return base;
  return { ...base, ...overlay };
}

function trimBlockArray(blocks: TuiMarkdownBlock[]): TuiMarkdownBlock[] {
  let start = 0;
  let end = blocks.length;
  while (start < end && blocks[start]?.type === "blank") start++;
  while (end > start && blocks[end - 1]?.type === "blank") end--;
  return blocks.slice(start, end);
}

function nodeChildren(node: ParsedNode): readonly ParsedNode[] {
  return "children" in node && Array.isArray(node.children) ? node.children : [];
}

function stringProp(node: ParsedNode, key: string): string {
  const value = (node as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function booleanProp(node: ParsedNode, key: string): boolean {
  return (node as Record<string, unknown>)[key] === true;
}

function pushTextSegments(
  out: TuiMarkdownInlineSegment[],
  text: string,
  style?: TuiMarkdownInlineSegment["style"],
): void {
  if (!text) return;
  const normalized = sanitizeTextBlock(text);
  if (!normalized) return;
  const parts = normalized.split("\n");
  for (let i = 0; i < parts.length; i++) {
    const part = sanitizeInlineText(parts[i] ?? "");
    if (part) out.push(style ? { text: part, style } : { text: part });
    if (i < parts.length - 1) out.push(HARD_BREAK_SEGMENT);
  }
}

function inlineNodeSegments(
  nodes: readonly ParsedNode[],
  theme: TuiMarkdownTheme,
  inheritedStyle?: TuiMarkdownInlineSegment["style"],
): TuiMarkdownInlineSegment[] {
  const out: TuiMarkdownInlineSegment[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        pushTextSegments(out, stringProp(node, "content"), inheritedStyle);
        break;
      case "inline":
      case "paragraph":
      case "heading":
      case "list_item":
      case "blockquote":
        out.push(...inlineNodeSegments(nodeChildren(node), theme, inheritedStyle));
        break;
      case "strong":
        out.push(
          ...inlineNodeSegments(
            nodeChildren(node),
            theme,
            mergeStyle(inheritedStyle, theme.strong),
          ),
        );
        break;
      case "emphasis":
        out.push(
          ...inlineNodeSegments(
            nodeChildren(node),
            theme,
            mergeStyle(inheritedStyle, theme.emphasis),
          ),
        );
        break;
      case "strikethrough":
        out.push(
          ...inlineNodeSegments(
            nodeChildren(node),
            theme,
            mergeStyle(inheritedStyle, theme.strikethrough),
          ),
        );
        break;
      case "highlight":
      case "insert":
      case "subscript":
      case "superscript":
        out.push(...inlineNodeSegments(nodeChildren(node), theme, inheritedStyle));
        break;
      case "inline_code":
        pushTextSegments(
          out,
          stringProp(node, "code"),
          mergeStyle(inheritedStyle, theme.inlineCode),
        );
        break;
      case "hardbreak":
        out.push(HARD_BREAK_SEGMENT);
        break;
      case "link": {
        const href = stringProp(node, "href");
        const linkStyle = mergeStyle(inheritedStyle, href ? { ...theme.link, href } : theme.link);
        const children = nodeChildren(node);
        if (children.length) out.push(...inlineNodeSegments(children, theme, linkStyle));
        else pushTextSegments(out, stringProp(node, "text"), linkStyle);
        break;
      }
      case "image":
        pushTextSegments(
          out,
          stringProp(node, "alt") || stringProp(node, "src"),
          mergeStyle(inheritedStyle, theme.link),
        );
        break;
      case "checkbox":
      case "checkbox_input":
        pushTextSegments(out, booleanProp(node, "checked") ? "[x]" : "[ ]", inheritedStyle);
        break;
      case "emoji":
        pushTextSegments(
          out,
          stringProp(node, "markup") || stringProp(node, "name"),
          inheritedStyle,
        );
        break;
      case "math_inline":
        pushTextSegments(
          out,
          stringProp(node, "content"),
          mergeStyle(inheritedStyle, theme.inlineCode),
        );
        break;
      case "reference":
      case "footnote_reference":
      case "footnote_anchor":
        pushTextSegments(out, node.raw, inheritedStyle);
        break;
      case "html_inline":
        pushTextSegments(out, stringProp(node, "content"), mergeStyle(inheritedStyle, theme.html));
        break;
      case "html_block":
        pushTextSegments(out, stringProp(node, "content"), mergeStyle(inheritedStyle, theme.html));
        break;
      default:
        if (nodeChildren(node).length) {
          out.push(...inlineNodeSegments(nodeChildren(node), theme, inheritedStyle));
          break;
        }
        pushTextSegments(out, node.raw, inheritedStyle);
        break;
    }
  }
  return out;
}

function inlineBlock(
  key: string,
  segments: readonly TuiMarkdownInlineSegment[],
  context: BlockContext,
): TuiMarkdownBlock {
  return {
    type: "inline",
    key,
    segments,
    prefixSegments: context.prefixSegments,
    continuationPrefixSegments: context.continuationPrefixSegments,
  };
}

function blockFromParagraph(
  node: ParagraphNode,
  key: string,
  context: BlockContext,
  theme: TuiMarkdownTheme,
): TuiMarkdownBlock {
  return inlineBlock(key, inlineNodeSegments(node.children, theme), context);
}

function blockFromHeading(
  node: HeadingNode,
  key: string,
  context: BlockContext,
  theme: TuiMarkdownTheme,
): TuiMarkdownBlock {
  const level = Math.min(6, Math.max(1, Math.floor(node.level || 1)));
  return inlineBlock(
    key,
    inlineNodeSegments(node.children, theme, theme.heading[level - 1]),
    context,
  );
}

function blockFromCodeBlock(
  node: CodeBlockNode,
  key: string,
  context: BlockContext,
  theme: TuiMarkdownTheme,
): TuiMarkdownBlock {
  return {
    type: "code_block",
    key,
    lines: sanitizeTextBlock(node.code ?? "").split("\n"),
    style: theme.codeBlock,
    prefixSegments: context.prefixSegments,
    continuationPrefixSegments: context.continuationPrefixSegments,
  };
}

function blockFromHtmlBlock(
  node: HtmlBlockNode,
  key: string,
  context: BlockContext,
  theme: TuiMarkdownTheme,
): TuiMarkdownBlock {
  return inlineBlock(
    key,
    inlineNodeSegments(
      [{ type: "html_block", raw: node.raw, content: node.content } as ParsedNode],
      theme,
    ),
    context,
  );
}

function childSequenceToBlocks(
  nodes: readonly ParsedNode[],
  context: BlockContext,
  theme: TuiMarkdownTheme,
  keyPrefix: string,
): TuiMarkdownBlock[] {
  const out: TuiMarkdownBlock[] = [];
  let appended = false;
  for (let i = 0; i < nodes.length; i++) {
    const childBlocks = trimBlockArray(nodeToBlocks(nodes[i], context, theme, `${keyPrefix}-${i}`));
    if (!childBlocks.length) continue;
    if (appended && out[out.length - 1]?.type !== "blank" && childBlocks[0]?.type !== "blank") {
      out.push({ type: "blank", key: `${keyPrefix}-${i}-gap` });
    }
    out.push(...childBlocks);
    appended = true;
  }
  return out;
}

function listItemBlocks(
  item: ListItemNode,
  index: number,
  ordered: boolean,
  start: number,
  context: BlockContext,
  theme: TuiMarkdownTheme,
  keyPrefix: string,
): TuiMarkdownBlock[] {
  const markerText = ordered ? `${start + index}. ` : "- ";
  const markerCells = textCellWidth(markerText);
  const markerSegment: TuiMarkdownInlineSegment = {
    text: markerText,
    style: theme.listMarker,
  };
  const indentSegment: TuiMarkdownInlineSegment = {
    text: spaces(markerCells),
  };
  const firstContext: BlockContext = {
    prefixSegments: [...context.prefixSegments, markerSegment],
    continuationPrefixSegments: [...context.continuationPrefixSegments, indentSegment],
  };
  const nestedContext: BlockContext = {
    prefixSegments: [...context.continuationPrefixSegments, indentSegment],
    continuationPrefixSegments: [...context.continuationPrefixSegments, indentSegment],
  };

  if (!item.children.length) return [inlineBlock(`${keyPrefix}-empty`, [], firstContext)];

  const out: TuiMarkdownBlock[] = [];
  let usedLead = false;
  for (let i = 0; i < item.children.length; i++) {
    const child = item.children[i]!;
    const useLeadContext =
      !usedLead &&
      (child.type === "paragraph" || child.type === "heading" || child.type === "code_block");
    if (!usedLead && !useLeadContext) {
      out.push(inlineBlock(`${keyPrefix}-marker`, [], firstContext));
      usedLead = true;
    }
    const childBlocks = trimBlockArray(
      nodeToBlocks(
        child,
        useLeadContext && !usedLead ? firstContext : nestedContext,
        theme,
        `${keyPrefix}-${i}`,
      ),
    );
    if (!childBlocks.length) continue;
    if (out.length && out[out.length - 1]?.type !== "blank" && childBlocks[0]?.type !== "blank") {
      out.push({ type: "blank", key: `${keyPrefix}-${i}-gap` });
    }
    out.push(...childBlocks);
    usedLead = true;
  }

  if (!out.length) out.push(inlineBlock(`${keyPrefix}-fallback`, [], firstContext));
  return out;
}

function listBlocks(
  node: ListNode,
  context: BlockContext,
  theme: TuiMarkdownTheme,
  keyPrefix: string,
): TuiMarkdownBlock[] {
  const out: TuiMarkdownBlock[] = [];
  for (let i = 0; i < node.items.length; i++) {
    out.push(
      ...listItemBlocks(
        node.items[i]!,
        i,
        node.ordered,
        node.start ?? 1,
        context,
        theme,
        `${keyPrefix}-${i}`,
      ),
    );
  }
  return out;
}

function nodeToBlocks(
  node: ParsedNode,
  context: BlockContext,
  theme: TuiMarkdownTheme,
  keyPrefix: string,
): TuiMarkdownBlock[] {
  switch (node.type) {
    case "paragraph":
      if ("children" in node && Array.isArray(node.children))
        return [blockFromParagraph(node as ParagraphNode, keyPrefix, context, theme)];
      break;
    case "heading":
      if ("children" in node && Array.isArray(node.children) && "level" in node)
        return [blockFromHeading(node as HeadingNode, keyPrefix, context, theme)];
      break;
    case "code_block":
      if ("code" in node)
        return [blockFromCodeBlock(node as CodeBlockNode, keyPrefix, context, theme)];
      break;
    case "thematic_break":
      return [
        {
          type: "thematic_break",
          key: keyPrefix,
          char: "─",
          style: theme.thematicBreak,
          prefixSegments: context.prefixSegments,
        },
      ];
    case "blockquote": {
      const quoteSegment: TuiMarkdownInlineSegment = {
        text: "│ ",
        style: theme.blockquote,
      };
      const quoteContext: BlockContext = {
        prefixSegments: [...context.prefixSegments, quoteSegment],
        continuationPrefixSegments: [...context.continuationPrefixSegments, quoteSegment],
      };
      return childSequenceToBlocks(nodeChildren(node), quoteContext, theme, keyPrefix);
    }
    case "list":
      if ("items" in node && Array.isArray(node.items))
        return listBlocks(node as ListNode, context, theme, keyPrefix);
      break;
    case "inline":
      return [inlineBlock(keyPrefix, inlineNodeSegments(nodeChildren(node), theme), context)];
    case "html_block":
      if ("content" in node)
        return [blockFromHtmlBlock(node as HtmlBlockNode, keyPrefix, context, theme)];
      break;
    case "text":
      return [inlineBlock(keyPrefix, inlineNodeSegments([node], theme), context)];
  }
  if (nodeChildren(node).length)
    return childSequenceToBlocks(nodeChildren(node), context, theme, keyPrefix);
  return [inlineBlock(keyPrefix, inlineNodeSegments([node], theme), context)];
}

export function markdownAstToBlocks(
  nodes: readonly ParsedNode[],
  theme: TuiMarkdownTheme,
): readonly TuiMarkdownBlock[] {
  const blocks = trimBlockArray(
    childSequenceToBlocks(
      nodes,
      {
        prefixSegments: EMPTY_PREFIX,
        continuationPrefixSegments: EMPTY_PREFIX,
      },
      theme,
      "md",
    ),
  );
  return blocks.length ? blocks : [{ type: "blank", key: "md-empty" }];
}
