/**
 * Normalises Pakistani mobile numbers to E.164 (+923XXXXXXXXX).
 * Accepts 03XXXXXXXXX, 3XXXXXXXXX, 923XXXXXXXXX, +92 3XX XXXXXXX, 0092..., with spaces/dashes.
 * Returns null when the input is not a valid PK mobile number.
 */
export function normalizePkMobile(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('0092')) digits = digits.slice(2);
  if (digits.startsWith('92')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^3\d{9}$/.test(digits) ? `+92${digits}` : null;
}
