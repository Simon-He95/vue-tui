export const TERMINAL_RENDER_PLANES = ["default", "transcript", "chrome", "overlay"] as const;

export type TerminalRenderPlane = (typeof TERMINAL_RENDER_PLANES)[number];

export type TerminalRenderPlanes = readonly TerminalRenderPlane[];
