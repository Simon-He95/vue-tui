import { sanitizeInlineText, sanitizeTextBlock, spaces, textCellWidth } from "../utils/text.js";
import { isSafeMarkdownLink } from "./parser.js";
import { type TuiMarkdownTheme } from "./theme.js";
import type { TuiMarkdownBlock, TuiMarkdownInlineSegment, TuiMarkdownNode } from "./types.js";

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

function nodeChildren(node: TuiMarkdownNode): readonly TuiMarkdownNode[] {
  return "children" in node && Array.isArray(node.children) ? node.children : [];
}

function stringProp(node: TuiMarkdownNode, key: string): string {
  const value = (node as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function booleanProp(node: TuiMarkdownNode, key: string): boolean {
  return (node as Record<string, unknown>)[key] === true;
}

function numberProp(node: TuiMarkdownNode, key: string): number | null {
  const value = (node as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nodeItems(node: TuiMarkdownNode): readonly TuiMarkdownNode[] {
  const value = (node as Record<string, unknown>).items;
  return Array.isArray(value) ? (value as readonly TuiMarkdownNode[]) : [];
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

function sanitizeCodeBlockText(text: string, tabSize = 4): string {
  const normalized = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, spaces(tabSize))
    .replace(/\u00a0/g, " ");
  let out = "";
  for (const ch of normalized) {
    const code = ch.charCodeAt(0);
    if ((code >= 0x00 && code <= 0x08) || code === 0x0b || code === 0x0c) continue;
    if ((code >= 0x0e && code <= 0x1f) || code === 0x7f) continue;
    out += ch;
  }
  return out;
}

function inlineNodeSegments(
  nodes: readonly TuiMarkdownNode[],
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
        const safeHref = href && isSafeMarkdownLink(href) ? href : "";
        const linkStyle = safeHref
          ? mergeStyle(inheritedStyle, { ...theme.link, href: safeHref })
          : inheritedStyle;
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
        pushTextSegments(out, stringProp(node, "raw"), inheritedStyle);
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
        pushTextSegments(out, stringProp(node, "raw"), inheritedStyle);
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
  node: TuiMarkdownNode,
  key: string,
  context: BlockContext,
  theme: TuiMarkdownTheme,
): TuiMarkdownBlock {
  return inlineBlock(key, inlineNodeSegments(nodeChildren(node), theme), context);
}

function blockFromHeading(
  node: TuiMarkdownNode,
  key: string,
  context: BlockContext,
  theme: TuiMarkdownTheme,
): TuiMarkdownBlock {
  const level = Math.min(6, Math.max(1, Math.floor(numberProp(node, "level") ?? 1)));
  return inlineBlock(
    key,
    inlineNodeSegments(nodeChildren(node), theme, theme.heading[level - 1]),
    context,
  );
}

function blockFromCodeBlock(
  node: TuiMarkdownNode,
  key: string,
  context: BlockContext,
  theme: TuiMarkdownTheme,
): TuiMarkdownBlock {
  return {
    type: "code_block",
    key,
    lines: sanitizeCodeBlockText(stringProp(node, "code")).split("\n"),
    style: theme.codeBlock,
    prefixSegments: context.prefixSegments,
    continuationPrefixSegments: context.continuationPrefixSegments,
  };
}

function blockFromHtmlBlock(
  node: TuiMarkdownNode,
  key: string,
  context: BlockContext,
  theme: TuiMarkdownTheme,
): TuiMarkdownBlock {
  return inlineBlock(
    key,
    inlineNodeSegments(
      [
        {
          type: "html_block",
          raw: stringProp(node, "raw"),
          content: stringProp(node, "content"),
        },
      ],
      theme,
    ),
    context,
  );
}

function childSequenceToBlocks(
  nodes: readonly TuiMarkdownNode[],
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
  item: TuiMarkdownNode,
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

  const children = nodeChildren(item);
  if (!children.length) return [inlineBlock(`${keyPrefix}-empty`, [], firstContext)];

  const out: TuiMarkdownBlock[] = [];
  let usedLead = false;
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
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
    const startsNestedList =
      child.type === "list" &&
      out.length > 0 &&
      out[out.length - 1]?.type === "inline" &&
      childBlocks[0]?.type === "inline";
    if (
      out.length &&
      out[out.length - 1]?.type !== "blank" &&
      childBlocks[0]?.type !== "blank" &&
      !startsNestedList
    ) {
      out.push({ type: "blank", key: `${keyPrefix}-${i}-gap` });
    }
    out.push(...childBlocks);
    usedLead = true;
  }

  if (!out.length) out.push(inlineBlock(`${keyPrefix}-fallback`, [], firstContext));
  return out;
}

function listBlocks(
  node: TuiMarkdownNode,
  context: BlockContext,
  theme: TuiMarkdownTheme,
  keyPrefix: string,
): TuiMarkdownBlock[] {
  const out: TuiMarkdownBlock[] = [];
  const items = nodeItems(node);
  for (let i = 0; i < items.length; i++) {
    out.push(
      ...listItemBlocks(
        items[i]!,
        i,
        booleanProp(node, "ordered"),
        numberProp(node, "start") ?? 1,
        context,
        theme,
        `${keyPrefix}-${i}`,
      ),
    );
  }
  return out;
}

function nodeToBlocks(
  node: TuiMarkdownNode,
  context: BlockContext,
  theme: TuiMarkdownTheme,
  keyPrefix: string,
): TuiMarkdownBlock[] {
  switch (node.type) {
    case "paragraph":
      if ("children" in node && Array.isArray(node.children))
        return [blockFromParagraph(node, keyPrefix, context, theme)];
      break;
    case "heading":
      if ("children" in node && Array.isArray(node.children) && "level" in node)
        return [blockFromHeading(node, keyPrefix, context, theme)];
      break;
    case "code_block":
      if ("code" in node) return [blockFromCodeBlock(node, keyPrefix, context, theme)];
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
        return listBlocks(node, context, theme, keyPrefix);
      break;
    case "inline":
      return [inlineBlock(keyPrefix, inlineNodeSegments(nodeChildren(node), theme), context)];
    case "html_block":
      if ("content" in node) return [blockFromHtmlBlock(node, keyPrefix, context, theme)];
      break;
    case "text":
      return [inlineBlock(keyPrefix, inlineNodeSegments([node], theme), context)];
  }
  if (nodeChildren(node).length)
    return childSequenceToBlocks(nodeChildren(node), context, theme, keyPrefix);
  return [inlineBlock(keyPrefix, inlineNodeSegments([node], theme), context)];
}

export function markdownAstToBlocks(
  nodes: readonly TuiMarkdownNode[],
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
