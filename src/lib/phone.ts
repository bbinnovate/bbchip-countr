/** Returns the number in international format, or null if it isn't valid. Assumes India without a country code. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  const local = digits.replace(/^(?:0|91)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}
