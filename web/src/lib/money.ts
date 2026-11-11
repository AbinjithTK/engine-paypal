/**
 * Money. See DESIGN.md §5.
 *
 * Amounts are ALWAYS integers in the currency's smallest unit.
 * Never a float. Never parseFloat on a currency value.
 *   USD  -> cents            (2 decimals)
 *   USDC -> base units       (6 decimals)
 */

/**
 * EQUITY is a currency, not a separate subsystem.
 *
 * It is stored in integer basis points of a company: 250 = 2.50%. That single
 * decision means every rule in this file already applies to it — integers only,
 * truncate never round up, tabular-nums, splits that sum exactly. A founder
 * short on cash can price work in equity and nothing else in the codebase
 * needs to know.
 */
export type Currency = "USD" | "USDC" | "EQUITY";

export type Money = {
  /** Integer, in the smallest unit of `currency`. */
  amount: number;
  currency: Currency;
};

const DECIMALS: Record<Currency, number> = { USD: 2, USDC: 6, EQUITY: 2 };
const SYMBOL: Partial<Record<Currency, string>> = { USD: "$" };
const SUFFIX: Partial<Record<Currency, string>> = { USDC: "USDC" };
/** Suffixes that attach with no space. */
const TIGHT_SUFFIX: Partial<Record<Currency, string>> = { EQUITY: "%" };

export function isEquity(m: Money): boolean {
  return m.currency === "EQUITY";
}

export function money(amount: number, currency: Currency): Money {
  if (!Number.isInteger(amount)) {
    throw new Error(
      `Money must be an integer in minor units, received ${amount}. See DESIGN.md §5.1.`,
    );
  }
  return { amount, currency };
}

/**
 * Split into whole and fractional parts, truncating toward zero.
 * Truncation is deliberate: showing a contractor more than they will
 * receive is a trust failure, so we never round up.
 */
function split(m: Money, displayDecimals: number) {
  const decimals = DECIMALS[m.currency];
  const scale = 10 ** decimals;
  const negative = m.amount < 0;
  const abs = Math.abs(m.amount);

  const whole = Math.trunc(abs / scale);
  const fracFull = String(abs % scale).padStart(decimals, "0");
  const frac = fracFull.slice(0, displayDecimals);

  return { negative, whole, frac };
}

export function formatMoney(
  m: Money,
  opts: { precision?: "display" | "full"; showUnit?: boolean } = {},
): string {
  const { precision = "display", showUnit = true } = opts;
  const displayDecimals =
    precision === "full" ? DECIMALS[m.currency] : Math.min(2, DECIMALS[m.currency]);

  const { negative, whole, frac } = split(m, displayDecimals);
  const grouped = whole.toLocaleString("en-US");
  const body = displayDecimals > 0 ? `${grouped}.${frac}` : grouped;

  const symbol = showUnit ? (SYMBOL[m.currency] ?? "") : "";
  const suffix = showUnit && SUFFIX[m.currency] ? ` ${SUFFIX[m.currency]}` : "";
  const tight = showUnit ? (TIGHT_SUFFIX[m.currency] ?? "") : "";

  return `${negative ? "-" : ""}${symbol}${body}${tight}${suffix}`;
}

/** Platform take rate. Integer maths only — see prd.md §12.1. */
export function takeRate(m: Money, basisPoints: number): Money {
  return money(Math.floor((m.amount * basisPoints) / 10_000), m.currency);
}
