export interface GraphemeSegment {
  segment: string;
  index: number;
}

type GraphemeSegmenter = {
  segment(input: string): Iterable<GraphemeSegment>;
};
type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locales?: string | string[],
    options?: Readonly<{ granularity?: "grapheme" }>,
  ) => GraphemeSegmenter;
};

let graphemeSegmenter: GraphemeSegmenter | null = null;
try {
  const Segmenter = typeof Intl !== "undefined" ? (Intl as IntlWithSegmenter).Segmenter : undefined;
  graphemeSegmenter = Segmenter ? new Segmenter(undefined, { granularity: "grapheme" }) : null;
} catch {
  graphemeSegmenter = null;
}

let unicodeMarkRe: RegExp | null = null;
try {
  // eslint-disable-next-line prefer-regex-literals
  unicodeMarkRe = new RegExp("\\p{Mark}", "u");
} catch {
  unicodeMarkRe = null;
}

function needsGraphemeSegmentation(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x200d) return true;
    if ((cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)) return true;
    if (isCombiningMark(cp)) return true;
    if (cp >= 0x1f3fb && cp <= 0x1f3ff) return true;
    if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return true;
    if (cp >= 0xe0000 && cp <= 0xe007f) return true;
  }
  return false;
}

function isVariationSelector(codePoint: number): boolean {
  return (
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  );
}

function isCombiningMark(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    isDevanagariMark(codePoint) ||
    unicodeMarkRe?.test(String.fromCodePoint(codePoint)) === true
  );
}

function isDevanagariMark(codePoint: number): boolean {
  return (
    (codePoint >= 0x0900 && codePoint <= 0x0903) ||
    (codePoint >= 0x093a && codePoint <= 0x093c) ||
    (codePoint >= 0x093e && codePoint <= 0x094f) ||
    (codePoint >= 0x0951 && codePoint <= 0x0957) ||
    (codePoint >= 0x0962 && codePoint <= 0x0963)
  );
}

function isVirama(codePoint: number): boolean {
  return codePoint === 0x094d;
}

function isEmojiModifier(codePoint: number): boolean {
  return codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
}

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

function isEmojiTag(codePoint: number): boolean {
  return codePoint >= 0xe0000 && codePoint <= 0xe007f;
}

function fallbackGraphemeSegments(text: string): readonly GraphemeSegment[] {
  const out: GraphemeSegment[] = [];
  let segment = "";
  let segmentStart = 0;
  let pos = 0;
  let regionalIndicators = 0;
  let joinNext = false;

  const pushSegment = () => {
    if (segment) out.push({ segment, index: segmentStart });
  };

  for (const ch of text) {
    const codePoint = ch.codePointAt(0)!;
    const chStart = pos;
    pos += ch.length;

    const attach =
      segment !== "" &&
      (joinNext ||
        codePoint === 0x200d ||
        isVariationSelector(codePoint) ||
        isCombiningMark(codePoint) ||
        isEmojiModifier(codePoint) ||
        isEmojiTag(codePoint) ||
        (isRegionalIndicator(codePoint) && regionalIndicators === 1));

    if (!attach) {
      pushSegment();
      segment = ch;
      segmentStart = chStart;
      regionalIndicators = isRegionalIndicator(codePoint) ? 1 : 0;
    } else {
      segment += ch;
      if (isRegionalIndicator(codePoint)) regionalIndicators++;
      else if (!isVariationSelector(codePoint) && !isCombiningMark(codePoint))
        regionalIndicators = 0;
    }

    if (codePoint === 0x200d || isVirama(codePoint)) joinNext = true;
    else if (joinNext && !isVariationSelector(codePoint) && !isCombiningMark(codePoint)) {
      joinNext = false;
    }
  }

  pushSegment();
  return out;
}

export function segmentedGraphemes(text: string): Iterable<GraphemeSegment> | null {
  if (!needsGraphemeSegmentation(text)) return null;
  if (graphemeSegmenter) return graphemeSegmenter.segment(text);
  return fallbackGraphemeSegments(text);
}
