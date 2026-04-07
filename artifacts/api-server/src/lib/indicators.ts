import { DailyBar } from "./alpaca";

/**
 * Compute simple moving average over the last `period` values ending at index `i`.
 * Returns null if there aren't enough data points yet.
 */
export function sma(closes: number[], i: number, period: number): number | null {
  if (i < period - 1) return null;
  let sum = 0;
  for (let j = i - period + 1; j <= i; j++) {
    sum += closes[j];
  }
  return sum / period;
}

/**
 * Compute RSI matching ta.momentum.RSIIndicator(close, window=14).rsi().
 *
 * The ta library uses pandas EWM with adjust=False and alpha=1/window:
 *   up[i]    = max(0, close[i] - close[i-1])
 *   dn[i]    = max(0, close[i-1] - close[i])
 *   emaUp[i] = (1 - alpha) * emaUp[i-1] + alpha * up[i]   (seeded at index 1)
 *   emaDn[i] = (1 - alpha) * emaDn[i-1] + alpha * dn[i]
 *   RSI[i]   = 100 - 100 / (1 + emaUp[i] / emaDn[i])
 *
 * Returns null until min_periods (= window) bars have been processed.
 */
export function computeRSI(closes: number[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return rsi;

  const alpha = 1 / period;

  // Seed EWM with the very first delta (index 1), matching adjust=False behaviour
  const firstDelta = closes[1] - closes[0];
  let ewmUp = Math.max(0, firstDelta);
  let ewmDn = Math.max(0, -firstDelta);

  for (let i = 2; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const up = Math.max(0, delta);
    const dn = Math.max(0, -delta);

    ewmUp = (1 - alpha) * ewmUp + alpha * up;
    ewmDn = (1 - alpha) * ewmDn + alpha * dn;

    // Emit value only after min_periods bars (index >= period)
    if (i >= period) {
      rsi[i] = ewmDn === 0 ? 100 : 100 - 100 / (1 + ewmUp / ewmDn);
    }
  }

  return rsi;
}

export type SignalType = "BUY" | "SELL" | "HOLD";

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
  ma20: number;
  ma50: number;
  rsi: number;
  signal: SignalType;
  change: number;
  changePercent: number;
  lastUpdated: string;
  upProbability: number;
  downProbability: number;
  priceHistory: PriceBarWithIndicators[];
}

/**
 * Sigmoid / logistic function.
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Calibrated probability-based signal engine.
 *
 * Builds a continuous weighted score from five factors:
 *   A) Short-term trend  : 2 * (price - MA20) / MA20
 *   B) Long-term trend   : 2 * (MA20 - MA50) / MA50
 *   C) RSI contribution  : +1 (50–65), -1 (>70 or <45), 0 otherwise
 *   D) 5-day momentum    : 1.5 * (price - price5dAgo) / price5dAgo
 *   E) Volume confirm.   : ±1 * (volume_ratio - 1) depending on direction
 *
 * Converts score → probability via sigmoid:
 *   upProbability   = sigmoid(score) * 100  (0–100)
 *   downProbability = (1 - sigmoid(score)) * 100
 */
export function computeProbability(
  currentPrice: number,
  ma20: number,
  ma50: number,
  rsi: number,
  currentVolume: number,
  avgVolume: number,
  prevClose: number,
  price5dAgo: number,
): { upProbability: number; downProbability: number } {
  let score = 0;

  // A. Short-term trend: price vs MA20
  const trendShort = (currentPrice - ma20) / ma20;
  score += 2 * trendShort;

  // B. Long-term trend: MA20 vs MA50
  const trendLong = (ma20 - ma50) / ma50;
  score += 2 * trendLong;

  // C. RSI contribution
  if (rsi >= 50 && rsi <= 65) score += 1;
  else if (rsi > 70) score -= 1;
  else if (rsi < 45) score -= 1;

  // D. 5-day momentum
  const momentum = (currentPrice - price5dAgo) / price5dAgo;
  score += 1.5 * momentum;

  // E. Volume confirmation
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
  if (currentPrice > prevClose) score += 1 * (volumeRatio - 1);
  else if (currentPrice < prevClose) score -= 1 * (volumeRatio - 1);

  const upProb = sigmoid(score);
  const downProb = 1 - upProb;

  return {
    upProbability: Math.round(upProb * 100),
    downProbability: Math.round(downProb * 100),
  };
}

/**
 * Compute all indicators and generate a trading signal for a ticker.
 */
export function analyzeStock(ticker: string, bars: DailyBar[]): StockAnalysis {
  if (bars.length < 51) {
    throw new Error(
      `Not enough data for ${ticker}: got ${bars.length} bars, need at least 51`,
    );
  }

  const closes = bars.map((b) => b.close);
  const n = closes.length;

  // Compute MA20 and MA50 arrays
  const ma20Arr: (number | null)[] = closes.map((_, i) => sma(closes, i, 20));
  const ma50Arr: (number | null)[] = closes.map((_, i) => sma(closes, i, 50));
  const rsiArr = computeRSI(closes, 14);

  // Build price history with indicators
  const priceHistory: PriceBarWithIndicators[] = bars.map((b, i) => ({
    date: b.date,
    close: b.close,
    open: b.open,
    high: b.high,
    low: b.low,
    volume: b.volume,
    ma20: ma20Arr[i] !== null ? Math.round(ma20Arr[i]! * 100) / 100 : null,
    ma50: ma50Arr[i] !== null ? Math.round(ma50Arr[i]! * 100) / 100 : null,
  }));

  // Current values
  const currentPrice = closes[n - 1];
  const ma20 = ma20Arr[n - 1]!;
  const ma50 = ma50Arr[n - 1]!;

  // Find last valid RSI
  let rsi = 50; // default fallback
  for (let i = n - 1; i >= 0; i--) {
    if (rsiArr[i] !== null) {
      rsi = Math.round(rsiArr[i]! * 100) / 100;
      break;
    }
  }

  // Change from previous close (needed for momentum scoring)
  const prevClose = closes[n - 2] ?? currentPrice;
  const change = Math.round((currentPrice - prevClose) * 100) / 100;
  const changePercent =
    Math.round(((currentPrice - prevClose) / prevClose) * 10000) / 100;

  // Scored signal logic
  let score = 0;
  score += currentPrice > ma20 ? 1 : -1;
  score += ma20 > ma50 ? 1 : -1;
  score += rsi > 50 ? 1 : -1;
  score += change > 0 ? 1 : -1;

  let signal: SignalType = "HOLD";
  if (score >= 2) signal = "BUY";
  else if (score <= -2) signal = "SELL";

  // Probability model — use last 20 bars for average volume calculation
  const { upProbability, downProbability } = computeProbability(
    currentPrice,
    ma20,
    ma50,
    rsi,
    bars[n - 1],
    bars.slice(-20),
  );

  return {
    ticker,
    currentPrice: Math.round(currentPrice * 100) / 100,
    ma20: Math.round(ma20 * 100) / 100,
    ma50: Math.round(ma50 * 100) / 100,
    rsi,
    signal,
    change,
    changePercent,
    lastUpdated: new Date().toISOString(),
    upProbability,
    downProbability,
    priceHistory,
  };
}
