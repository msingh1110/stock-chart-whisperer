import { COMPONENTS, predict, type Features, type ModelParameters } from "./probability-model";

export interface LabeledPrediction {
  asOfDate: string;
  outcomeDate: string;
  features: Features;
  probability: number;
  outcome: number;
}
export interface Metrics {
  count: number; brier: number; logLoss: number; accuracy: number;
  calibration: { lower: number; upper: number; count: number; predicted: number; observed: number }[];
}
export const MIN_INDEPENDENT_PERIODS = 40;
export const MIN_COMPLETED = 200;

export function metrics(rows: LabeledPrediction[], probability: (r: LabeledPrediction) => number): Metrics | null {
  if (!rows.length) return null;
  let brier = 0, logLoss = 0, correct = 0;
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    lower: i / 10, upper: (i + 1) / 10, count: 0, predicted: 0, observed: 0,
  }));
  for (const row of rows) {
    const p = Math.max(0.001, Math.min(0.999, probability(row)));
    brier += (p - row.outcome) ** 2;
    logLoss -= row.outcome * Math.log(p) + (1 - row.outcome) * Math.log(1 - p);
    correct += Number(Number(p >= 0.5) === row.outcome);
    const bucket = buckets[Math.min(9, Math.floor(p * 10))];
    bucket.count++; bucket.predicted += p; bucket.observed += row.outcome;
  }
  return {
    count: rows.length, brier: brier / rows.length, logLoss: logLoss / rows.length,
    accuracy: correct / rows.length,
    calibration: buckets.filter(b => b.count).map(b => ({
      ...b, predicted: b.predicted / b.count, observed: b.observed / b.count,
    })),
  };
}

/** Select non-overlapping five-session windows; all stocks in a date remain one correlated block. */
export function independentBlocks(rows: LabeledPrediction[]): LabeledPrediction[][] {
  const grouped = new Map<string, LabeledPrediction[]>();
  for (const row of rows) {
    const group = grouped.get(row.asOfDate) ?? [];
    group.push(row); grouped.set(row.asOfDate, group);
  }
  const blocks: LabeledPrediction[][] = [];
  let lastEnd = "";
  for (const date of [...grouped.keys()].sort()) {
    if (date <= lastEnd) continue;
    const group = grouped.get(date)!;
    blocks.push(group);
    lastEnd = group.reduce((max, r) => r.outcomeDate > max ? r.outcomeDate : max, "");
  }
  return blocks;
}

/** Deterministic paired bootstrap of portfolio-level, non-overlapping periods. */
export function improvementLowerBound(differences: number[], iterations = 2000): number {
  let seed = 173;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < differences.length; j++) sum += differences[Math.floor(random() * differences.length)];
    samples.push(sum / differences.length);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(iterations * 0.025)];
}

function fitCalibration(rows: LabeledPrediction[], weights: Features, current: ModelParameters): ModelParameters {
  let best = { ...current, weights };
  let bestLoss = metrics(rows, r => predict(r.features, best))!.brier;
  for (const slope of [current.slope - 0.5, current.slope - 0.25, current.slope, current.slope + 0.25, current.slope + 0.5]) {
    if (slope < 0.5 || slope > 6) continue;
    for (const intercept of [current.intercept - 0.1, current.intercept, current.intercept + 0.1]) {
      if (Math.abs(intercept) > 1) continue;
      const model: ModelParameters = { weights, method: "logistic", slope, intercept };
      const penalty = 0.002 * ((slope - current.slope) ** 2 + (intercept - current.intercept) ** 2);
      const loss = metrics(rows, r => predict(r.features, model))!.brier + penalty;
      if (loss < bestLoss) { bestLoss = loss; best = model; }
    }
  }
  return best;
}

export function validateCandidate(rows: LabeledPrediction[], current: ModelParameters) {
  const blocks = independentBlocks(rows);
  if (rows.length < MIN_COMPLETED || blocks.length < MIN_INDEPENDENT_PERIODS) {
    return { eligible: false as const, blocks: blocks.length };
  }
  // The blocks are disjoint, so their label-end dates precede the next partition's prediction dates.
  const train = blocks.slice(0, -20).flat();
  const validation = blocks.slice(-20, -12).flat();
  const testBlocks = blocks.slice(-12);
  const test = testBlocks.flat();
  const weights: Features[] = [{ ...current.weights }];
  const varying = COMPONENTS.filter(key => {
    const values = train.map(r => r.features[key]);
    return Math.max(...values) - Math.min(...values) > 0.01;
  });
  for (const from of varying) for (const to of varying) {
    if (from === to || current.weights[from] < 0.01 || current.weights[to] >= 0.49) continue;
    weights.push({ ...current.weights, [from]: current.weights[from] - 0.01, [to]: current.weights[to] + 0.01 });
  }
  let candidate = current;
  let validationBrier = metrics(validation, r => predict(r.features, current))!.brier;
  for (const w of weights) {
    const fitted = fitCalibration(train, w, current);
    const loss = metrics(validation, r => predict(r.features, fitted))!.brier;
    if (loss < validationBrier) { candidate = fitted; validationBrier = loss; }
  }
  const currentMetrics = metrics(test, r => predict(r.features, current))!;
  const candidateMetrics = metrics(test, r => predict(r.features, candidate))!;
  const baseRate = (train.reduce((sum, r) => sum + r.outcome, 0) + 1) / (train.length + 2);
  const baselineBrier = metrics(test, () => baseRate)!.brier;
  const differences = testBlocks.map(group =>
    metrics(group, r => predict(r.features, current))!.brier -
    metrics(group, r => predict(r.features, candidate))!.brier);
  const lowerBound = improvementLowerBound(differences);
  const currentValidation = metrics(validation, r => predict(r.features, current))!.brier;
  const passes = currentValidation - validationBrier >= 0.002 &&
    currentMetrics.brier - candidateMetrics.brier >= 0.005 &&
    candidateMetrics.brier < baselineBrier &&
    candidateMetrics.logLoss <= currentMetrics.logLoss &&
    lowerBound > 0;
  return {
    eligible: true as const, blocks: blocks.length, candidate, passes,
    currentMetrics, candidateMetrics, baselineBrier, lowerBound,
    trainCount: train.length, validationCount: validation.length, testCount: test.length,
  };
}
