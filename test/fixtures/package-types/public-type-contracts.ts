import type {
  DialogButton,
  SelectOptionWithStyle,
  Style,
  TAutocompleteLoadErrorPayload,
  TAutocompleteOption,
  TAutocompleteSelectPayload,
  TCommandPaletteItem,
  TCommandPaletteLoadErrorPayload,
  TCommandPaletteSelectPayload,
  TSelectMultipleChangePayload,
  TSelectMultipleEmitMode,
  TSelectValueMode,
} from "@simon_he/vue-tui";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type Assert<T extends true> = T;

type _DialogButtonShape = Assert<
  Equal<
    DialogButton,
    Readonly<{
      label: string;
      value?: unknown;
      id?: string;
      kind?: "default" | "primary" | "danger" | "muted" | "accent";
      default?: boolean;
      style?: Style;
      selectedStyle?: Style;
    }>
  >
>;

type _SelectOptionWithStyleShape = Assert<
  SelectOptionWithStyle extends Readonly<{
    kind?: "option" | "separator" | "group";
    label: string;
    value?: unknown;
    disabled?: boolean;
    detail?: string;
    style?: Style;
  }>
    ? true
    : false
>;

type _TSelectMultipleChangePayloadShape = Assert<
  Equal<
    TSelectMultipleChangePayload,
    Readonly<{
      indices: number[];
      labels: string[];
      values: unknown[];
    }>
  >
>;

type _TSelectMultipleEmitModeShape = Assert<
  Equal<TSelectMultipleEmitMode, "label" | "value" | "index" | "both">
>;

type _TSelectValueModeShape = Assert<Equal<TSelectValueMode, "index" | "value" | "option">>;

type _TCommandPaletteSelectPayloadShape = Assert<
  Equal<
    TCommandPaletteSelectPayload,
    Readonly<{
      item: TCommandPaletteItem;
      index: number;
      sourceIndex: number;
      query: string;
      source: "keyboard" | "pointer";
    }>
  >
>;

type _TCommandPaletteLoadErrorPayloadShape = Assert<
  Equal<TCommandPaletteLoadErrorPayload, Readonly<{ query: string; error: unknown }>>
>;

type _TAutocompleteLoadErrorPayloadShape = Assert<
  Equal<TAutocompleteLoadErrorPayload, Readonly<{ query: string; error: unknown }>>
>;

type _TAutocompleteSelectPayloadShape = Assert<
  Equal<
    TAutocompleteSelectPayload,
    Readonly<{
      value: string;
      index: number;
      sourceIndex: number;
      option: TAutocompleteOption;
      query: string;
      source: "keyboard" | "pointer";
    }>
  >
>;
