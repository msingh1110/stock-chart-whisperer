import { Router, type IRouter } from "express";
import { fetchDailyBars } from "../lib/alpaca";
import { analyzeStock } from "../lib/indicators";
import {
  GetAllSignalsResponse,
  GetSignalByTickerParams,
  GetSignalByTickerResponse,
  GetPortfolioSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const PORTFOLIO_TICKERS = ["NVDA", "MSFT", "AAPL", "META", "SOFI", "HOOD"];

// Simple in-memory cache — bust after 5 minutes
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}
const CACHE_TTL_MS = 5 * 60 * 1000;
let signalsCache: CacheEntry<ReturnType<typeof analyzeStock>[]> | null = null;

async function fetchAllSignals() {
  const now = Date.now();
  if (signalsCache && now - signalsCache.fetchedAt < CACHE_TTL_MS) {
    return signalsCache.data;
  }

  const barsMap = await fetchDailyBars(PORTFOLIO_TICKERS);
  const analyses = PORTFOLIO_TICKERS.map((ticker) =>
    analyzeStock(ticker, barsMap[ticker] ?? []),
  );

  signalsCache = { data: analyses, fetchedAt: now };
  return analyses;
}

// GET /signals
router.get("/signals", async (req, res): Promise<void> => {
  const analyses = await fetchAllSignals();
  const payload = analyses.map((a) => ({
    ticker: a.ticker,
    currentPrice: a.currentPrice,
    ma20: a.ma20,
    ma50: a.ma50,
    rsi: a.rsi,
    signal: a.signal,
    change: a.change,
    changePercent: a.changePercent,
    lastUpdated: a.lastUpdated,
  }));
  res.json(GetAllSignalsResponse.parse(payload));
});

// GET /signals/:ticker
router.get("/signals/:ticker", async (req, res): Promise<void> => {
  const params = GetSignalByTickerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const ticker = params.data.ticker.toUpperCase();
  if (!PORTFOLIO_TICKERS.includes(ticker)) {
    res.status(404).json({ error: `Ticker ${ticker} not in portfolio` });
    return;
  }

  // Always fetch full detail for individual ticker requests
  const barsMap = await fetchDailyBars([ticker]);
  const analysis = analyzeStock(ticker, barsMap[ticker] ?? []);

  res.json(GetSignalByTickerResponse.parse(analysis));
});

// GET /portfolio/summary
router.get("/portfolio/summary", async (req, res): Promise<void> => {
  const analyses = await fetchAllSignals();

  const buyCount = analyses.filter((a) => a.signal === "BUY").length;
  const sellCount = analyses.filter((a) => a.signal === "SELL").length;
  const holdCount = analyses.filter((a) => a.signal === "HOLD").length;

  const summary = {
    totalStocks: PORTFOLIO_TICKERS.length,
    buyCount,
    sellCount,
    holdCount,
    lastUpdated: new Date().toISOString(),
    tickers: PORTFOLIO_TICKERS,
  };

  res.json(GetPortfolioSummaryResponse.parse(summary));
});

export default router;
