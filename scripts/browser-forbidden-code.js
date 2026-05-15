export const BROWSER_FORBIDDEN_MODULES =
  "fs|path|url|buffer|child_process|process|os|module|util|stream|events";

const BROWSER_FORBIDDEN_IMPORT_TARGET = String.raw`(?:node:)?(?:${BROWSER_FORBIDDEN_MODULES})(?:/[^"']*)?`;

export const FORBIDDEN_BROWSER_CODE = [
  new RegExp(
    String.raw`\b(?:import|export)\s+(?:[^;"']*?\bfrom\s*)["']${BROWSER_FORBIDDEN_IMPORT_TARGET}["']`,
    "u",
  ),
  new RegExp(String.raw`\bimport\s*["']${BROWSER_FORBIDDEN_IMPORT_TARGET}["']`, "u"),
  new RegExp(String.raw`\bimport\s*\(\s*["']${BROWSER_FORBIDDEN_IMPORT_TARGET}["']\s*\)`, "u"),
  new RegExp(String.raw`\brequire\s*\(\s*["']${BROWSER_FORBIDDEN_IMPORT_TARGET}["']\s*\)`, "u"),
  /\bprocess\.(?:stdout|stderr|stdin|env)\b/u,
  /\bnew Function\b/u,
  /\bcreateOsc52ClipboardProvider\b/u,
  /\bcreateDefaultTInputHostAdapter\b/u,
  /\bcreateNodeMentionPathProvider\b/u,
];

export function findBrowserForbiddenCode(source) {
  return FORBIDDEN_BROWSER_CODE.find((pattern) => pattern.test(source)) ?? null;
}

export function assertNoBrowserForbiddenCode(source, context = "browser code") {
  const pattern = findBrowserForbiddenCode(source);
  if (pattern) throw new Error(`${context} contains forbidden code: ${pattern}`);
}
