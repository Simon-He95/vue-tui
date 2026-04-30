import type { Component } from "vue";

export type TerminalRoute = Readonly<{
  name: string;
  params?: Readonly<Record<string, string>>;
  meta?: unknown;
}>;

export type TerminalRouteRecord = Readonly<{
  name: string;
  component: Component;
  meta?: unknown;
  onEnter?: (to: TerminalRoute, from: TerminalRoute | null) => void | Promise<void>;
  onLeave?: (to: TerminalRoute, from: TerminalRoute | null) => void | Promise<void>;
}>;

export type TerminalRouteLocationRaw =
  | string
  | Readonly<{ name: string; params?: Record<string, string> }>;

export type NavigationGuardReturn = void | boolean | TerminalRouteLocationRaw;

export type NavigationGuard = (
  to: TerminalRoute,
  from: TerminalRoute | null,
) => NavigationGuardReturn | Promise<NavigationGuardReturn>;

export type TerminalRouter = Readonly<{
  currentRoute: import("vue").Ref<TerminalRoute>;
  push: (to: TerminalRouteLocationRaw) => Promise<void>;
  replace: (to: TerminalRouteLocationRaw) => Promise<void>;
  back: () => Promise<void>;
  beforeEach: (guard: NavigationGuard) => () => void;
  beforeResolve: (guard: NavigationGuard) => () => void;
  afterEach: (guard: (to: TerminalRoute, from: TerminalRoute | null) => void) => () => void;
  install: (app: import("vue").App) => void;
}>;
