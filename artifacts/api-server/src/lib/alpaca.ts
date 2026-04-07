import { logger } from "./logger";

const ALPACA_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET = process.env.ALPACA_API_SECRET;
const DATA_BASE_URL = "https://data.alpaca.markets";

export interface AlpacaBar {
  t: string; // timestamp ISO
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

export interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function alpacaHeaders() {
  if (!ALPACA_KEY || !ALPACA_SECRET) {
    throw new Error(
      "ALPACA_API_KEY and ALPACA_API_SECRET must be set",
    );
  }
  return {
    "APCA-API-KEY-ID": ALPACA_KEY,
    "APCA-API-SECRET-KEY": ALPACA_SECRET,
    Accept: "application/json",
  };
}

function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

/**
 * Fetch daily bars for a single ticker over the last ~300 calendar days
 * (which gives roughly 200+ trading days).
 */
async function fetchBarsForTicker(ticker: string): Promise<DailyBar[]> {
  const start = nDaysAgo(300);
  const url = new URL(`${DATA_BASE_URL}/v2/stocks/${encodeURIComponent(ticker)}/bars`);
  url.searchParams.set("timeframe", "1Day");
  url.searchParams.set("start", start);
  url.searchParams.set("limit", "300");
  url.searchParams.set("feed", "iex");
  url.searchParams.set("sort", "asc");

  const res = await fetch(url.toString(), {
    headers: alpacaHeaders(),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error({ ticker, status: res.status, body }, "Alpaca API error");
    throw new Error(`Alpaca API error ${res.status} for ${ticker}: ${body}`);
  }

  const json = (await res.json()) as {
    bars: AlpacaBar[];
    next_page_token?: string;
  };

  const bars = json.bars ?? [];
  return bars.map((b) => ({
    date: b.t.split("T")[0],
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
  }));
}

/**
 * Fetch daily bars for a list of tickers in parallel.
 * Returns a map of ticker -> sorted DailyBar[]
 */
export async function fetchDailyBars(
  tickers: string[],
): Promise<Record<string, DailyBar[]>> {
  logger.info({ tickers }, "Fetching daily bars from Alpaca (individual requests)");

  const results = await Promise.all(
    tickers.map(async (ticker) => {
      const bars = await fetchBarsForTicker(ticker);
      return { ticker, bars };
    }),
  );

  const result: Record<string, DailyBar[]> = {};
  for (const { ticker, bars } of results) {
    result[ticker] = bars;
  }

  return result;
}
