export const ENCODED_CONTROL_RE = /%(?:0[0-9a-f]|1[0-9a-f]|7f|8[0-9a-f]|9[0-9a-f])/i;

export function hasEncodedControl(value: string): boolean {
  return ENCODED_CONTROL_RE.test(value);
}
