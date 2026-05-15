import type { DefineComponent, Ref } from "vue";

export declare const TExample: DefineComponent<
  { value: string },
  { focus: () => void },
  {},
  {},
  {},
  {},
  {},
  {},
  string,
  import("vue").VNodeProps &
    import("vue").AllowedComponentProps &
    import("vue").ComponentCustomProps,
  Readonly<{ value: string }>,
  {},
  {}
>;

export declare const count: Ref<number>;
