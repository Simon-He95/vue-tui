import type { RendererOptions } from "vue";
import { createRenderer } from "vue";

export type HeadlessNode = HeadlessElement | HeadlessText | HeadlessComment;

export interface HeadlessRoot {
  children: HeadlessNode[];
}

export interface HeadlessElement {
  type: string;
  parent: HeadlessElement | HeadlessRoot | null;
  children: HeadlessNode[];
  props: Record<string, unknown>;
  style: Record<string, unknown>;
  className?: string;
  textContent?: string;
  setAttribute?: (key: string, value: string) => void;
  removeAttribute?: (key: string) => void;
}

export interface HeadlessText {
  type: "text";
  parent: HeadlessElement | HeadlessRoot | null;
  text: string;
}

export interface HeadlessComment {
  type: "comment";
  parent: HeadlessElement | HeadlessRoot | null;
  text: string;
}

function createElement(type: string): HeadlessElement {
  const el: HeadlessElement = {
    type,
    parent: null,
    children: [],
    props: {},
    style: {},
  };
  el.setAttribute = (key, value) => {
    el.props[key] = value;
  };
  el.removeAttribute = (key) => {
    delete el.props[key];
  };
  return el;
}

function insert(
  child: HeadlessNode,
  parent: HeadlessElement | HeadlessRoot,
  anchor?: HeadlessNode | null,
): void {
  child.parent = parent as any;
  const list = parent.children;
  if (!anchor) {
    list.push(child);
    return;
  }
  const idx = list.indexOf(anchor);
  if (idx < 0) {
    list.push(child);
    return;
  }
  list.splice(idx, 0, child);
}

function remove(child: HeadlessNode): void {
  const parent = child.parent;
  if (!parent) return;
  const list = parent.children;
  const idx = list.indexOf(child);
  if (idx >= 0) list.splice(idx, 1);
  child.parent = null;
}

function parentNode(node: HeadlessNode): HeadlessElement | HeadlessRoot | null {
  return node.parent;
}

function nextSibling(node: HeadlessNode): HeadlessNode | null {
  const parent = node.parent;
  if (!parent) return null;
  const idx = parent.children.indexOf(node);
  if (idx < 0) return null;
  return parent.children[idx + 1] ?? null;
}

function setElementText(el: HeadlessElement, text: string): void {
  el.textContent = text;
  el.children = [];
}

function createText(text: string): HeadlessText {
  return { type: "text", parent: null, text };
}

function setText(node: HeadlessText, text: string): void {
  node.text = text;
}

function createComment(text: string): HeadlessComment {
  return { type: "comment", parent: null, text };
}

function patchProp(
  el: HeadlessElement,
  key: string,
  _prevValue: unknown,
  nextValue: unknown,
): void {
  if (key === "style" && nextValue && typeof nextValue === "object") {
    Object.assign(el.style, nextValue as any);
    return;
  }
  if (key === "class") {
    el.className = typeof nextValue === "string" ? nextValue : "";
    return;
  }
  el.props[key] = nextValue as any;
}

const rendererOptions: RendererOptions<HeadlessNode, HeadlessElement | HeadlessRoot> = {
  patchProp: patchProp as any,
  insert: insert as any,
  remove: remove as any,
  createElement: createElement as any,
  createText: createText as any,
  createComment: createComment as any,
  setText: setText as any,
  setElementText: setElementText as any,
  parentNode: parentNode as any,
  nextSibling: nextSibling as any,
};

const renderer = createRenderer(rendererOptions);

export function createHeadlessApp(...args: Parameters<typeof renderer.createApp>) {
  return renderer.createApp(...args);
}

export function createHeadlessRoot(): HeadlessRoot {
  return { children: [] };
}
