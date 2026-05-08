export type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;

export type TerminalEventType =
  | "click"
  | "dblclick"
  | "contextmenu"
  | "pointerdown"
  | "pointerup"
  | "pointermove"
  | "pointerenter"
  | "pointerleave"
  | "wheel"
  | "keydown"
  | "keyup"
  | "beforeinput"
  | "input"
  | "compositionstart"
  | "compositionupdate"
  | "compositionend"
  | "paste"
  | "focus"
  | "blur";

export interface TerminalBaseEvent {
  type: TerminalEventType;
  target: TerminalNode | null;
  currentTarget: TerminalNode | null;
  eventPhase: 1 | 2 | 3;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented: boolean;
  timeStamp: number;
  stopPropagation: () => void;
  preventDefault: () => void;
  composedPath: () => TerminalNode[];
  nativeEvent?: Event;
}

export type TerminalPointerEvent = TerminalBaseEvent & {
  clientX: number;
  clientY: number;
  cellX: number;
  cellY: number;
  button?: number;
  buttons?: number;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  deltaY?: number;
  deltaMode?: number;
};

export type TerminalKeyboardEvent = TerminalBaseEvent & {
  key: string;
  code: string;
  combo: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
};

export type TerminalInputEvent = TerminalBaseEvent & {
  inputType?: string;
  data?: string;
  isComposing?: boolean;
  text?: string;
};

export type TerminalEventHandlerMap = Partial<{
  clickCapture: (e: TerminalPointerEvent) => void;
  click: (e: TerminalPointerEvent) => void;
  dblclickCapture: (e: TerminalPointerEvent) => void;
  dblclick: (e: TerminalPointerEvent) => void;
  contextmenuCapture: (e: TerminalPointerEvent) => void;
  contextmenu: (e: TerminalPointerEvent) => void;
  pointerdownCapture: (e: TerminalPointerEvent) => void;
  pointerdown: (e: TerminalPointerEvent) => void;
  pointerupCapture: (e: TerminalPointerEvent) => void;
  pointerup: (e: TerminalPointerEvent) => void;
  pointermoveCapture: (e: TerminalPointerEvent) => void;
  pointermove: (e: TerminalPointerEvent) => void;
  pointerenterCapture: (e: TerminalPointerEvent) => void;
  pointerenter: (e: TerminalPointerEvent) => void;
  pointerleaveCapture: (e: TerminalPointerEvent) => void;
  pointerleave: (e: TerminalPointerEvent) => void;
  wheelCapture: (e: TerminalPointerEvent) => void;
  wheel: (e: TerminalPointerEvent) => void;
  keydownCapture: (e: TerminalKeyboardEvent) => void;
  keydown: (e: TerminalKeyboardEvent) => void;
  keyupCapture: (e: TerminalKeyboardEvent) => void;
  keyup: (e: TerminalKeyboardEvent) => void;
  beforeinputCapture: (e: TerminalInputEvent) => void;
  beforeinput: (e: TerminalInputEvent) => void;
  inputCapture: (e: TerminalInputEvent) => void;
  input: (e: TerminalInputEvent) => void;
  compositionstartCapture: (e: TerminalInputEvent) => void;
  compositionstart: (e: TerminalInputEvent) => void;
  compositionupdateCapture: (e: TerminalInputEvent) => void;
  compositionupdate: (e: TerminalInputEvent) => void;
  compositionendCapture: (e: TerminalInputEvent) => void;
  compositionend: (e: TerminalInputEvent) => void;
  pasteCapture: (e: TerminalInputEvent) => void;
  paste: (e: TerminalInputEvent) => void;
  focusCapture: (e: TerminalBaseEvent) => void;
  focus: (e: TerminalBaseEvent) => void;
  blurCapture: (e: TerminalBaseEvent) => void;
  blur: (e: TerminalBaseEvent) => void;
}>;

export interface TerminalNode {
  id: string;
  rect: Rect;
  zIndex: number;
  visible?: boolean;
  focusable?: boolean;
  selectable?: boolean;
  selectionScrollBy?: (deltaRows: number) => boolean | void;
  handlers: TerminalEventHandlerMap;
}

export type TerminalDebugNode = Readonly<{
  id: string;
  rect: Rect;
  zIndex: number;
  visible: boolean;
  focusable: boolean;
}>;
