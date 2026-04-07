/**
 * Natural language → ticker symbol resolver.
 *
 * Resolution order:
 *   1. Exact match in the company-name map (case-insensitive)
 *   2. Partial match in the company-name map (starts-with, then contains)
 *   3. Input looks like a valid ticker symbol  (1-10 uppercase letters / dot)
 *   4. null → caller should show an error
 */

export interface ResolveResult {
  ticker: string;
  /** True when the result came from the company-name map (not a direct ticker). */
  wasMapped: boolean;
  /** Human-readable company name used in the "Mapped to:" feedback message. */
  displayName: string;
}

/** Predefined company name → ticker mappings (keys are uppercase). */
const COMPANY_MAP: Record<string, { ticker: string; displayName: string }> = {
  APPLE:     { ticker: "AAPL", displayName: "Apple Inc." },
  MICROSOFT: { ticker: "MSFT", displayName: "Microsoft Corporation" },
  NVIDIA:    { ticker: "NVDA", displayName: "NVIDIA Corporation" },
  META:      { ticker: "META", displayName: "Meta Platforms Inc." },
  FACEBOOK:  { ticker: "META", displayName: "Meta Platforms Inc." },
  SOFI:      { ticker: "SOFI", displayName: "SoFi Technologies Inc." },
  ROBINHOOD: { ticker: "HOOD", displayName: "Robinhood Markets Inc." },
};

/** Regex for a valid ticker symbol: 1–10 uppercase letters or dots (BRK.B, etc.) */
const TICKER_RE = /^[A-Z.]{1,10}$/;

export function resolveTicker(raw: string): ResolveResult | null {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return null;

  // 1. Exact match in company map
  const exact = COMPANY_MAP[normalized];
  if (exact) {
    return { ticker: exact.ticker, wasMapped: normalized !== exact.ticker, displayName: exact.displayName };
  }

  // 2. Partial match — score: 2 for starts-with, 1 for contains
  let best: { ticker: string; displayName: string } | null = null;
  let bestScore = 0;

  for (const [key, value] of Object.entries(COMPANY_MAP)) {
    let score = 0;
    if (key.startsWith(normalized)) score = 2;
    else if (key.includes(normalized)) score = 1;

    if (score > bestScore) {
      bestScore = score;
      best = value;
    }
  }

  if (best) {
    return { ticker: best.ticker, wasMapped: true, displayName: best.displayName };
  }

  // 3. Looks like a valid ticker symbol
  if (TICKER_RE.test(normalized)) {
    return { ticker: normalized, wasMapped: false, displayName: "" };
  }

  // 4. Could not resolve
  return null;
}
