// Static approximate USD -> INR rate. Good enough for a rough "estimated
// salary" display badge, NOT for anything financial/contractual.We can swap this
// for a live FX API (e.g. exchangerate.host, a daily-cached rate) if the
// business ever needs this to be accurate rather than indicative.
const USD_TO_INR_RATE = 95.98;

export function convertUsdToInr(usd: number): number {
  return Math.round(usd * USD_TO_INR_RATE);
}