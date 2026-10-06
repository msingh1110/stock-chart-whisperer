import { AlertCircle, RefreshCw } from "lucide-react";
import {
  useGetProbabilityEvaluation,
  getGetProbabilityEvaluationQueryKey,
} from "@workspace/api-client-react";
import type {
  ProbabilityMetrics,
  ProbabilityParameters,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString() : "Never");
const num = (n: number | null | undefined, d = 4) => (n == null ? "n/a" : n.toFixed(d));
const pct = (n: number | null | undefined) => (n == null ? "n/a" : `${(n * 100).toFixed(1)}%`);

function Panel({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section data-testid={id} className="border border-border bg-card rounded-sm">
      <h2 className="px-4 py-2 border-b border-border font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, id }: { label: string; value: React.ReactNode; id: string }) {
  return (
    <div className="min-w-0" data-testid={id}>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-mono text-lg break-words">{value}</div>
    </div>
  );
}

function Params({ p }: { p: ProbabilityParameters }) {
  return (
    <div className="space-y-3">
      <div className="font-mono text-sm">
        {p.method} / slope {num(p.slope)} / intercept {num(p.intercept)}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {Object.entries(p.weights).map(([k, v]) => (
          <div key={k} className="border border-border p-2 rounded-sm">
            <div className="text-[10px] uppercase font-mono text-muted-foreground">{k}</div>
            <div className="font-mono text-sm">{num(v, 3)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metrics({ m, empty }: { m: ProbabilityMetrics | null; empty: string }) {
  if (!m) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat id="metric-count" label="Samples" value={m.count} />
        <Stat id="metric-brier" label="Brier" value={num(m.brier)} />
        <Stat id="metric-logloss" label="Log loss" value={num(m.logLoss)} />
        <Stat id="metric-accuracy" label="Accuracy" value={pct(m.accuracy)} />
      </div>
      {m.calibration.length === 0 ? (
        <p className="text-sm text-muted-foreground">No calibration bins yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono" data-testid="table-calibration">
            <thead className="text-xs text-muted-foreground text-left">
              <tr><th className="py-1 pr-4">Bin</th><th className="pr-4">Count</th><th className="pr-4">Predicted</th><th>Observed</th></tr>
            </thead>
            <tbody>
              {m.calibration.map((c, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1 pr-4">{pct(c.lower)} - {pct(c.upper)}</td>
                  <td className="pr-4">{c.count}</td>
                  <td className="pr-4">{pct(c.predicted)}</td>
                  <td>{pct(c.observed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" data-testid="loading-evaluation">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-32 border border-border bg-muted/40 animate-pulse rounded-sm" />
      ))}
    </div>
  );
}

export default function Evaluation() {
  const q = useGetProbabilityEvaluation({
    query: { queryKey: getGetProbabilityEvaluationQueryKey(), refetchInterval: 60_000 },
  });
  const d = q.data;

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight">Probability Evaluation</h1>
          <p className="text-sm text-muted-foreground">Five-session horizon, persistent snapshots, weekly automatic validation.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto font-mono"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          data-testid="button-refetch"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${q.isFetching ? "animate-spin" : ""}`} />
          {q.isFetching ? "Refreshing" : "Refresh"}
        </Button>
      </div>

      {q.isLoading && <Skeleton />}

      {q.isError && !d && (
        <div className="border border-destructive/50 p-4 rounded-sm flex flex-wrap items-center gap-3" role="alert" data-testid="error-evaluation">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div className="text-sm">
            Could not load evaluation{q.error?.message ? `: ${q.error.message}` : "."}
          </div>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-retry">
            {q.isFetching ? "Retrying" : "Retry"}
          </Button>
        </div>
      )}

      {q.isError && d && (
        <div className="border border-yellow-600/50 p-3 text-sm rounded-sm" data-testid="warning-stale">
          Refresh failed; showing last loaded data.
        </div>
      )}

      {d && (
        <>
          <Panel title="Status" id="panel-status">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat id="stat-status" label="Status" value={d.status} />
              <Stat id="stat-horizon" label="Horizon" value={`${d.horizonSessions} sessions`} />
              <Stat id="stat-automatic" label="Auto validation" value={d.automatic ? "Enabled" : "Disabled"} />
              <Stat id="stat-total" label="Snapshots" value={d.totalPredictions} />
              <Stat id="stat-pending" label="Pending" value={d.pendingPredictions} />
              <Stat id="stat-completed" label="Completed" value={d.completedPredictions} />
              <Stat id="stat-periods" label="Non-overlapping periods" value={`${d.independentPeriods} / ${d.minimumIndependentPeriods}`} />
              <Stat id="stat-model" label="Active model" value={`v${d.activeModel.id}`} />
            </div>
            <div className="mt-4 h-1.5 bg-muted rounded-sm overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, (d.independentPeriods / Math.max(1, d.minimumIndependentPeriods)) * 100)}%` }}
              />
            </div>
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm font-mono">
              <Stat id="stat-next-capture" label="Next capture" value={fmtDate(d.nextCaptureAt)} />
              <Stat id="stat-next-eval" label="Next evaluation" value={fmtDate(d.nextEvaluationAt)} />
              <Stat id="stat-last-capture" label="Last successful capture" value={fmtDate(d.lastCapturedAt)} />
              <Stat id="stat-last-eval" label="Last successful evaluation" value={fmtDate(d.lastEvaluatedAt)} />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{d.schedule}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Daily captures run 22:15 UTC Mon-Fri; weekly evaluation Saturdays 00:30 UTC. The API must stay running for background captures. Missing historical news is never fabricated.
            </p>
            {d.lastError && (
              <p className="mt-3 text-sm text-destructive font-mono break-words" data-testid="text-last-error">Last error: {d.lastError}</p>
            )}
          </Panel>

          <div className="border border-border p-4 text-sm rounded-sm bg-muted/30" data-testid="note-uncalibrated">
            {d.independentPeriods < d.minimumIndependentPeriods
              ? `Only ${d.independentPeriods} of ${d.minimumIndependentPeriods} required non-overlapping periods collected; there is not yet enough history to validate. `
              : ""}
            Up/down percentages on the dashboard are uncalibrated baselines until a validated, calibrated model version wins weekly validation.
          </div>

          <Panel title="Active parameters" id="panel-active">
            <p className="text-sm text-muted-foreground mb-3">Version {d.activeModel.id}, created {fmtDate(d.activeModel.createdAt)}. {d.activeModel.reason}</p>
            <Params p={d.activeModel.parameters} />
          </Panel>

          <Panel title="Observed live metrics" id="panel-observed">
            <Metrics m={d.observedMetrics} empty="No completed predictions yet, so no observed metrics exist." />
          </Panel>

          <Panel title="Weekly decisions" id="panel-reports">
            {d.reports.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="empty-reports">No weekly reports yet. The first runs Saturday 00:30 UTC.</p>
            ) : (
              <div className="space-y-3">
                {d.reports.map((r) => (
                  <details key={r.id} className="border border-border rounded-sm p-3" data-testid={`report-${r.id}`}>
                    <summary className="cursor-pointer font-mono text-sm flex flex-wrap gap-x-4">
                      <span>{r.week}</span>
                      <span className="uppercase">{r.decision.replace("_", " ")}</span>
                      <span className="text-muted-foreground">{fmtDate(r.createdAt)}</span>
                    </summary>
                    <p className="text-sm mt-2">{r.reason}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 font-mono text-xs">
                      <div>Completed {r.completedCount}</div>
                      <div>Periods {r.independentPeriods}</div>
                      <div>Train {r.trainCount}</div>
                      <div>Validation {r.validationCount}</div>
                      <div>Test {r.testCount}</div>
                      <div>Model {r.currentModelId} to {r.resultingModelId}</div>
                      <div>Baseline Brier {num(r.baselineBrier)}</div>
                      <div>Improvement LB {num(r.improvementLowerBound)}</div>
                      <div>Current Brier {num(r.currentMetrics?.brier)}</div>
                      <div>Candidate Brier {num(r.candidateMetrics?.brier)}</div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Model versions" id="panel-history">
            <div className="space-y-3">
              {d.modelHistory.map((v) => (
                <div key={v.id} className="border border-border rounded-sm p-3" data-testid={`version-${v.id}`}>
                  <div className="font-mono text-sm mb-1">v{v.id} {v.active ? "(active)" : ""} <span className="text-muted-foreground">{fmtDate(v.createdAt)}</span></div>
                  <p className="text-sm text-muted-foreground mb-2">{v.reason}</p>
                  <Params p={v.parameters} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Recent snapshots" id="panel-predictions">
            {d.recentPredictions.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="empty-predictions">No snapshots captured yet. History starts with the first daily capture and is not backfilled.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono min-w-[640px]">
                  <thead className="text-xs text-muted-foreground text-left">
                    <tr><th className="py-1">Ticker</th><th>As of</th><th>Model</th><th>Prob</th><th>Ref close</th><th>Outcome date</th><th>Outcome</th><th>Return</th></tr>
                  </thead>
                  <tbody>
                    {d.recentPredictions.map((p) => (
                      <tr key={p.id} className="border-t border-border" data-testid={`row-prediction-${p.id}`}>
                        <td className="py-1">{p.ticker}</td>
                        <td>{p.asOfDate}</td>
                        <td>v{p.modelId}</td>
                        <td>{pct(p.probability)}</td>
                        <td>{p.referenceClose.toFixed(2)}</td>
                        <td>{p.outcomeDate ?? "pending"}</td>
                        <td>{p.outcome == null ? "pending" : p.outcome === 1 ? "Up" : "Down"}</td>
                        <td>{p.returnPercent == null ? "n/a" : `${p.returnPercent.toFixed(2)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Methodology" id="panel-methodology">
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              {d.methodology.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}
