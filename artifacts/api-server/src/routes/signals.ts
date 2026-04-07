import { Router, type IRouter } from "express";
import { fetchDailyBars } from "../lib/alpaca";
import { analyzeStock } from "../lib/indicators";
import { getCompanyName } from "../lib/company";
import {
  GetAllSignalsResponse,
  GetSignalByTickerParams,
  GetSignalByTickerResponse,
  GetPortfolioSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const PORTFOLIO_TICKERS = ["NVDA", "MSFT", "AAPL", "META", "SOFI", "HOOD", "SHEL", "LMT", "IAU", "SLV"];

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
  const payload = await Promise.all(
    analyses.map(async (a) => ({
      ticker:         a.ticker,
      currentPrice:   a.currentPrice,
      prevClose:      a.prevClose,
      ma20:           a.ma20,
      ma50:           a.ma50,
      rsi:            a.rsi,
      price5dAgo:     a.price5dAgo,
      signal:         a.signal,
      confidenceTier: a.confidenceTier,
      change:         a.change,
      changePercent:  a.changePercent,
      lastUpdated:    a.lastUpdated,
      upProbability:  a.upProbability,
      downProbability: a.downProbability,
      finalScore:     a.finalScore,
      trendScore:     a.trendScore,
      momentumScore:  a.momentumScore,
      rsiScore:       a.rsiScore,
      volumeScore:    a.volumeScore,
      momentum:       a.momentum,
      volume:         a.volume,
      averageVolume:  a.averageVolume,
      volumeRatio:    a.volumeRatio,
      company:        await getCompanyName(a.ticker),
    })),
  );
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

  // Fetch and analyse any valid ticker (not restricted to the portfolio)
  let bars: Awaited<ReturnType<typeof fetchDailyBars>>[string];
  try {
    const barsMap = await fetchDailyBars([ticker]);
    bars = barsMap[ticker] ?? [];
  } catch {
    res.status(404).json({ error: `Ticker ${ticker} not found or data unavailable` });
    return;
  }

  if (!bars || bars.length === 0) {
    res.status(404).json({ error: `No data available for ticker ${ticker}` });
    return;
  }

  const analysis = analyzeStock(ticker, bars);
  const company = await getCompanyName(ticker);
  res.json(GetSignalByTickerResponse.parse({ ...analysis, company }));
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
