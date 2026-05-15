export type Ref<T, Meta> = {
  value: T;
  meta: Meta;
};

export type Example = Ref<string, { source: "not-vue" }>;
