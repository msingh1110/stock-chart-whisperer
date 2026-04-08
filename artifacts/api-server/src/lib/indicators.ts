import { DailyBar } from "./alpaca";
import { FinnhubEnrichment, FinnhubContext, NULL_ENRICHMENT } from "./finnhub";

// ── Simple Indicators ──────────────────────────────────────────────────────

/**
 * Simple moving average over the last `period` closes ending at index `i`.
 */
export function sma(closes: number[], i: number, period: number): number | null {
  if (i < period - 1) return null;
  let sum = 0;
  for (let j = i - period + 1; j <= i; j++) sum += closes[j];
  return sum / period;
}

/**
 * RSI using simple rolling mean of gains/losses over `period` bars.
 * Matches the Python script: gain.rolling(period).mean() / loss.rolling(period).mean().
 * First valid value emits at index `period`. NaN positions stay null (caller falls back to 50).
 */
export function computeRSI(closes: number[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    let sumGain = 0;
    let sumLoss = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const delta = closes[j] - closes[j - 1];
      if (delta > 0) sumGain += delta;
      else           sumLoss -= delta;
    }
    const avgGain = sumGain / period;
    const avgLoss = sumLoss / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type SignalType = "BUY" | "SELL" | "HOLD";
export type ConfidenceTier = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";

export type { FinnhubContext };

export interface PriceBarWithIndicators {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  ma20: number | null;
  ma50: number | null;
}

export interface StockAnalysis {
  ticker: string;
  currentPrice: number;
  prevClose: number;
  ma20: number;
  ma50: number;
  rsi: number;
  price5dAgo: number;
  signal: SignalType;
  confidenceTier: ConfidenceTier;
  explanation: string;
  change: number;
  changePercent: number;
  lastUpdated: string;
  upProbability: number;
  downProbability: number;
  finalScore: number;
  trendScore: number;
  momentumScore: number;
  rsiScore: number;
  volumeScore: number;
  newsScore: number;
  socialScore: number;
  fundamentalsScore: number;
  momentum: number;
  volume: number;
  averageVolume: number;
  volumeRatio: number;
  finnhubContext: FinnhubContext;
  priceHistory: PriceBarWithIndicators[];
}

// ── Scoring Config (tune weights & thresholds here) ───────────────────────

const WEIGHTS = {
  trend:        0.32,
  momentum:     0.23,
  rsi:          0.13,
  volume:       0.15,
  news:         0.10,
  social:       0.04,
  fundamentals: 0.02,
  // insider: 0.01 — reserved for future use; omitted (always 0)
} as const;

// upProbability is in 0–100 range throughout
const THRESHOLDS = {
  strongBuy:  80,
  buy:        65,
  sell:       35, // upProb <= 35 ⟺ downProb >= 65
  strongSell: 20, // upProb <= 20 ⟺ downProb >= 80
} as const;

// ── Component Scorers ──────────────────────────────────────────────────────

/**
 * Trend score in [-1, +1].
 *   +0.5 if price > MA20 else -0.5
 *   +0.5 if MA20  > MA50 else -0.5
 */
function computeTrendScore(price: number, ma20: number, ma50: number): number {
  return (price > ma20 ? 0.5 : -0.5) + (ma20 > ma50 ? 0.5 : -0.5);
}

/**
 * Momentum score in [-1, +1].
 * raw = (price - price5dAgo) / price5dAgo
 * Clamped: max(-1, min(1, raw * 5))
 */
function computeMomentumScore(price: number, price5dAgo: number): number {
  const raw = (price - price5dAgo) / price5dAgo;
  return Math.max(-1, Math.min(1, raw * 5));
}

/**
 * RSI score in [-1, +1].
 *   rsi < 40  → -1   (bearish)
 *   40–49     → -0.5 (weak)
 *   50–65     → +0.5 (healthy bullish)
 *   66–75     → +0.2 (extended, caution)
 *   > 75      → -0.5 (overbought)
 */
function computeRsiScore(rsi: number): number {
  if (rsi < 40)  return -1;
  if (rsi < 50)  return -0.5;
  if (rsi <= 65) return 0.5;
  if (rsi <= 75) return 0.2;
  return -0.5;
}

/**
 * Continuous volume score in [-1, +1].
 *
 * 1. Scales with volume_ratio (capped at 3×), giving proportional signals
 *    instead of the old binary ±1.
 * 2. Breakout amplification: ±0.2 bonus when price crosses MA50 with high volume.
 * 3. Low-volume penalty: halves the score when ratio < 0.8 (low conviction).
 * 4. Spike multiplier: ×1.2 when ratio > 2× (confirms strong participation).
 */
function computeVolumeScore(
  volumeRatio: number,
  price:       number,
  prevClose:   number,
  ma20:        number,
  ma50:        number,
): number {
  const ratio       = Math.min(volumeRatio, 3.0);
  const priceChange = (price - prevClose) / prevClose;

  let score: number;
  if (priceChange > 0)      score = Math.min((ratio - 1) * 1.2, 1.0);
  else if (priceChange < 0) score = Math.max(-(ratio - 1) * 1.2, -1.0);
  else                      score = 0;

  // Breakout amplification: reward confirmed breakouts / breakdowns
  if (price > ma20 && price > ma50 && ratio > 1.5)
    score = Math.min(score + 0.2, 1.0);
  if (price < ma20 && price < ma50 && ratio > 1.5)
    score = Math.max(score - 0.2, -1.0);

  // Low-volume penalty: weak participation → reduce conviction
  if (ratio < 0.8) score *= 0.5;

  // Volume spike amplifier: strong participation → boost signal
  if (ratio > 2) score = Math.max(-1, Math.min(1, score * 1.2));

  return score;
}

// ── Explanation Builder ────────────────────────────────────────────────────

function buildExplanation(
  trendScore:           number,
  momentumScore:        number,
  rsi:                  number,
  volumeScore:          number,
  volumeRatio:          number,
  confidenceTier:       ConfidenceTier,
  price:                number,
  ma20:                 number,
  ma50:                 number,
  newsScore:            number,
  newsSentimentSummary: "positive" | "neutral" | "negative",
): string {
  const aboveMa20     = price > ma20;
  const aboveMa50     = price > ma50;
  const ma20AboveMa50 = ma20  > ma50;

  const rsiN = Math.round(rsi);

  const rsiBullish    = rsi >= 50 && rsi <= 65;
  const rsiBearish    = rsi < 40;
  const rsiOverbought = rsi > 75;
  const rsiWeak       = rsi >= 40 && rsi < 50;

  const mStrong = momentumScore >= 0.4;
  const mMild   = momentumScore >= 0.1;
  const mBear   = momentumScore <= -0.2;

  const newsPositive = newsScore >= 0.3 && newsSentimentSummary === "positive";
  const newsNegative = newsScore <= -0.3 && newsSentimentSummary === "negative";

  // Volume context phrases — only fire when ratio is clearly elevated or muted
  const volHigh  = volumeRatio >= 1.5;
  const volMid   = volumeRatio >= 1.2 && volumeRatio < 1.5;
  const volLow   = volumeRatio < 0.8;

  const volBullPhrase = volHigh ? "elevated volume confirming buying conviction"
                      : volMid  ? "above-average volume supporting the move"
                      : null;
  const volBearPhrase = volHigh ? "heavy volume reinforcing selling pressure"
                      : volMid  ? "above-average volume confirming distribution"
                      : null;
  const volLowPhrase  = volLow  ? "muted volume suggesting limited conviction" : null;

  switch (confidenceTier) {
    case "STRONG BUY": {
      const maStr = aboveMa20 && aboveMa50
        ? "well above MA20 and MA50"
        : "above key moving averages";
      const factors: string[] = [];
      if (mStrong)           factors.push("strong upside momentum");
      else if (mMild)        factors.push("improving momentum");
      if (volBullPhrase)     factors.push(volBullPhrase);
      else if (rsiBullish)   factors.push(`RSI at ${rsiN} in a healthy bullish range`);
      if (newsPositive && factors.length < 2) factors.push("supportive news flow");
      const tail = factors.length ? `, with ${factors.slice(0, 2).join(" and ")}` : "";
      return `Price is trading ${maStr}${tail}, signaling high-conviction bullish momentum.`;
    }

    case "BUY": {
      const maStr = aboveMa20 && aboveMa50
        ? "above MA20 and MA50"
        : aboveMa20
          ? "above MA20"
          : "near key moving averages";
      const factors: string[] = [];
      if (mStrong || mMild)  factors.push("positive momentum");
      if (rsiBullish)        factors.push(`RSI at ${rsiN} in a healthy range`);
      if (volBullPhrase && factors.length < 2) factors.push(volBullPhrase);
      if (newsPositive && factors.length < 2)  factors.push("supportive news flow");
      const top = factors.slice(0, 2);
      if (top.length === 0) {
        if (volLowPhrase) return `Price is holding ${maStr}, though ${volLowPhrase}.`;
        return `Price is holding ${maStr}.`;
      }
      if (top.length === 1) return `Price is holding ${maStr}, with ${top[0]} supporting the upside.`;
      return `Price is holding ${maStr}, while ${top.join(" and ")} favor upside.`;
    }

    case "HOLD": {
      const maStr       = aboveMa20 ? "above MA20" : "below MA20";
      const maAlignNote = ma20AboveMa50
        ? "longer-term trend remains intact"
        : "longer-term trend is under pressure";
      const rsiNote = rsiBullish
        ? `RSI at ${rsiN} is constructive but momentum lacks conviction`
        : rsiBearish
          ? `RSI at ${rsiN} reflects weakness without a clear reversal`
          : rsiOverbought
            ? `RSI at ${rsiN} is stretched, capping near-term upside`
            : `RSI at ${rsiN} is neutral`;
      // Volume color for HOLD — low conviction note is especially useful here
      const volTail = volLowPhrase ? ` while ${volLowPhrase} behind the move`
                    : newsPositive ? " while news flow leans positive"
                    : newsNegative ? " while news flow is cautious"
                    : "";
      return `Price is trading ${maStr} with no strong directional edge — ${rsiNote} and the ${maAlignNote}${volTail}.`;
    }

    case "SELL": {
      const maStr = !aboveMa20 && !aboveMa50
        ? "below MA20 and MA50"
        : !aboveMa20
          ? "below MA20"
          : "below key support";
      const factors: string[] = [];
      if (mBear)            factors.push("weakening momentum");
      if (rsiBearish)       factors.push(`RSI at ${rsiN} in oversold territory`);
      else if (rsiWeak)     factors.push(`soft RSI at ${rsiN}`);
      if (volBearPhrase && factors.length < 2) factors.push(volBearPhrase);
      if (newsNegative && factors.length < 2)  factors.push("negative news sentiment");
      const top = factors.slice(0, 2);
      if (top.length === 0) return `Price is trading ${maStr}, reinforcing a bearish setup.`;
      if (top.length === 1) return `Price is trading ${maStr}, with ${top[0]} reinforcing the bearish setup.`;
      return `Price is trading ${maStr}, with ${top.join(" and ")} reinforcing the bearish setup.`;
    }

    case "STRONG SELL": {
      const maStr = !aboveMa20 && !aboveMa50
        ? "below MA20 and MA50"
        : "below key moving averages";
      const factors: string[] = [];
      if (mBear)             factors.push("negative momentum");
      if (rsiBearish)        factors.push(`RSI at ${rsiN} in deeply oversold territory`);
      if (volBearPhrase)     factors.push(volBearPhrase);
      if (newsNegative)      factors.push("negative news sentiment");
      if (factors.length < 2) factors.push("deteriorating technicals across the board");
      return `Price remains ${maStr}, while ${factors.slice(0, 2).join(" and ")} signal persistent selling pressure.`;
    }
  }
}

// ── Aggregation & Signal Mapping ───────────────────────────────────────────

/**
 * Weighted final score → stays roughly within [-1, +1].
 */
function aggregateScore(
  trendScore:        number,
  momentumScore:     number,
  rsiScore:          number,
  volumeScore:       number,
  newsScore:         number,
  socialScore:       number,
  fundamentalsScore: number,
): number {
  return (
    WEIGHTS.trend        * trendScore        +
    WEIGHTS.momentum     * momentumScore     +
    WEIGHTS.rsi          * rsiScore          +
    WEIGHTS.volume       * volumeScore       +
    WEIGHTS.news         * newsScore         +
    WEIGHTS.social       * socialScore       +
    WEIGHTS.fundamentals * fundamentalsScore
    // + 0.01 * insiderScore (always 0 — reserved)
  );
}

/**
 * Linear normalization: up_prob = (finalScore + 1) / 2 clamped to [0, 1].
 * Returns probabilities as 0–100 integers for the frontend.
 */
function scoreToProb(finalScore: number): { upProbability: number; downProbability: number } {
  const up = Math.max(0, Math.min(1, (finalScore + 1) / 2));
  return {
    upProbability:   Math.round(up * 100),
    downProbability: Math.round((1 - up) * 100),
  };
}

function mapSignal(upProbability: number): SignalType {
  if (upProbability >= THRESHOLDS.buy)  return "BUY";
  if (upProbability <= THRESHOLDS.sell) return "SELL";
  return "HOLD";
}

function mapConfidenceTier(upProbability: number): ConfidenceTier {
  if (upProbability >= THRESHOLDS.strongBuy)  return "STRONG BUY";
  if (upProbability >= THRESHOLDS.buy)        return "BUY";
  if (upProbability <= THRESHOLDS.strongSell) return "STRONG SELL";
  if (upProbability <= THRESHOLDS.sell)       return "SELL";
  return "HOLD";
}

// ── Main Analyzer ──────────────────────────────────────────────────────────

export function analyzeStock(
  ticker:     string,
  bars:       DailyBar[],
  enrichment: FinnhubEnrichment = NULL_ENRICHMENT,
): StockAnalysis {
  if (bars.length < 51) {
    throw new Error(
      `Not enough data for ${ticker}: got ${bars.length} bars, need at least 51`,
    );
  }

  const closes = bars.map((b) => b.close);
  const n = closes.length;

  const ma20Arr = closes.map((_, i) => sma(closes, i, 20));
  const ma50Arr = closes.map((_, i) => sma(closes, i, 50));
  const rsiArr  = computeRSI(closes, 14);

  const priceHistory: PriceBarWithIndicators[] = bars.map((b, i) => ({
    date:   b.date,
    close:  b.close,
    open:   b.open,
    high:   b.high,
    low:    b.low,
    volume: b.volume,
    ma20:   ma20Arr[i] !== null ? Math.round(ma20Arr[i]! * 100) / 100 : null,
    ma50:   ma50Arr[i] !== null ? Math.round(ma50Arr[i]! * 100) / 100 : null,
  }));

  const currentPrice = closes[n - 1];
  const ma20         = ma20Arr[n - 1]!;
  const ma50         = ma50Arr[n - 1]!;

  let rsi = 50;
  for (let i = n - 1; i >= 0; i--) {
    if (rsiArr[i] !== null) { rsi = Math.round(rsiArr[i]! * 100) / 100; break; }
  }

  const prevClose     = closes[n - 2] ?? currentPrice;
  const change        = Math.round((currentPrice - prevClose) * 100) / 100;
  const changePercent = Math.round(((currentPrice - prevClose) / prevClose) * 10000) / 100;

  const price5dAgo = closes[Math.max(0, n - 6)];
  const momentum   = Math.round(((currentPrice - price5dAgo) / price5dAgo) * 10000) / 10000;

  const recentBars    = bars.slice(-20);
  const volume        = bars[n - 1].volume;
  const averageVolume = Math.round(
    recentBars.reduce((s, b) => s + b.volume, 0) / recentBars.length,
  );
  const volumeRatio = Math.round((averageVolume > 0 ? volume / averageVolume : 1) * 10000) / 10000;

  const trendScore    = computeTrendScore(currentPrice, ma20, ma50);
  const momentumScore = Math.round(computeMomentumScore(currentPrice, price5dAgo) * 10000) / 10000;
  const rsiScore      = computeRsiScore(rsi);
  const volumeScore   = computeVolumeScore(volumeRatio, currentPrice, prevClose, ma20, ma50);

  const { newsScore, socialScore, fundamentalsScore, finnhubContext } = enrichment;

  const rawFinalScore = aggregateScore(
    trendScore, momentumScore, rsiScore, volumeScore,
    newsScore, socialScore, fundamentalsScore,
  );
  const finalScore = Math.round(rawFinalScore * 10000) / 10000;

  const { upProbability, downProbability } = scoreToProb(rawFinalScore);

  const signal         = mapSignal(upProbability);
  const confidenceTier = mapConfidenceTier(upProbability);
  const explanation    = buildExplanation(
    trendScore, momentumScore, rsi, volumeScore,
    volumeRatio,
    confidenceTier, currentPrice, ma20, ma50,
    newsScore, finnhubContext.newsSentimentSummary,
  );

  return {
    ticker,
    currentPrice:      Math.round(currentPrice * 100) / 100,
    prevClose:         Math.round(prevClose * 100) / 100,
    ma20:              Math.round(ma20 * 100) / 100,
    ma50:              Math.round(ma50 * 100) / 100,
    rsi,
    price5dAgo:        Math.round(price5dAgo * 100) / 100,
    signal,
    confidenceTier,
    explanation,
    change,
    changePercent,
    lastUpdated:       new Date().toISOString(),
    upProbability,
    downProbability,
    finalScore,
    trendScore,
    momentumScore,
    rsiScore,
    volumeScore,
    newsScore,
    socialScore,
    fundamentalsScore,
    momentum,
    volume,
    averageVolume,
    volumeRatio,
    finnhubContext,
    priceHistory,
  };
}
