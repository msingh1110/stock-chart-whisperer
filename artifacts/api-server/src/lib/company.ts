import { logger } from "./logger";

const ALPACA_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET = process.env.ALPACA_API_SECRET;
const TRADING_BASE_URL = "https://paper-api.alpaca.markets";

/**
 * Hardcoded names for the default portfolio — always instant, no API call.
 */
const HARDCODED: Record<string, string> = {
  NVDA: "NVIDIA Corporation",
  MSFT: "Microsoft Corporation",
  AAPL: "Apple Inc.",
  META: "Meta Platforms Inc.",
  SOFI: "SoFi Technologies Inc.",
  HOOD: "Robinhood Markets Inc.",
  SHEL: "Shell plc",
  LMT:  "Lockheed Martin Corporation",
};

/**
 * In-memory cache for names fetched from the Alpaca Assets API.
 * Key: uppercase ticker. Value: company name (or "" if unavailable).
 */
const cache = new Map<string, string>();

/**
 * Attempt to resolve a company name for any ticker symbol.
 *
 * Resolution order:
 *   1. Hardcoded map  (instant, no network)
 *   2. In-memory cache (from a previous API call)
 *   3. Alpaca Trading API  GET /v2/assets/{symbol}
 *   4. Empty string fallback (graceful — never throws)
 */
export async function getCompanyName(ticker: string): Promise<string> {
  const symbol = ticker.toUpperCase();

  if (HARDCODED[symbol]) return HARDCODED[symbol];
  if (cache.has(symbol)) return cache.get(symbol)!;

  try {
    if (!ALPACA_KEY || !ALPACA_SECRET) {
      cache.set(symbol, "");
      return "";
    }

    const url = `${TRADING_BASE_URL}/v2/assets/${encodeURIComponent(symbol)}`;
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      logger.warn({ symbol, status: res.status }, "Alpaca assets API returned non-OK");
      cache.set(symbol, "");
      return "";
    }

    const data = (await res.json()) as { name?: string };
    const name = (data.name ?? "").trim();
    cache.set(symbol, name);
    return name;
  } catch (err) {
    logger.warn({ symbol, err }, "Failed to fetch company name from Alpaca");
    cache.set(symbol, "");
    return "";
  }
}
