/** All money is stored and calculated as integer paisa (1 PKR = 100 paisa). */
export type Paisa = number;

export function assertPaisa(value: number): Paisa {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Invalid paisa amount: ${value}`);
  }
  return value;
}

export function rupeesToPaisa(rupees: number | string): Paisa {
  const n = typeof rupees === 'string' ? Number(rupees.replace(/[,\s]/g, '')) : rupees;
  if (!Number.isFinite(n)) throw new RangeError(`Invalid rupee amount: ${rupees}`);
  return assertPaisa(Math.round(n * 100));
}

/** Matches the storefront's existing format, e.g. "Rs.999.00 PKR". */
export function formatPkr(paisa: Paisa): string {
  assertPaisa(paisa);
  const rupees = Math.floor(paisa / 100).toLocaleString('en-US');
  const fraction = String(paisa % 100).padStart(2, '0');
  return `Rs.${rupees}.${fraction} PKR`;
}

/** Percentage of an amount, rounded to the nearest paisa. Basis points avoid float drift. */
export function percentOf(paisa: Paisa, basisPoints: number): Paisa {
  assertPaisa(paisa);
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new RangeError(`Invalid basis points: ${basisPoints}`);
  }
  return Math.round((paisa * basisPoints) / 10_000);
}
