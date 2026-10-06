import { AlertCircle, AlertTriangle, RefreshCw } from "lucide-react";
import {
  useGetProbabilityEvaluation,
  getGetProbabilityEvaluationQueryKey,
} from "@workspace/api-client-react";
import type {
  ProbabilityEvaluation,
  ProbabilityMetrics,
  ProbabilityParameters,
  ProbabilityReport,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

const MIN_COMPLETED = 200;
const VIEWER_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
})();

function fmtDate(s: string | null | undefined): string {
  if (!s) return "Not yet";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}
const fmtUtc = (s: string | null | undefined) => (s ? `${s} (UTC as sent by server)` : "Not yet");
const fmtDay = (s: string) => {
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};
const num = (n: number | null | undefined, d = 4) => (n == null ? "n/a" : n.toFixed(d));
const pct0 = (n: number | null | undefined) => (n == null ? "n/a" : `${Math.round(n * 100)}%`);
const pct1 = (n: number | null | undefined) => (n == null ? "n/a" : `${(n * 100).toFixed(1)}%`);

const STATUS: Record<string, { label: string; text: string; tone: string }> = {
  collecting: {
    label: "Collecting history",
    text: "The terminal saves a forecast each trading day, then checks what the stocks actually did. We are building enough history to judge how reliable the percentages are.",
    tone: "border-border",
  },
  monitoring: {
    label: "Checking forecasts",
    text: "The terminal is comparing forecasts with what happened. Settings change only when there is enough recent history and an update passes every check. Future results are never guaranteed.",
    tone: "border-border",
  },
  degraded: {
    label: "Needs attention",
    text: "Something went wrong with a recent capture or check, so the data below may be incomplete or out of date. Collection may have been interrupted.",
    tone: "border-destructive/60",
  },
};

const DECISION: Record<string, { label: string; text: (r: ProbabilityReport) => string }> = {
  insufficient_data: {
    label: "Not enough history",
    text: (r) =>
      `Only ${r.completedCount} checked forecast${r.completedCount === 1 ? "" : "s"} across ${r.independentPeriods} separate period${r.independentPeriods === 1 ? "" : "s"} so far, which is too little to judge. Settings were left unchanged.`,
  },
  kept: {
    label: "Settings kept",
    text: (r) => r.reason.toLowerCase().includes("cooldown")
      ? "An update passed the checks, but the terminal is waiting until 28 days have passed since the last change. Settings were left unchanged."
      : "A possible update was tested on results it had not used to learn, but did not pass every required check. Settings were left unchanged.",
  },
  promoted: {
    label: "Settings updated",
    text: () =>
      "A tested update passed every validation check and became the active settings. Passing checks is not a guarantee of future results.",
  },
};

function Section({ title, intro, children, id }: { title: string; intro?: string; children: React.ReactNode; id: string }) {
  return (
    <section data-testid={id} aria-labelledby={`${id}-h`} className="border border-border bg-card rounded-sm">
      <div className="px-4 py-3 border-b border-border">
        <h2 id={`${id}-h`} className="font-mono text-sm font-bold tracking-tight">{title}</h2>
        {intro && <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{intro}</p>}
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

function Big({ label, value, hint, id }: { label: string; value: React.ReactNode; hint: string; id: string }) {
  return (
    <div className="border border-border rounded-sm p-3 min-w-0" data-testid={id}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-2xl font-bold my-1">{value}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function Progress({ label, value, max, note, id }: { label: string; value: number; max: number; note: string; id: string }) {
  const p = Math.min(100, (value / Math.max(1, max)) * 100);
  return (
    <div data-testid={id}>
      <div className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="font-mono">{value} of {max}</span>
      </div>
      <div
        className="h-2 bg-muted rounded-sm overflow-hidden my-1"
        role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}
      >
        <div className="h-full bg-primary" style={{ width: `${p}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function When({ label, value, id }: { label: string; value: string; id: string }) {
  return (
    <div data-testid={id} className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-mono break-words">{value}</dd>
    </div>
  );
}

function Details({ summary, children, id }: { summary: string; children: React.ReactNode; id?: string }) {
  return (
    <details className="border border-border rounded-sm group" data-testid={id}>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none">{summary}</summary>
      <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>
    </details>
  );
}

function Params({ p }: { p: ProbabilityParameters }) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-xs break-words">
        method {p.method}
        {p.method === "logistic"
          ? ` / slope ${p.slope} / intercept ${p.intercept}`
          : " (slope and intercept are stored but not applied to linear forecasts)"}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {Object.entries(p.weights).map(([k, v]) => (
          <div key={k} className="border border-border p-2 rounded-sm">
            <div className="text-[10px] uppercase font-mono text-muted-foreground">{k}</div>
            <div className="font-mono text-xs">{String(v)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalibrationTable({ m }: { m: ProbabilityMetrics }) {
  if (m.calibration.length === 0) return <p className="text-sm text-muted-foreground">No calibration groups yet.</p>;
  return (
    <div className="overflow-x-auto">
      <p className="text-xs text-muted-foreground mb-2">
        Forecasts are grouped by the up chance they stated. If the terminal were well calibrated, the actual up rate in each group would be close to the stated chance.
      </p>
      <table className="w-full text-sm font-mono min-w-[420px]" data-testid="table-calibration">
        <thead className="text-xs text-muted-foreground text-left">
          <tr><th className="py-1 pr-4">Stated up chance</th><th className="pr-4">Forecasts</th><th className="pr-4">Average stated</th><th>Actually went up</th></tr>
        </thead>
        <tbody>
          {m.calibration.map((c, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1 pr-4">{pct0(c.lower)} to {pct0(c.upper)}</td>
              <td className="pr-4">{c.count}</td>
              <td className="pr-4">{pct1(c.predicted)}</td>
              <td>{pct1(c.observed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportCard({ r }: { r: ProbabilityReport }) {
  const dec = DECISION[r.decision] ?? { label: r.decision, text: () => "" };
  return (
    <div className="border border-border rounded-sm p-3 space-y-2" data-testid={`report-${r.id}`}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-medium">{dec.label}</span>
        <span className="text-xs text-muted-foreground">Week {r.week}, run {fmtDate(r.createdAt)}</span>
      </div>
      <p className="text-sm">{dec.text(r)}</p>
      <Details summary="Technical details for this check">
        <p className="text-xs font-mono break-words">Reason from system: {r.reason}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
          <div>Completed {r.completedCount}</div>
          <div>Separate periods {r.independentPeriods}</div>
          <div>Settings version {r.currentModelId} to {r.resultingModelId}</div>
          <div>Practice set {r.trainCount}</div>
          <div>Tuning set {r.validationCount}</div>
          <div>Final test set {r.testCount}</div>
          <div>Baseline Brier {num(r.baselineBrier)}</div>
          <div>Improvement lower bound {num(r.improvementLowerBound)}</div>
          <div>Current Brier {num(r.currentMetrics?.brier)}</div>
          <div>Candidate Brier {num(r.candidateMetrics?.brier)}</div>
        </div>
        {r.candidateParameters && <Params p={r.candidateParameters} />}
      </Details>
    </div>
  );
}

function Content({ d }: { d: ProbabilityEvaluation }) {
  const st = STATUS[d.status] ?? { label: d.status, text: "", tone: "border-border" };
  const latest = d.reports[0];
  const lastPromoted = d.reports.find((r) => r.decision === "promoted");
  const hasEarlierVersions = d.modelHistory.some(v => v.id !== d.activeModel.id);
  const m = d.observedMetrics;
  const recentChecked = m?.count ?? 0;
  const enough = recentChecked >= MIN_COMPLETED && d.independentPeriods >= d.minimumIndependentPeriods;

  return (
    <>
      <section className={`border rounded-sm p-4 bg-card ${st.tone}`} data-testid="panel-status" aria-live="polite">
        <div className="flex items-center gap-2">
          {d.status === "degraded" && <AlertTriangle className="h-4 w-4 text-destructive" />}
          <h2 className="font-mono font-bold" data-testid="stat-status">{st.label}</h2>
        </div>
        <p className="text-sm mt-2 max-w-3xl">{st.text}</p>
        {d.lastError && (
          <p className="mt-3 text-sm text-destructive break-words" role="alert" data-testid="text-last-error">
            Most recent problem reported: {d.lastError}
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-3 max-w-3xl" data-testid="stat-automatic">
          Automatic settings updates are {d.automatic ? "on" : "off"}. {d.automatic && "Settings change only when a tested update passes every required check—not just because another week has passed."}
        </p>
      </section>

      <Section id="panel-progress" title="Where your predictions stand" intro={`Each trading day the terminal records an up chance for every stock. It then waits ${d.horizonSessions} trading days (weekends and market closures do not count) and checks whether the price ended higher.`}>
        <div className="grid sm:grid-cols-3 gap-3">
          <Big id="stat-total" label="Recorded" value={d.totalPredictions} hint="Predictions saved so far." />
          <Big id="stat-pending" label="Waiting for result" value={d.pendingPredictions} hint="Waiting for the final price to be available." />
          <Big id="stat-completed" label="Checked" value={d.completedPredictions} hint="Compared with what the price actually did." />
        </div>
        <div className="space-y-4">
          <Progress id="progress-completed" label="Recent checked forecasts" value={recentChecked} max={MIN_COMPLETED} note={`At least ${MIN_COMPLETED} checked forecasts from the last 12 months are needed before a settings change can be considered.`} />
          <Progress id="progress-periods" label="Separate time periods" value={d.independentPeriods} max={d.minimumIndependentPeriods} note={`Nearby forecasts cover much of the same price movement. To avoid counting it twice, we use separate ${d.horizonSessions}-trading-day periods. Reaching ${d.minimumIndependentPeriods} takes roughly 10 to 12 months of daily recording.`} />
        </div>
        <p className="text-sm" data-testid="note-uncalibrated">
          {enough
            ? "Both minimums are met, so weekly checks can now judge whether an update is worthwhile."
            : "We need more checked history before considering a settings change."}
          {" "}{hasEarlierVersions
            ? "Passing these checks cannot guarantee that future forecasts will be right."
            : "The dashboard percentages are starting estimates. They have not yet passed the full reliability checks."}
          {" "}No trades are placed, and returns are not guaranteed.
        </p>
      </Section>

      <Section id="panel-active" title="Have the settings changed?" intro="The settings control how the dashboard blends trend, momentum, RSI, volume, news, social and fundamentals into an up chance.">
        <div className="text-sm space-y-2">
          <p data-testid="text-active-summary">
            {lastPromoted
              ? `The settings were last updated in the check for week ${lastPromoted.week}. Currently using version ${d.activeModel.id}.`
              : hasEarlierVersions
                ? `Currently using version ${d.activeModel.id}. Earlier updates are available in the settings version history below.`
              : `No update has ever passed validation, so the terminal is still using its original starting settings (version ${d.activeModel.id}).`}
          </p>
          {latest ? (
            <p>
              Latest weekly check: <strong>{(DECISION[latest.decision]?.label) ?? latest.decision}</strong>. {(DECISION[latest.decision] ?? { text: () => "" }).text(latest)}
            </p>
          ) : (
            <p data-testid="empty-reports">No weekly check has run yet. The first happens on the next evaluation time shown below.</p>
          )}
        </div>
        <Details summary="Technical details: active settings" id="details-active">
          <p className="text-xs text-muted-foreground">Version {d.activeModel.id}, created {fmtDate(d.activeModel.createdAt)}.</p>
          <p className="text-xs font-mono break-words">Reason from system: {d.activeModel.reason}</p>
          <Params p={d.activeModel.parameters} />
        </Details>
      </Section>

      <Section id="panel-schedule" title="When things happen" intro={`Times are shown in your timezone (${VIEWER_TZ}).`}>
        <dl className="grid sm:grid-cols-2 gap-4">
          <When id="stat-next-capture" label="Next daily snapshot" value={fmtDate(d.nextCaptureAt)} />
          <When id="stat-next-eval" label="Next weekly check" value={fmtDate(d.nextEvaluationAt)} />
          <When id="stat-last-capture" label="Last successful snapshot" value={fmtDate(d.lastCapturedAt)} />
          <When id="stat-last-eval" label="Last successful weekly check" value={fmtDate(d.lastEvaluatedAt)} />
        </dl>
        <p className="text-sm text-muted-foreground">
          Snapshots are saved after each market close on weekdays; the weekly check runs on Saturdays. The server must stay running for this to happen, and missed days are not backfilled. Historical news is never invented.
        </p>
        <Details summary="Technical details: exact schedule (UTC)">
          <p className="text-xs font-mono break-words">{d.schedule}</p>
          <p className="text-xs font-mono">Daily snapshots 22:15 UTC Mon-Fri. Weekly check Saturdays 00:30 UTC.</p>
          <p className="text-xs font-mono break-words">nextCaptureAt {fmtUtc(d.nextCaptureAt)}</p>
          <p className="text-xs font-mono break-words">nextEvaluationAt {fmtUtc(d.nextEvaluationAt)}</p>
          <p className="text-xs font-mono break-words">lastCapturedAt {fmtUtc(d.lastCapturedAt)}</p>
          <p className="text-xs font-mono break-words">lastEvaluatedAt {fmtUtc(d.lastEvaluatedAt)}</p>
        </Details>
      </Section>

      <Section id="panel-observed" title="How forecasts have done so far" intro="Based only on forecasts that have already been checked.">
        {!m || m.count === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="empty-observed">Nothing has been checked yet, so there are no results to show. The first forecasts finish about {d.horizonSessions} trading days after they were recorded.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Big id="metric-count" label="Checked forecasts" value={m.count} hint="Results included below." />
              <Big id="metric-accuracy" label="Direction right" value={pct0(m.accuracy)} hint="How often up versus down-or-unchanged was called correctly. This is not profit." />
              <Big id="metric-brier" label="Brier score" value={num(m.brier, 3)} hint="Lower is better. Measures how far the stated chances were from what happened." />
              <Big id="metric-logloss" label="Log loss" value={num(m.logLoss, 3)} hint="Lower is better. Penalises confident forecasts that were wrong." />
            </div>
            <p className="text-sm text-muted-foreground">With few checked forecasts these numbers can swing a lot and should not be read as reliable.</p>
            <Details summary="Calibration: stated chances versus what happened">
              <CalibrationTable m={m} />
              <p className="text-xs font-mono">Exact: Brier {m.brier}, log loss {m.logLoss}, accuracy {m.accuracy}</p>
            </Details>
          </>
        )}
      </Section>

      <Section id="panel-reports" title="Weekly check history" intro="Each Saturday the terminal decides whether to keep or change its settings.">
        {d.reports.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="empty-reports-list">No weekly checks have been recorded yet.</p>
        ) : (
          <div className="space-y-3">{d.reports.map((r) => <ReportCard key={r.id} r={r} />)}</div>
        )}
      </Section>

      <Section id="panel-predictions" title="Recent forecasts" intro="The latest snapshots. Up chance is the terminal's estimate at the time; the result is filled in once the waiting period ends.">
        {d.recentPredictions.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="empty-predictions">No forecasts have been recorded yet. History begins with the first daily snapshot and is not backfilled.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead className="text-xs text-muted-foreground text-left">
                <tr><th className="py-1 pr-3">Stock</th><th className="pr-3">Forecast date</th><th className="pr-3">Up chance</th><th className="pr-3">Price then</th><th className="pr-3">Settings</th><th className="pr-3">Result</th><th className="pr-3">Change</th><th>Result date</th></tr>
              </thead>
              <tbody className="font-mono">
                {d.recentPredictions.map((p) => (
                  <tr key={p.id} className="border-t border-border" data-testid={`row-prediction-${p.id}`}>
                    <td className="py-1 pr-3 font-bold">{p.ticker}</td>
                    <td className="pr-3">{fmtDay(p.asOfDate)}</td>
                    <td className="pr-3">{pct0(p.probability)}</td>
                    <td className="pr-3">{p.referenceClose.toFixed(2)}</td>
                    <td className="pr-3">v{p.modelId}</td>
                    <td className="pr-3">{p.outcome == null ? "Waiting" : p.outcome === 1 ? "Went up" : "Down or unchanged"}</td>
                    <td className="pr-3">{p.returnPercent == null ? "n/a" : `${p.returnPercent.toFixed(2)}%`}</td>
                    <td>{p.outcomeDate ? fmtDay(p.outcomeDate) : "Pending"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section id="panel-technical" title="Technical reference" intro="For anyone who wants the full detail. You do not need this to use the terminal.">
        <Details summary={`Settings version history (${d.modelHistory.length})`} id="panel-history">
          {d.modelHistory.map((v) => (
            <div key={v.id} className="border border-border rounded-sm p-3 space-y-1" data-testid={`version-${v.id}`}>
              <div className="font-mono text-sm">Version {v.id}{v.active ? " (active)" : ""} <span className="text-muted-foreground text-xs">{fmtDate(v.createdAt)}</span></div>
              <p className="text-xs font-mono break-words">Reason from system: {v.reason}</p>
              <Params p={v.parameters} />
            </div>
          ))}
        </Details>
        <Details summary="Methodology (as provided by the system)" id="panel-methodology">
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            {d.methodology.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </Details>
      </Section>
    </>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" data-testid="loading-evaluation" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-32 border border-border bg-muted/40 animate-pulse rounded-sm" />
      ))}
    </div>
  );
}

export default function Evaluation() {
  const q = useGetProbabilityEvaluation({
    query: { queryKey: getGetProbabilityEvaluationQueryKey(), refetchInterval: 60000 },
  });
  const d = q.data;

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="font-mono text-2xl font-bold tracking-tight">Forecast Check-up</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            See how the predictions compare with real results, and whether the settings have changed. This page refreshes every minute.
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto font-mono" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-refetch">
          <RefreshCw className={`h-4 w-4 mr-2 ${q.isFetching ? "animate-spin" : ""}`} />
          {q.isFetching ? "Refreshing" : "Refresh"}
        </Button>
      </div>

      {q.isLoading && <Skeleton />}

      {q.isError && !d && (
        <div className="border border-destructive/50 p-4 rounded-sm flex flex-wrap items-center gap-3" role="alert" data-testid="error-evaluation">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div className="text-sm">Could not load the check-up{q.error?.message ? `: ${q.error.message}` : "."}</div>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-retry">
            {q.isFetching ? "Retrying" : "Retry"}
          </Button>
        </div>
      )}

      {q.isError && d && (
        <div className="border border-destructive/50 p-3 text-sm rounded-sm" role="alert" data-testid="warning-stale">
          The latest refresh failed. Showing the last data that loaded, which may be out of date.
        </div>
      )}

      {d && <Content d={d} />}
    </div>
  );
}
