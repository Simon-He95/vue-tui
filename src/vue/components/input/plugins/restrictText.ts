import type { TInputPlugin } from "./types.js";

export type TextRestrictionRule = Readonly<
  | { allowChars: RegExp }
  | { denyChars: RegExp }
  | { replace: Readonly<{ from: RegExp; to: string }> }
  | { allow: RegExp }
  | {
      filter: (
        info: Readonly<{
          text: string;
          value: string;
          cursor: number;
          selection: null | Readonly<{ start: number; end: number }>;
        }>,
      ) => string;
    }
>;

function computeProposedValue(
  info: Readonly<{
    value: string;
    cursor: number;
    selection: null | Readonly<{ start: number; end: number }>;
  }>,
  text: string,
): string {
  const start = info.selection ? info.selection.start : info.cursor;
  const end = info.selection ? info.selection.end : info.cursor;
  return info.value.slice(0, start) + text + info.value.slice(end);
}

function applyRule(
  rule: TextRestrictionRule,
  info: Readonly<{
    text: string;
    value: string;
    cursor: number;
    selection: null | Readonly<{ start: number; end: number }>;
  }>,
): string {
  if ("filter" in rule) return rule.filter(info);

  if ("replace" in rule) return info.text.replace(rule.replace.from, rule.replace.to);

  if ("allowChars" in rule) {
    let out = "";
    for (const ch of info.text) {
      if (rule.allowChars.test(ch)) out += ch;
    }
    return out;
  }

  if ("denyChars" in rule) return info.text.replace(rule.denyChars, "");

  if ("allow" in rule) {
    const next = computeProposedValue(info, info.text);
    return rule.allow.test(next) ? info.text : "";
  }

  return info.text;
}

export function createTextRestrictionPlugin(
  options: Readonly<{ name?: string; rules: readonly TextRestrictionRule[] }>,
): TInputPlugin {
  const name = options.name ?? "restrictText";
  const rules = options.rules ?? [];
  return {
    name,
    install(ctx) {
      ctx.registerTextFilter((info) => {
        const originalText = info.text;
        let text = info.text;
        for (const rule of rules) {
          text = applyRule(rule, { ...info, text });
          if (!text) {
            if (originalText) {
              ctx.emit("validationError", {
                plugin: name,
                kind: "reject",
                originalText,
                acceptedText: "",
                value: info.value,
                cursor: info.cursor,
                selection: info.selection,
              });
            }
            return "";
          }
        }
        if (originalText && text !== originalText) {
          ctx.emit("validationError", {
            plugin: name,
            kind: "filter",
            originalText,
            acceptedText: text,
            value: info.value,
            cursor: info.cursor,
            selection: info.selection,
          });
        }
        return text;
      });
    },
  };
}
