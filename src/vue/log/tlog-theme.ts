import type { Style } from "../../core/types.js";
import type { TLogSearchBar } from "../components/TLogSearchBar.js";
import type { TLogSearchPager } from "../components/TLogSearchPager.js";
import type { TLogVirtualLinksPanel } from "../components/TLogVirtualLinksPanel.js";
import type { TLogVirtualSearchResults } from "../components/TLogVirtualSearchResults.js";
import type { TLogMinimap } from "../components/TLogMinimap.js";
import type { TLogScrollbar } from "../components/TLogScrollbar.js";
import type { TLogView } from "../components/TLogView.js";
import type { TLogKeymap } from "./tlog-keymap.js";
import { tlogDefaultKeymap, tlogHighContrastKeymap } from "./tlog-keymap.js";

export type TLogTheme = Readonly<{
  base?: Style;
  error?: Style;
  warning?: Style;
  info?: Style;
  search?: Readonly<{
    match?: Style;
    currentMatch?: Style;
    input?: Style;
    error?: Style;
    active?: Style;
    disabled?: Style;
  }>;
  links?: Readonly<{
    link?: Style;
    focused?: Style;
    active?: Style;
    disabled?: Style;
  }>;
  scrollbar?: Readonly<{
    track?: Style;
    thumb?: Style;
    measuring?: Style;
    marker?: Style;
    currentMarker?: Style;
  }>;
  minimap?: Readonly<{
    density?: Style;
    viewport?: Style;
    marker?: Style;
    currentMarker?: Style;
    estimated?: Style;
  }>;
}>;

export type TLogUiPreset = Readonly<{
  theme: TLogTheme;
  keymap: TLogKeymap;
}>;

type SearchBarThemeProps = Partial<InstanceType<typeof TLogSearchBar>["$props"]>;
type SearchResultsThemeProps = Partial<InstanceType<typeof TLogVirtualSearchResults>["$props"]>;
type SearchPagerThemeProps = Partial<InstanceType<typeof TLogSearchPager>["$props"]>;
type LinksPanelThemeProps = Partial<InstanceType<typeof TLogVirtualLinksPanel>["$props"]>;
type ScrollbarThemeProps = Partial<InstanceType<typeof TLogScrollbar>["$props"]>;
type MinimapThemeProps = Partial<InstanceType<typeof TLogMinimap>["$props"]>;
type LogViewThemeProps = Partial<InstanceType<typeof TLogView>["$props"]>;

export const tlogDefaultTheme: TLogTheme = Object.freeze({
  base: Object.freeze({ fg: "whiteBright" }),
  error: Object.freeze({ fg: "redBright", bold: true }),
  warning: Object.freeze({ fg: "yellowBright", bold: true }),
  info: Object.freeze({ fg: "cyanBright" }),
  search: Object.freeze({
    match: Object.freeze({ inverse: true }),
    currentMatch: Object.freeze({ inverse: true, bold: true }),
    input: Object.freeze({}),
    error: Object.freeze({ fg: "redBright", bold: true }),
    active: Object.freeze({ inverse: true }),
    disabled: Object.freeze({ dim: true }),
  }),
  links: Object.freeze({
    link: Object.freeze({ underline: true, fg: "cyanBright" }),
    focused: Object.freeze({ inverse: true }),
    active: Object.freeze({ inverse: true }),
    disabled: Object.freeze({ dim: true }),
  }),
  scrollbar: Object.freeze({
    track: Object.freeze({ dim: true }),
    thumb: Object.freeze({ fg: "whiteBright" }),
    measuring: Object.freeze({ fg: "yellowBright" }),
    marker: Object.freeze({ fg: "yellowBright" }),
    currentMarker: Object.freeze({ fg: "redBright", bold: true }),
  }),
  minimap: Object.freeze({
    density: Object.freeze({ fg: "blueBright" }),
    viewport: Object.freeze({ fg: "whiteBright" }),
    marker: Object.freeze({ fg: "yellowBright" }),
    currentMarker: Object.freeze({ fg: "redBright", bold: true }),
    estimated: Object.freeze({ dim: true }),
  }),
});

export const tlogDarkTheme: TLogTheme = Object.freeze({
  ...tlogDefaultTheme,
  base: Object.freeze({ fg: "#d0d7de" }),
  links: Object.freeze({
    ...tlogDefaultTheme.links,
    link: Object.freeze({ underline: true, fg: "#79c0ff" }),
  }),
});

export const tlogHighContrastTheme: TLogTheme = Object.freeze({
  ...tlogDefaultTheme,
  base: Object.freeze({ fg: "whiteBright", bg: "black" }),
  search: Object.freeze({
    ...tlogDefaultTheme.search,
    match: Object.freeze({ fg: "black", bg: "yellowBright", bold: true }),
    currentMatch: Object.freeze({ fg: "black", bg: "redBright", bold: true }),
  }),
  links: Object.freeze({
    ...tlogDefaultTheme.links,
    link: Object.freeze({ fg: "whiteBright", underline: true, bold: true }),
    focused: Object.freeze({ fg: "black", bg: "cyanBright", bold: true }),
  }),
});

export const tlogDefaultPreset: TLogUiPreset = Object.freeze({
  theme: tlogDefaultTheme,
  keymap: tlogDefaultKeymap,
});

export const tlogDarkPreset: TLogUiPreset = Object.freeze({
  theme: tlogDarkTheme,
  keymap: tlogDefaultKeymap,
});

export const tlogHighContrastPreset: TLogUiPreset = Object.freeze({
  theme: tlogHighContrastTheme,
  keymap: tlogHighContrastKeymap,
});

export function resolveTLogViewTheme(theme: TLogTheme): LogViewThemeProps {
  return {
    style: theme.base,
    linkStyle: theme.links?.link,
    linkFocusStyle: theme.links?.focused,
    matchStyle: theme.search?.match,
    currentMatchStyle: theme.search?.currentMatch,
  };
}

export function resolveTLogSearchBarTheme(theme: TLogTheme): SearchBarThemeProps {
  return {
    style: theme.base,
    inputStyle: theme.search?.input,
    activeStyle: theme.search?.active,
    errorStyle: theme.search?.error,
    disabledStyle: theme.search?.disabled,
    toggleStyle: theme.base,
  };
}

export function resolveTLogSearchResultsTheme(theme: TLogTheme): SearchResultsThemeProps {
  return {
    style: theme.base,
    activeStyle: theme.search?.active,
  };
}

export function resolveTLogSearchPagerTheme(theme: TLogTheme): SearchPagerThemeProps {
  return {
    style: theme.base,
    activeStyle: theme.search?.active,
    disabledStyle: theme.search?.disabled,
    errorStyle: theme.search?.error,
  };
}

export function resolveTLogLinksPanelTheme(theme: TLogTheme): LinksPanelThemeProps {
  return {
    style: theme.base,
    activeStyle: theme.links?.active,
  };
}

export function resolveTLogScrollbarTheme(theme: TLogTheme): ScrollbarThemeProps {
  return {
    style: theme.base,
    trackStyle: theme.scrollbar?.track,
    thumbStyle: theme.scrollbar?.thumb,
    measuringStyle: theme.scrollbar?.measuring,
    markerStyle: theme.scrollbar?.marker,
    currentMarkerStyle: theme.scrollbar?.currentMarker,
  };
}

export function resolveTLogMinimapTheme(theme: TLogTheme): MinimapThemeProps {
  return {
    style: theme.base,
    densityStyle: theme.minimap?.density,
    viewportStyle: theme.minimap?.viewport,
    markerStyle: theme.minimap?.marker,
    currentMarkerStyle: theme.minimap?.currentMarker,
    estimatedStyle: theme.minimap?.estimated,
  };
}
