import type { Ref } from "vue";
import type {
  TLogViewHandle,
  TLogViewLinkActivatePayload,
  TLogViewLinkClickPayload,
  TLogViewVisibleLink,
} from "../components/TLogView.js";
import type { TLogLinkPanelItem } from "../components/TLogLinksPanel.js";
import { ref, watch } from "vue";

export type TLogLinkActionSource = "click" | "keyboard" | "programmatic" | "panel";

export type TLogLinkAction = Readonly<{
  href: string;
  text: string;
  source: TLogLinkActionSource;
  absoluteLineIndex: number;
  index: number;
  startCell: number;
  endCell: number;
}>;

export type UseTLogLinkControllerOptions = Readonly<{
  onAction?: (action: TLogLinkAction) => void;
}>;

function toPanelItem(link: TLogViewVisibleLink): TLogLinkPanelItem {
  return {
    visibleIndex: link.visibleIndex,
    href: link.href,
    text: link.text,
    absoluteLineIndex: link.absoluteLineIndex,
    index: link.index,
    startCell: link.startCell,
    endCell: link.endCell,
    current: link.focused === true || undefined,
  };
}

function toActionFromLink(
  link: Pick<
    TLogViewVisibleLink,
    "href" | "text" | "absoluteLineIndex" | "index" | "startCell" | "endCell"
  >,
  source: TLogLinkActionSource,
): TLogLinkAction {
  return {
    href: link.href,
    text: link.text,
    source,
    absoluteLineIndex: link.absoluteLineIndex,
    index: link.index,
    startCell: link.startCell,
    endCell: link.endCell,
  };
}

function actionKey(
  value: Pick<
    TLogLinkAction,
    "href" | "absoluteLineIndex" | "index" | "startCell" | "endCell" | "source"
  >,
): string {
  return JSON.stringify([
    value.href,
    value.absoluteLineIndex,
    value.index,
    value.startCell,
    value.endCell,
    value.source,
  ]);
}

export function useTLogLinkController(
  logView: Ref<TLogViewHandle | null>,
  options: UseTLogLinkControllerOptions = {},
): {
  visibleLinks: Ref<readonly TLogLinkPanelItem[]>;
  activeIndex: Ref<number>;
  refresh: () => void;
  focusVisibleLink: (visibleIndex: number) => boolean;
  focusNextLink: () => boolean;
  focusPreviousLink: () => boolean;
  clearFocus: () => void;
  activateVisibleLink: (visibleIndex: number) => boolean;
  activateFocusedLink: () => boolean;
  handleLinkClick: (payload: TLogViewLinkClickPayload) => void;
  handleLinkActivate: (payload: TLogViewLinkActivatePayload) => void;
} {
  const visibleLinks = ref<readonly TLogLinkPanelItem[]>([]);
  const activeIndex = ref(-1);
  let suppressedActivateKey: string | null = null;

  function emitAction(action: TLogLinkAction): void {
    options.onAction?.(action);
  }

  function suppressProgrammaticActivation(link: TLogLinkPanelItem): void {
    const key = actionKey({
      href: link.href,
      absoluteLineIndex: link.absoluteLineIndex,
      index: link.index,
      startCell: link.startCell,
      endCell: link.endCell,
      source: "programmatic",
    });
    suppressedActivateKey = key;
    queueMicrotask(() => {
      if (suppressedActivateKey === key) suppressedActivateKey = null;
    });
  }

  function refresh(): void {
    const next = logView.value?.getVisibleLinks().map(toPanelItem) ?? [];
    visibleLinks.value = next;
    activeIndex.value = next.findIndex((link) => link.current === true);
  }

  function focusVisibleLink(visibleIndex: number): boolean {
    const focused = logView.value?.focusVisibleLink(visibleIndex) === true;
    refresh();
    return focused;
  }

  function focusNextLink(): boolean {
    const focused = logView.value?.focusNextLink() === true;
    refresh();
    return focused;
  }

  function focusPreviousLink(): boolean {
    const focused = logView.value?.focusPreviousLink() === true;
    refresh();
    return focused;
  }

  function clearFocus(): void {
    logView.value?.clearLinkFocus();
    refresh();
  }

  function activateVisibleLink(visibleIndex: number): boolean {
    if (!focusVisibleLink(visibleIndex)) return false;
    const link = visibleLinks.value[activeIndex.value];
    const handle = logView.value;
    if (!link || !handle) return false;
    suppressProgrammaticActivation(link);
    const activated = handle.activateFocusedLink();
    if (!activated) {
      suppressedActivateKey = null;
      refresh();
      return false;
    }
    emitAction(toActionFromLink(link, "panel"));
    refresh();
    return true;
  }

  function activateFocusedLink(): boolean {
    const link = visibleLinks.value[activeIndex.value];
    const handle = logView.value;
    if (!link || !handle) return false;
    suppressProgrammaticActivation(link);
    const activated = handle.activateFocusedLink();
    if (!activated) {
      suppressedActivateKey = null;
      refresh();
      return false;
    }
    emitAction(toActionFromLink(link, "programmatic"));
    refresh();
    return true;
  }

  function handleLinkClick(payload: TLogViewLinkClickPayload): void {
    emitAction({
      href: payload.href,
      text: payload.text,
      source: "click",
      absoluteLineIndex: payload.absoluteLineIndex,
      index: payload.index,
      startCell: payload.startCell,
      endCell: payload.endCell,
    });
    refresh();
  }

  function handleLinkActivate(payload: TLogViewLinkActivatePayload): void {
    const action = toActionFromLink(payload.link, payload.source);
    const key = actionKey(action);
    if (suppressedActivateKey === key) {
      suppressedActivateKey = null;
      refresh();
      return;
    }
    emitAction(action);
    refresh();
  }

  watch(
    () => logView.value,
    () => {
      refresh();
    },
    { immediate: true },
  );

  return {
    visibleLinks,
    activeIndex,
    refresh,
    focusVisibleLink,
    focusNextLink,
    focusPreviousLink,
    clearFocus,
    activateVisibleLink,
    activateFocusedLink,
    handleLinkClick,
    handleLinkActivate,
  };
}
