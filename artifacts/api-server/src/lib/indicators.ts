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
 * Compute RSI (Wilder's Smoothed Method) for all data points.
 * Returns array of RSI values (null until enough data).
 */
export function computeRSI(closes: number[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return rsi;

  // First average gain/loss over first `period` periods
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  const calcRsi = (ag: number, al: number) =>
    al === 0 ? 100 : 100 - 100 / (1 + ag / al);

  rsi[period] = calcRsi(avgGain, avgLoss);

  // Wilder smoothing for subsequent values
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi[i] = calcRsi(avgGain, avgLoss);
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
 * Compute up/down probability using a weighted scoring model.
 * Starts at 50/50 and shifts based on 5 positive and 5 negative conditions.
 * Each condition is worth 10 points. Final score is clamped 0-100.
 */
export function computeProbability(
  currentPrice: number,
  ma20: number,
  ma50: number,
  rsi: number,
  latestBar: DailyBar,
  recentBars: DailyBar[],
): { upProbability: number; downProbability: number } {
  const WEIGHT = 10;
  let score = 50;

  // Average volume over recent bars
  const avgVolume =
    recentBars.reduce((sum, b) => sum + b.volume, 0) / recentBars.length;
  const volumeAboveAvg = latestBar.volume > avgVolume;
  const intradayUp = latestBar.close > latestBar.open;
  const intradayDown = latestBar.close < latestBar.open;

  // --- Positive conditions ---
  if (currentPrice > ma20) score += WEIGHT;
  if (ma20 > ma50) score += WEIGHT;
  if (rsi >= 50 && rsi <= 65) score += WEIGHT;
  if (intradayUp) score += WEIGHT;
  if (volumeAboveAvg && intradayUp) score += WEIGHT;

  // --- Negative conditions ---
  if (currentPrice < ma20) score -= WEIGHT;
  if (ma20 < ma50) score -= WEIGHT;
  if (rsi < 45) score -= WEIGHT;
  if (intradayDown) score -= WEIGHT;
  if (volumeAboveAvg && intradayDown) score -= WEIGHT;

  // Clamp 0–100
  score = Math.max(0, Math.min(100, score));

  return {
    upProbability: score,
    downProbability: 100 - score,
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

  // Previous day MA values for cross detection
  const prevMa20 = ma20Arr[n - 2];
  const prevMa50 = ma50Arr[n - 2];

  // Signal logic
  let signal: SignalType = "HOLD";

  if (prevMa20 !== null && prevMa50 !== null) {
    const crossedAbove = prevMa20 <= prevMa50 && ma20 > ma50;
    const crossedBelow = prevMa20 >= prevMa50 && ma20 < ma50;

    if (crossedAbove && rsi < 70) {
      signal = "BUY";
    } else if (crossedBelow && rsi > 30) {
      signal = "SELL";
    }
  }

  // Change from previous close
  const prevClose = closes[n - 2] ?? currentPrice;
  const change = Math.round((currentPrice - prevClose) * 100) / 100;
  const changePercent =
    Math.round(((currentPrice - prevClose) / prevClose) * 10000) / 100;

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
