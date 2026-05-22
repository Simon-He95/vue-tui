import type {
  TCommandPaletteItem,
  TCommandPaletteSelectPayload,
  TSelectMultipleChangePayload,
  TSelectMultipleEmitMode,
  TSelectValueMode,
} from "@simon_he/vue-tui";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type Assert<T extends true> = T;

type _TSelectMultipleChangePayloadShape = Assert<
  Equal<
    TSelectMultipleChangePayload,
    Readonly<{
      indices: number[];
      labels: string[];
      values: string[];
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
