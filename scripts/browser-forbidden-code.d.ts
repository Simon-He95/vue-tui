export const BROWSER_FORBIDDEN_MODULES: string;
export const FORBIDDEN_BROWSER_CODE: readonly RegExp[];
export function findBrowserForbiddenCode(source: string): RegExp | null;
export function assertNoBrowserForbiddenCode(source: string, context?: string): void;
