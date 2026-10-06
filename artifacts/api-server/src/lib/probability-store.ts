import { pool, type PoolClient } from "@workspace/db";
import { DEFAULT_MODEL, type Features, type ModelParameters } from "./probability-model";
import { independentBlocks, metrics, MIN_INDEPENDENT_PERIODS, type LabeledPrediction } from "./probability-validation";
import { nextCapture, nextEvaluation } from "./probability-schedule";

export type StoreClient = PoolClient;
export interface ModelRow {
  id: number; createdAt: Date; active: boolean; reason: string; parameters: ModelParameters;
}
export interface EvaluationResult {
  decision: "insufficient_data" | "kept" | "promoted"; reason: string; completedCount: number;
  independentPeriods: number; currentModelId: number; resultingModelId: number;
  trainCount: number; validationCount: number; testCount: number;
  currentMetrics: ReturnType<typeof metrics>; candidateMetrics: ReturnType<typeof metrics>;
  baselineBrier: number | null; improvementLowerBound: number | null; candidateParameters: ModelParameters | null;
}
export interface PredictionRow {
  id: number; ticker: string; asOfDate: string; capturedAt: Date; modelId: number;
  probability: number; referenceClose: number; features: Features; outcomeDate: string | null;
  outcomeClose: number | null; outcome: number | null; returnPercent: number | null;
}

const MODEL_SELECT = `SELECT id, created_at AS "createdAt", active, reason, parameters FROM probability_models`;
const PREDICTION_SELECT = `SELECT id, ticker, as_of_date::text AS "asOfDate", captured_at AS "capturedAt",
  model_id AS "modelId", probability, reference_close AS "referenceClose", features,
  outcome_date::text AS "outcomeDate", outcome_close AS "outcomeClose", outcome, return_percent AS "returnPercent"
  FROM probability_predictions`;

export async function getActiveModel(client?: StoreClient): Promise<ModelRow> {
  const connection = client ?? pool;
  await connection.query(
    `INSERT INTO probability_models (active, reason, parameters)
     SELECT true, 'Original scoring model; probabilities not yet empirically calibrated.', $1::jsonb
     WHERE NOT EXISTS (SELECT 1 FROM probability_models WHERE active = true)
     ON CONFLICT DO NOTHING`, [JSON.stringify(DEFAULT_MODEL)]);
  const { rows } = await connection.query<ModelRow>(`${MODEL_SELECT} WHERE active = true`);
  if (!rows[0]) throw new Error("No active probability model is available");
  return rows[0];
}

export async function labeledPredictions(client: StoreClient): Promise<LabeledPrediction[]> {
  const { rows } = await client.query<LabeledPrediction>(
    `SELECT as_of_date::text AS "asOfDate", outcome_date::text AS "outcomeDate", features, probability, outcome
     FROM probability_predictions WHERE outcome IS NOT NULL
     AND as_of_date >= CURRENT_DATE - INTERVAL '12 months' ORDER BY as_of_date, ticker`);
  return rows;
}

export async function pendingPredictions(client: StoreClient): Promise<PredictionRow[]> {
  return (await client.query<PredictionRow>(`${PREDICTION_SELECT} WHERE outcome IS NULL ORDER BY as_of_date, ticker`)).rows;
}

const serializeModel = (m: ModelRow) => ({ ...m, createdAt: m.createdAt.toISOString() });

export async function evaluationStatus() {
  const activeModel = await getActiveModel();
  const client = await pool.connect();
  try {
    const counts = await client.query<{ total: number; pending: number; completed: number }>(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE outcome IS NULL)::int AS pending,
        count(*) FILTER (WHERE outcome IS NOT NULL)::int AS completed FROM probability_predictions`);
    const service = await client.query<{ lastCapturedAt: Date | null; lastEvaluatedAt: Date | null; lastError: string | null }>(
        `SELECT last_captured_at AS "lastCapturedAt", last_evaluated_at AS "lastEvaluatedAt", last_error AS "lastError"
         FROM probability_service WHERE id = 1`);
    const models = await client.query<ModelRow>(`${MODEL_SELECT} ORDER BY id DESC LIMIT 20`);
    const reports = await client.query<{ id: number; week: string; createdAt: Date; result: EvaluationResult }>(
        `SELECT id, week::text AS week, created_at AS "createdAt", result FROM probability_reports ORDER BY week DESC LIMIT 26`);
    const recent = await client.query<PredictionRow>(`${PREDICTION_SELECT} ORDER BY as_of_date DESC, ticker LIMIT 64`);
    const labeled = await labeledPredictions(client);
    const state = service.rows[0];
    const blocks = independentBlocks(labeled);
    const now = new Date();
    const staleCapture = !!state?.lastCapturedAt && now.getTime() - state.lastCapturedAt.getTime() > 4 * 86400_000;
    return {
      horizonSessions: 5, automatic: true,
      schedule: "Snapshots Mon–Fri 22:15 UTC; evaluation Saturdays 00:30 UTC. Scheduler checks every 10 minutes.",
      status: state?.lastError || staleCapture ? "degraded" : blocks.length < MIN_INDEPENDENT_PERIODS ? "collecting" : "monitoring",
      totalPredictions: counts.rows[0].total, pendingPredictions: counts.rows[0].pending,
      completedPredictions: counts.rows[0].completed, minimumIndependentPeriods: MIN_INDEPENDENT_PERIODS,
      independentPeriods: blocks.length, lastCapturedAt: state?.lastCapturedAt?.toISOString() ?? null,
      lastEvaluatedAt: state?.lastEvaluatedAt?.toISOString() ?? null,
      nextCaptureAt: nextCapture(now), nextEvaluationAt: nextEvaluation(now),
      lastError: state?.lastError ?? (staleCapture ? "No capture in more than four days. Keep the API running and check market-data access." : null),
      activeModel: serializeModel(activeModel), modelHistory: models.rows.map(serializeModel),
      reports: reports.rows.map(r => ({ id: r.id, week: r.week, createdAt: r.createdAt.toISOString(), ...r.result })),
      recentPredictions: recent.rows.map(({ features: _features, ...r }) => ({ ...r, capturedAt: r.capturedAt.toISOString() })),
      observedMetrics: metrics(labeled, r => r.probability),
      methodology: [
        "Predict whether the split-adjusted closing price is strictly higher after five subsequent exchange sessions. Flat closes count as not up. This is price direction, not dividend-adjusted total return.",
        "Capture one immutable snapshot per portfolio stock per session, after close. Store feature values, enrichment context, precise probability, timestamp and model version; never backfill news or missed prediction days.",
        "Resolve using five subsequent trading-session dates observed across the portfolio, not five calendar days. Holidays do not count; incomplete current-session bars are excluded. A missing ticker bar cannot shift its outcome to a later session; missing reference or target bars remain pending.",
        "Tune on the most recent 12 months. Use non-overlapping outcome windows grouped across all portfolio stocks. Require at least 200 completed predictions and 40 non-overlapping portfolio periods.",
        "Train on earlier periods; choose candidates on the next eight periods; test only on the latest twelve periods. Label-end dates precede the next partition's prediction dates.",
        "Require validation Brier improvement ≥0.002, test improvement ≥0.005, better test Brier than a training-only base-rate predictor, no worse log loss, and a positive paired portfolio-block bootstrap 95% lower bound.",
        "Weight changes transfer at most 0.01 between varying components, preserving their total. Calibration slope changes by at most 0.5 and intercept by at most 0.1. No automatic promotion within 28 days of the last promotion.",
        "Reports compare current and candidate models on held-out data. Observed metrics score probabilities actually issued. Repeated weekly evaluation and a fixed portfolio limit the strength and generality of statistical evidence.",
        "The original percentages are score-derived, not demonstrated probabilities. A validated calibrated update can improve historical reliability but cannot guarantee future returns. No trades are placed.",
        "The API must be continuously running for unattended capture. Late same-evening runs are allowed; missed prediction sessions are not fabricated. A missed weekly evaluation catches up when the API restarts.",
      ],
    };
  } finally { client.release(); }
}
