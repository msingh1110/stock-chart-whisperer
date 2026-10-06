import { pool } from "@workspace/db";
import { analyzeStock } from "./indicators";
import { fetchDailyBars } from "./alpaca";
import { enrichWithFinnhub } from "./finnhub";
import { featuresFromAnalysis, predict } from "./probability-model";
import { getActiveModel, labeledPredictions, pendingPredictions, type EvaluationResult, type StoreClient } from "./probability-store";
import { validateCandidate } from "./probability-validation";
import { captureDue, completedBars, evaluationWeek, fiveSessionOutcome } from "./probability-schedule";
import { PORTFOLIO_TICKERS } from "./portfolio";
import { logger } from "./logger";

async function resolveOutcomes(client: StoreClient, now: Date) {
  const pending = await pendingPredictions(client);
  if (!pending.length) return;
  const bars = await fetchDailyBars([...new Set([...PORTFOLIO_TICKERS, ...pending.map(p => p.ticker)])], true);
  const completed = Object.fromEntries(Object.entries(bars).map(([ticker, history]) => [ticker, completedBars(history, now)]));
  const sessionDates = [...new Set(Object.values(completed).flat().map(b => b.date))].sort();
  for (const prediction of pending) {
    const outcome = fiveSessionOutcome(prediction.asOfDate, completed[prediction.ticker] ?? [], sessionDates);
    if (!outcome) continue;
    await client.query(`UPDATE probability_predictions SET outcome_date = $1, outcome_close = $2,
      outcome = $3, return_percent = $4 WHERE id = $5 AND outcome IS NULL`,
    [outcome.outcomeDate, outcome.outcomeClose, outcome.outcome, outcome.returnPercent, prediction.id]);
  }
}

async function capture(client: StoreClient, date: string, now: Date) {
  const model = await getActiveModel(client);
  const [bars, enrichment] = await Promise.all([
    fetchDailyBars([...PORTFOLIO_TICKERS], true),
    Promise.all(PORTFOLIO_TICKERS.map(ticker => enrichWithFinnhub(ticker))),
  ]);
  const analyses = PORTFOLIO_TICKERS.map((ticker, i) => {
    const completed = completedBars(bars[ticker] ?? [], now);
    if (completed.at(-1)?.date !== date) return null; // Holiday: never attach today's news to a prior close.
    return { ticker, analysis: analyzeStock(ticker, completed, enrichment[i], model.parameters), enrichment: enrichment[i] };
  }).filter(a => a !== null);
  await client.query("BEGIN");
  try {
    for (const { ticker, analysis, enrichment: context } of analyses) {
      const features = featuresFromAnalysis(analysis);
      await client.query(`INSERT INTO probability_predictions
        (ticker, as_of_date, model_id, probability, reference_close, features, context)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb) ON CONFLICT (ticker, as_of_date) DO NOTHING`,
      [ticker, date, model.id, predict(features, model.parameters), analysis.currentPrice, JSON.stringify(features), JSON.stringify(context)]);
    }
    await client.query(`UPDATE probability_service SET last_capture_date = $1,
      last_captured_at = CASE WHEN $2::int > 0 THEN NOW() ELSE last_captured_at END WHERE id = 1`, [date, analyses.length]);
    await client.query("COMMIT");
    logger.info({ date, predictions: analyses.length, modelId: model.id }, "Daily probability capture completed");
  } catch (err) { await client.query("ROLLBACK"); throw err; }
}

async function evaluate(client: StoreClient, week: string, now: Date) {
  const model = await getActiveModel(client);
  const rows = await labeledPredictions(client);
  const validation = validateCandidate(rows, model.parameters);
  const result: EvaluationResult = {
    decision: "insufficient_data",
    reason: `Collecting prospective data: ${rows.length} completed predictions and ${validation.blocks}/40 independent periods. Parameters unchanged.`,
    completedCount: rows.length, independentPeriods: validation.blocks,
    currentModelId: model.id, resultingModelId: model.id,
    trainCount: 0, validationCount: 0, testCount: 0, currentMetrics: null, candidateMetrics: null,
    baselineBrier: null, improvementLowerBound: null, candidateParameters: null,
  };
  if (validation.eligible) {
    Object.assign(result, {
      decision: "kept", trainCount: validation.trainCount, validationCount: validation.validationCount,
      testCount: validation.testCount, currentMetrics: validation.currentMetrics, candidateMetrics: validation.candidateMetrics,
      baselineBrier: validation.baselineBrier, improvementLowerBound: validation.lowerBound,
      candidateParameters: validation.candidate,
      reason: "Candidate did not pass every validation, holdout, baseline and portfolio-block confidence gate. Parameters unchanged.",
    });
    if (validation.passes) {
      const lastPromotion = (await client.query<{ createdAt: Date }>(
        `SELECT created_at AS "createdAt" FROM probability_reports
         WHERE result->>'decision' = 'promoted' ORDER BY created_at DESC LIMIT 1`)).rows[0];
      const cooldown = !!lastPromotion && now.getTime() - lastPromotion.createdAt.getTime() < 28 * 86400_000;
      result.reason = cooldown
        ? "Candidate passed quality gates, but the 28-day promotion cooldown is still active. Parameters unchanged."
        : "Candidate passed chronological validation, held-out Brier and log-loss gates, baseline comparison and portfolio-block confidence check.";
      if (!cooldown) result.decision = "promoted";
    }
  }
  await client.query("BEGIN");
  try {
    if (result.decision === "promoted" && result.candidateParameters) {
      await client.query("UPDATE probability_models SET active = false WHERE id = $1", [model.id]);
      const newModel = await client.query<{ id: number }>(
        `INSERT INTO probability_models (active, reason, parameters) VALUES (true, $1, $2::jsonb) RETURNING id`,
        [result.reason, JSON.stringify(result.candidateParameters)]);
      result.resultingModelId = newModel.rows[0].id;
    }
    await client.query("INSERT INTO probability_reports (week, result) VALUES ($1, $2::jsonb)", [week, JSON.stringify(result)]);
    await client.query("UPDATE probability_service SET last_evaluated_at = NOW() WHERE id = 1");
    await client.query("COMMIT");
    logger.info({ week, decision: result.decision, modelId: result.resultingModelId }, "Weekly probability evaluation completed");
  } catch (err) { await client.query("ROLLBACK"); throw err; }
}

let running = false;
export async function runProbabilityCycle(now = new Date()) {
  if (running) return;
  running = true;
  let client: StoreClient | undefined;
  let locked = false;
  try {
    client = await pool.connect();
    locked = (await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(8216405) AS locked")).rows[0].locked;
    if (!locked) return;
    await getActiveModel(client);
    await client.query("INSERT INTO probability_service (id) VALUES (1) ON CONFLICT DO NOTHING");
    const last = (await client.query<{ date: string | null }>(
      "SELECT last_capture_date::text AS date FROM probability_service WHERE id = 1")).rows[0].date;
    const date = captureDue(now, last);
    const week = evaluationWeek(now);
    const evaluated = (await client.query("SELECT id FROM probability_reports WHERE week = $1", [week])).rowCount !== 0;
    if (date || !evaluated) await resolveOutcomes(client, now);
    if (date) await capture(client, date, now);
    if (!evaluated) await evaluate(client, week, now);
    if (date || !evaluated) await client.query("UPDATE probability_service SET last_error = NULL WHERE id = 1");
  } catch (err) {
    logger.error({ err }, "Probability scheduler cycle failed");
    if (client) {
      await client.query(`UPDATE probability_service SET last_error =
        'Probability capture/evaluation failed. Check API logs, storage and market-data access; this cycle will retry.' WHERE id = 1`)
        .catch(() => undefined);
    }
  } finally {
    if (client) {
      if (locked) await client.query("SELECT pg_advisory_unlock(8216405)").catch(() => undefined);
      client.release();
    }
    running = false;
  }
}

export function startProbabilityWorker() {
  void runProbabilityCycle();
  const timer = setInterval(() => { void runProbabilityCycle(); }, 10 * 60_000);
  timer.unref();
}
