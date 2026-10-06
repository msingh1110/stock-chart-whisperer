import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MODEL, predict, weightedScore, type Features } from "./probability-model";
import { independentBlocks, metrics, improvementLowerBound, validateCandidate, type LabeledPrediction } from "./probability-validation";
import { captureDue, completedBars, evaluationWeek, fiveSessionOutcome, nextCapture, nextEvaluation } from "./probability-schedule";
import { analyzeStock } from "./indicators";
import type { DailyBar } from "./alpaca";

const features = (trend = 0): Features => ({ trend, momentum: 0, rsi: 0, volume: 0, news: 0, social: 0, fundamentals: 0 });
function dataset(periods = 40): LabeledPrediction[] {
  const rows: LabeledPrediction[] = [];
  for (let period = 0; period < periods; period++) {
    const start = new Date(Date.UTC(2025, 0, 1 + 14 * period));
    const end = new Date(start.getTime() + 7 * 86400_000);
    for (let stock = 0; stock < 8; stock++) {
      const f = features(stock < 4 ? 1 : -1);
      rows.push({ asOfDate: start.toISOString().slice(0, 10), outcomeDate: end.toISOString().slice(0, 10),
        features: f, outcome: stock < 4 ? 1 : 0, probability: predict(f, DEFAULT_MODEL) });
    }
  }
  return rows;
}
const bar = (date: string, close: number): DailyBar => ({ date, close, open: close, high: close, low: close, volume: 100 });

test("baseline mapping is preserved and logistic probabilities are bounded", () => {
  assert.equal(weightedScore(features(1), DEFAULT_MODEL), 0.32);
  assert.equal(predict(features(1), DEFAULT_MODEL), 0.66);
  assert.equal(predict(features(), DEFAULT_MODEL), 0.5);
  for (const trend of [-100, -1, 0, 1, 100]) {
    const p = predict(features(trend), { ...DEFAULT_MODEL, method: "logistic" });
    assert.ok(p >= 0.001 && p <= 0.999);
  }
});

test("metrics use probabilistic errors and bucket calibration, not just directional accuracy", () => {
  const rows = dataset(1);
  const perfect = metrics(rows, r => r.outcome)!;
  assert.ok(perfect.brier < 0.00001);
  assert.equal(perfect.accuracy, 1);
  const baseline = metrics(rows, () => 0.5)!;
  assert.equal(baseline.brier, 0.25);
  assert.equal(baseline.calibration[0].observed, 0.5);
  assert.equal(metrics([], () => 0.5), null);
});

test("five subsequent exchange bars handle holidays; flat price is not up", () => {
  const bars = ["2026-06-17", "2026-06-18", "2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25"]
    .map(date => bar(date, 100));
  assert.equal(fiveSessionOutcome("2026-06-17", bars)?.outcomeDate, "2026-06-25");
  assert.equal(fiveSessionOutcome("2026-06-17", bars)?.outcome, 0);
  assert.equal(fiveSessionOutcome("2026-06-17", bars.slice(0, 5)), null);
  assert.equal(fiveSessionOutcome("2026-06-16", bars), null);
  bars[5].close = 105;
  assert.equal(fiveSessionOutcome("2026-06-17", bars)?.outcome, 1);
  assert.ok(Math.abs(fiveSessionOutcome("2026-06-17", bars)!.returnPercent - 5) < 1e-8);
});

test("incomplete daily bars cannot settle outcomes, including winter and summer time", () => {
  const bars = [bar("2026-01-05", 100), bar("2026-01-06", 101)];
  assert.equal(completedBars(bars, new Date("2026-01-06T20:00:00Z")).length, 1);
  assert.equal(completedBars(bars, new Date("2026-01-06T22:00:00Z")).length, 2);
  const summer = [bar("2026-07-06", 100), bar("2026-07-07", 101)];
  assert.equal(completedBars(summer, new Date("2026-07-07T19:00:00Z")).length, 1);
  assert.equal(completedBars(summer, new Date("2026-07-07T21:00:00Z")).length, 2);
});

test("a missing ticker bar cannot shift the fifth-session target to a later date", () => {
  const sessions = ["2026-06-17", "2026-06-18", "2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"];
  const bars = sessions.filter(d => d !== "2026-06-25").map(d => bar(d, 100));
  assert.equal(fiveSessionOutcome("2026-06-17", bars, sessions), null);
});

test("daily and weekly schedules are UTC, idempotent, and exclude weekend captures", () => {
  assert.equal(captureDue(new Date("2026-10-06T22:14:59Z"), null), null);
  assert.equal(captureDue(new Date("2026-10-06T22:15:00Z"), null), "2026-10-06");
  assert.equal(captureDue(new Date("2026-10-06T22:30:00Z"), "2026-10-06"), null);
  assert.equal(captureDue(new Date("2026-10-10T23:00:00Z"), null), null);
  assert.equal(evaluationWeek(new Date("2026-10-10T00:29:00Z")), "2026-10-03");
  assert.equal(evaluationWeek(new Date("2026-10-10T00:30:00Z")), "2026-10-10");
  assert.equal(nextCapture(new Date("2026-10-09T23:00:00Z")), "2026-10-12T22:15:00.000Z");
  assert.equal(nextEvaluation(new Date("2026-10-10T00:31:00Z")), "2026-10-17T00:30:00.000Z");
});

test("overlapping windows and same-date stocks cannot masquerade as independent periods", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    ...dataset(1)[0], asOfDate: `2026-01-${String(1 + i).padStart(2, "0")}`,
    outcomeDate: `2026-01-${String(6 + i).padStart(2, "0")}`,
  }));
  const blocks = independentBlocks(rows);
  assert.equal(blocks.length, 4);
  assert.equal(independentBlocks(dataset(1)).length, 1);
  for (let i = 1; i < blocks.length; i++) assert.ok(blocks[i][0].asOfDate > blocks[i - 1][0].outcomeDate);
});

test("insufficient samples cannot promote", () => {
  assert.equal(validateCandidate(dataset(39), DEFAULT_MODEL).eligible, false);
  assert.equal(validateCandidate(dataset(40).filter((_, i) => i % 2 === 0), DEFAULT_MODEL).eligible, false);
});

test("a genuinely better calibrated candidate passes every quality gate", () => {
  const result = validateCandidate(dataset(), DEFAULT_MODEL);
  assert.ok(result.eligible);
  if (!result.eligible) return;
  assert.equal(result.passes, true);
  assert.equal(result.candidate.method, "logistic");
  assert.equal(result.trainCount, 160);
  assert.equal(result.validationCount, 64);
  assert.equal(result.testCount, 96);
  assert.ok(result.lowerBound > 0);
  assert.ok(result.candidateMetrics.brier < result.currentMetrics.brier - 0.005);
  assert.ok(Math.abs(result.candidate.slope - DEFAULT_MODEL.slope) <= 0.5);
  assert.ok(Math.abs(result.candidate.intercept - DEFAULT_MODEL.intercept) <= 0.1 + 1e-9);
  for (const key of Object.keys(DEFAULT_MODEL.weights) as (keyof Features)[]) {
    assert.ok(Math.abs(result.candidate.weights[key] - DEFAULT_MODEL.weights[key]) <= 0.01 + 1e-9);
  }
});

test("test outcomes never select parameters, and poor holdout performance prevents promotion", () => {
  const rows = dataset();
  const first = validateCandidate(rows, DEFAULT_MODEL);
  const flipped = rows.map((r, i) => i >= 28 * 8 ? { ...r, outcome: 1 - r.outcome } : r);
  const second = validateCandidate(flipped, DEFAULT_MODEL);
  assert.ok(first.eligible && second.eligible);
  if (!first.eligible || !second.eligible) return;
  assert.deepEqual(second.candidate, first.candidate);
  assert.equal(second.passes, false);
});

test("a candidate that loses to the training-only base rate is rejected", () => {
  const rows = dataset().map((r, i) => ({ ...r, features: features(1), outcome: i % 2 }));
  const result = validateCandidate(rows, DEFAULT_MODEL);
  assert.ok(result.eligible);
  if (!result.eligible) return;
  assert.equal(result.passes, false);
  assert.equal(result.baselineBrier, 0.25);
});

test("bootstrap confidence rejects absent and negative improvements", () => {
  assert.equal(improvementLowerBound(Array(12).fill(0)), 0);
  assert.ok(improvementLowerBound(Array(12).fill(-0.01)) < 0);
  assert.ok(improvementLowerBound(Array(12).fill(0.02)) > 0);
});

test("live stock analysis consumes the active parameters and preserves complementary percentages", () => {
  const bars = Array.from({ length: 80 }, (_, i) => bar(new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), 100 + i));
  const original = analyzeStock("TEST", bars);
  const tuned = analyzeStock("TEST", bars, undefined, { ...DEFAULT_MODEL, method: "logistic", slope: 4, intercept: 0.5 });
  assert.notEqual(original.upProbability, tuned.upProbability);
  assert.equal(tuned.upProbability + tuned.downProbability, 100);
  assert.equal(original.finalScore, tuned.finalScore);
});
