export type TerminalEventRecord =
  | Readonly<{
      type: "keydown" | "keyup";
      key: string;
      code?: string;
      ctrlKey?: boolean;
      shiftKey?: boolean;
      altKey?: boolean;
      metaKey?: boolean;
      repeat?: boolean;
      time?: number;
    }>
  | Readonly<{
      type: "pointerdown" | "pointerup" | "pointermove" | "click" | "dblclick" | "contextmenu";
      cellX: number;
      cellY: number;
      clientX?: number;
      clientY?: number;
      button?: number;
      buttons?: number;
      ctrlKey?: boolean;
      shiftKey?: boolean;
      altKey?: boolean;
      metaKey?: boolean;
      time?: number;
    }>
  | Readonly<{
      type: "wheel";
      cellX: number;
      cellY: number;
      clientX?: number;
      clientY?: number;
      deltaY: number;
      ctrlKey?: boolean;
      shiftKey?: boolean;
      altKey?: boolean;
      metaKey?: boolean;
      time?: number;
    }>
  | Readonly<{
      type:
        | "beforeinput"
        | "input"
        | "compositionstart"
        | "compositionupdate"
        | "compositionend"
        | "paste";
      data?: string;
      inputType?: string;
      isComposing?: boolean;
      text?: string;
      time?: number;
    }>;
