import { DailyBar } from "./alpaca";

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
 * RSI matching ta.momentum.RSIIndicator(close, window=14).rsi().
 * Uses pandas EWM with adjust=False and alpha=1/window.
 */
export function computeRSI(closes: number[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return rsi;

  const alpha = 1 / period;
  const firstDelta = closes[1] - closes[0];
  let ewmUp = Math.max(0, firstDelta);
  let ewmDn = Math.max(0, -firstDelta);

  for (let i = 2; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    ewmUp = (1 - alpha) * ewmUp + alpha * Math.max(0, delta);
    ewmDn = (1 - alpha) * ewmDn + alpha * Math.max(0, -delta);
    if (i >= period) {
      rsi[i] = ewmDn === 0 ? 100 : 100 - 100 / (1 + ewmUp / ewmDn);
    }
  }
  return rsi;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type SignalType = "BUY" | "SELL" | "HOLD";
export type ConfidenceTier = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";

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
  momentum: number;
  volume: number;
  averageVolume: number;
  volumeRatio: number;
  priceHistory: PriceBarWithIndicators[];
}

// ── Scoring Config (tune weights & thresholds here) ───────────────────────

const WEIGHTS = {
  trend:    0.4,
  momentum: 0.3,
  rsi:      0.2,
  volume:   0.1,
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
 * Volume confirmation score: -1, 0, or +1.
 * Only fires when volume is meaningfully elevated (ratio > 1.2).
 */
function computeVolumeScore(
  volumeRatio: number,
  price: number,
  prevClose: number,
): number {
  if (volumeRatio > 1.2 && price > prevClose) return 1;
  if (volumeRatio > 1.2 && price < prevClose) return -1;
  return 0;
}

// ── Aggregation & Signal Mapping ───────────────────────────────────────────

/**
 * Weighted final score → stays roughly within [-1, +1].
 */
function aggregateScore(
  trendScore: number,
  momentumScore: number,
  rsiScore: number,
  volumeScore: number,
): number {
  return (
    WEIGHTS.trend    * trendScore +
    WEIGHTS.momentum * momentumScore +
    WEIGHTS.rsi      * rsiScore +
    WEIGHTS.volume   * volumeScore
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

export function analyzeStock(ticker: string, bars: DailyBar[]): StockAnalysis {
  if (bars.length < 51) {
    throw new Error(
      `Not enough data for ${ticker}: got ${bars.length} bars, need at least 51`,
    );
  }

  const closes = bars.map((b) => b.close);
  const n = closes.length;

  // Moving averages & RSI arrays
  const ma20Arr = closes.map((_, i) => sma(closes, i, 20));
  const ma50Arr = closes.map((_, i) => sma(closes, i, 50));
  const rsiArr  = computeRSI(closes, 14);

  // Price history for chart
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

  // Current indicators
  const currentPrice = closes[n - 1];
  const ma20         = ma20Arr[n - 1]!;
  const ma50         = ma50Arr[n - 1]!;

  let rsi = 50;
  for (let i = n - 1; i >= 0; i--) {
    if (rsiArr[i] !== null) { rsi = Math.round(rsiArr[i]! * 100) / 100; break; }
  }

  // Daily change
  const prevClose     = closes[n - 2] ?? currentPrice;
  const change        = Math.round((currentPrice - prevClose) * 100) / 100;
  const changePercent = Math.round(((currentPrice - prevClose) / prevClose) * 10000) / 100;

  // 5-day momentum
  const price5dAgo = closes[Math.max(0, n - 6)];
  const momentum   = Math.round(((currentPrice - price5dAgo) / price5dAgo) * 10000) / 10000;

  // Volume
  const recentBars   = bars.slice(-20);
  const volume       = bars[n - 1].volume;
  const averageVolume = Math.round(
    recentBars.reduce((s, b) => s + b.volume, 0) / recentBars.length,
  );
  const volumeRatio = Math.round((averageVolume > 0 ? volume / averageVolume : 1) * 10000) / 10000;

  // Component scores
  const trendScore    = computeTrendScore(currentPrice, ma20, ma50);
  const momentumScore = Math.round(computeMomentumScore(currentPrice, price5dAgo) * 10000) / 10000;
  const rsiScore      = computeRsiScore(rsi);
  const volumeScore   = computeVolumeScore(volumeRatio, currentPrice, prevClose);

  // Final score & probabilities
  const rawFinalScore = aggregateScore(trendScore, momentumScore, rsiScore, volumeScore);
  const finalScore    = Math.round(rawFinalScore * 10000) / 10000;

  const { upProbability, downProbability } = scoreToProb(rawFinalScore);

  // Signal & confidence
  const signal         = mapSignal(upProbability);
  const confidenceTier = mapConfidenceTier(upProbability);

  return {
    ticker,
    currentPrice:   Math.round(currentPrice * 100) / 100,
    prevClose:      Math.round(prevClose * 100) / 100,
    ma20:           Math.round(ma20 * 100) / 100,
    ma50:           Math.round(ma50 * 100) / 100,
    rsi,
    price5dAgo:     Math.round(price5dAgo * 100) / 100,
    signal,
    confidenceTier,
    change,
    changePercent,
    lastUpdated:    new Date().toISOString(),
    upProbability,
    downProbability,
    finalScore,
    trendScore,
    momentumScore,
    rsiScore,
    volumeScore,
    momentum,
    volume,
    averageVolume,
    volumeRatio,
    priceHistory,
  };
}
