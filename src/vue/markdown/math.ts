import katex from "katex";
import { sanitizeInlineText } from "../utils/text.js";

const KATEX_TEXT_OPTIONS = Object.freeze({
  output: "mathml" as const,
  throwOnError: false,
  strict: "ignore" as const,
  trust: false,
  maxSize: 20,
  maxExpand: 200,
});

const TEX_SYMBOLS: Readonly<Record<string, string>> = Object.freeze({
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Omega: "Ω",
  int: "∫",
  sum: "∑",
  prod: "∏",
  infty: "∞",
  infinity: "∞",
  pm: "±",
  times: "×",
  cdot: "·",
  div: "÷",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  partial: "∂",
  nabla: "∇",
  sqrt: "√",
});

function decodeXmlEntities(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (match, dec, hex, named) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    switch (String(named).toLowerCase()) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        return match;
    }
  });
}

function textFromKatexMathml(html: string): string {
  const withoutAnnotations = html.replace(/<annotation\b[\s\S]*?<\/annotation>/gi, "");
  const readable = withoutAnnotations
    .replace(/<mfrac\b[^>]*>/gi, "(")
    .replace(/<\/mfrac>/gi, ")")
    .replace(/<mspace\b[^>]*\/>/gi, " ")
    .replace(/<\/m(?:row|style|sqrt|sup|sub|subsup|over|under|underover)>/gi, "")
    .replace(/<[^>]+>/g, "");
  const text = sanitizeInlineText(decodeXmlEntities(readable).replace(/\s+/g, " ").trim());
  return text;
}

function approximateTexToUnicode(tex: string): string {
  let out = String(tex ?? "");
  out = out.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1/$2");
  out = out.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  out = out.replace(
    /\\([A-Za-z]+)\b/g,
    (_match, command: string) => TEX_SYMBOLS[command] ?? command,
  );
  out = out.replace(/\\([^A-Za-z])/g, "$1");
  out = out.replace(/[{}]/g, "");
  out = out.replace(/\s+/g, " ").trim();
  return sanitizeInlineText(out);
}

export function renderMarkdownInlineMath(tex: string): string {
  const source = String(tex ?? "");
  if (!source.trim()) return "";

  try {
    const html = katex.renderToString(source, KATEX_TEXT_OPTIONS);
    const rendered = /\\frac\b/.test(source)
      ? approximateTexToUnicode(source)
      : textFromKatexMathml(html);
    if (rendered && !rendered.includes("\\")) return rendered;
  } catch {
    // Fall through to deterministic Unicode approximation.
  }

  return approximateTexToUnicode(source);
}
