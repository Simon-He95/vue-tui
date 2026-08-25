import type { TVideoFrame, TVideoFrameFormat } from "../video/types.js";

export type TBrowserModifiers = Readonly<{
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}>;

export type TBrowserInputEvent =
  | Readonly<{
      type: "pointermove" | "pointerdown" | "pointerup";
      x: number;
      y: number;
      button?: number;
      buttons?: number;
      modifiers: TBrowserModifiers;
    }>
  | Readonly<{
      type: "wheel";
      x: number;
      y: number;
      deltaY: number;
      modifiers: TBrowserModifiers;
    }>
  | Readonly<{
      type: "keydown" | "keyup";
      key: string;
      code: string;
      repeat: boolean;
      modifiers: TBrowserModifiers;
    }>
  | Readonly<{
      type: "text" | "paste";
      text: string;
    }>;

export type TBrowserSessionContext = Readonly<{
  url: string;
  signal: AbortSignal;
  maxFps: number;
  pixelWidth: number;
  pixelHeight: number;
  preferredFormat: TVideoFrameFormat;
  onNavigate: (url: string) => void;
  onTitleChange: (title: string) => void;
}>;

export type TBrowserSession = Readonly<{
  frames: AsyncIterable<TVideoFrame>;
  dispatch: (event: TBrowserInputEvent) => void | Promise<void>;
  navigate?: (url: string) => void | Promise<void>;
  back?: () => void | Promise<void>;
  forward?: () => void | Promise<void>;
  reload?: () => void | Promise<void>;
  newPage?: () => void | Promise<void>;
  closePage?: () => boolean | void | Promise<boolean | void>;
  close: () => void | Promise<void>;
}>;

export type TBrowserSessionFactory = (
  context: TBrowserSessionContext,
) => TBrowserSession | Promise<TBrowserSession>;
