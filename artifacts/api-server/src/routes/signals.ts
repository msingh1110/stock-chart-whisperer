import { Router, type IRouter } from "express";
import { fetchDailyBars } from "../lib/alpaca";
import { analyzeStock } from "../lib/indicators";
import { enrichWithFinnhub, fetchFundamentalsSnapshot, fetchDetailedNews } from "../lib/finnhub";
import { getCompanyName } from "../lib/company";
import { getActiveModel } from "../lib/probability-store";
import { PORTFOLIO_TICKERS } from "../lib/portfolio";
import {
  GetAllSignalsResponse,
  GetSignalByTickerParams,
  GetSignalByTickerResponse,
  GetPortfolioSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  modelId: number;
}
const CACHE_TTL_MS = 5 * 60 * 1000;
let signalsCache: CacheEntry<ReturnType<typeof analyzeStock>[]> | null = null;

async function fetchAllSignals() {
  const now = Date.now();
  const model = await getActiveModel();
  if (signalsCache && signalsCache.modelId === model.id && now - signalsCache.fetchedAt < CACHE_TTL_MS) {
    return signalsCache.data;
  }

  // Fetch bars and Finnhub enrichments in parallel
  const [barsMap, enrichments] = await Promise.all([
    fetchDailyBars(PORTFOLIO_TICKERS, true),
    Promise.all(PORTFOLIO_TICKERS.map((t) => enrichWithFinnhub(t))),
  ]);

  const analyses = PORTFOLIO_TICKERS.map((ticker, i) =>
    analyzeStock(ticker, barsMap[ticker] ?? [], enrichments[i], model.parameters),
  );

  signalsCache = { data: analyses, fetchedAt: now, modelId: model.id };
  return analyses;
}

// GET /signals
router.get("/signals", async (req, res): Promise<void> => {
  const analyses = await fetchAllSignals();
  const payload = await Promise.all(
    analyses.map(async (a) => ({
      ticker:            a.ticker,
      currentPrice:      a.currentPrice,
      prevClose:         a.prevClose,
      ma20:              a.ma20,
      ma50:              a.ma50,
      rsi:               a.rsi,
      price5dAgo:        a.price5dAgo,
      signal:            a.signal,
      confidenceTier:    a.confidenceTier,
      explanation:       a.explanation,
      change:            a.change,
      changePercent:     a.changePercent,
      lastUpdated:       a.lastUpdated,
      upProbability:     a.upProbability,
      downProbability:   a.downProbability,
      finalScore:        a.finalScore,
      trendScore:        a.trendScore,
      momentumScore:     a.momentumScore,
      rsiScore:          a.rsiScore,
      volumeScore:       a.volumeScore,
      newsScore:         a.newsScore,
      socialScore:       a.socialScore,
      fundamentalsScore: a.fundamentalsScore,
      momentum:          a.momentum,
      volume:            a.volume,
      averageVolume:     a.averageVolume,
      volumeRatio:       a.volumeRatio,
      finnhubContext:    a.finnhubContext,
      company:           await getCompanyName(a.ticker),
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

  let bars: Awaited<ReturnType<typeof fetchDailyBars>>[string];
  try {
    const barsMap = await fetchDailyBars([ticker], true);
    bars = barsMap[ticker] ?? [];
  } catch {
    res.status(404).json({ error: `Ticker ${ticker} not found or data unavailable` });
    return;
  }

  if (!bars || bars.length === 0) {
    res.status(404).json({ error: `No data available for ticker ${ticker}` });
    return;
  }

  const [enrichment, fundamentalsSnapshot, latestNews, company] = await Promise.all([
    enrichWithFinnhub(ticker),
    fetchFundamentalsSnapshot(ticker),
    fetchDetailedNews(ticker, 3),
    getCompanyName(ticker),
  ]);
  const model = await getActiveModel();
  const analysis = analyzeStock(ticker, bars, enrichment, model.parameters);
  res.json(GetSignalByTickerResponse.parse({ ...analysis, company, fundamentalsSnapshot, latestNews }));
});

// GET /portfolio/summary
router.get("/portfolio/summary", async (req, res): Promise<void> => {
  const analyses = await fetchAllSignals();

  const buyCount  = analyses.filter((a) => a.signal === "BUY").length;
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
