# Manny's Terminal

A full-stack trading signals dashboard for a curated eight-stock portfolio. Built with a dark terminal UI, a seven-component signal engine, live market data, and weekly checks of forecast quality.

![Signal Dashboard](https://img.shields.io/badge/stack-TypeScript-blue) ![API](https://img.shields.io/badge/data-Alpaca%20%2B%20Finnhub-green) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Overview

Manny's Terminal analyzes eight stocks using technical indicators, news sentiment, and fundamental data. Every ticker gets estimated up/down chances, a confidence tier (STRONG BUY → STRONG SELL), and a plain-English explanation of the main drivers.

The **Evaluation** tab records daily forecasts, checks what happened after five trading sessions, and reviews possible settings changes each week. Changes are applied automatically only after every validation check passes.

**Important:** The original percentages are score-based estimates, not proven probabilities. This is a research tool, not investment advice, automated trade execution, or a guarantee of returns.

---

## Live Demo

The dashboard is hosted on Replit. Open the live link below in any browser — no install required:

**[Open Manny's Terminal](https://stock-chart-whisperer.replit.app)**

---

## Portfolio

| Ticker | Name |
|--------|------|
| NVDA | NVIDIA Corporation |
| MSFT | Microsoft Corporation |
| AAPL | Apple Inc. |
| META | Meta Platforms Inc. |
| SOFI | SoFi Technologies |
| HOOD | Robinhood Markets |
| SHEL | Shell plc |
| LMT | Lockheed Martin |

---

## Signal Engine

Each ticker is scored across 7 weighted components. The final score maps to an up/down probability and a confidence tier.

### Starting Component Weights

| Component | Weight | Source |
|-----------|--------|--------|
| Trend | 0.32 | Price vs MA20 / MA50 |
| Momentum | 0.23 | 5-day price return |
| Volume | 0.15 | Continuous volume ratio score |
| RSI | 0.13 | 14-day RSI |
| News | 0.10 | Finnhub headline sentiment |
| Social | 0.04 | Finnhub social sentiment |
| Fundamentals | 0.02 | P/E ratio + EPS quality |

These are the original weights. The baseline converts the weighted score to an up chance using `(score + 1) / 2`, bounded between 0.1% and 99.9%. A validated update can adjust the weights or introduce logistic calibration. Stored calibration slope and intercept are not applied to the linear baseline.

### Volume Scoring

Volume uses a continuous model rather than a simple binary ±1:

- **Score** = `(volumeRatio − 1) × 1.2`, capped to `[−1, +1]`
- **Breakout amplification**: ±0.2 bonus when price clears/breaks MA50 with volume > 1.5×
- **Low-volume penalty**: score halved when ratio < 0.8 (weak conviction)
- **Spike multiplier**: ×1.2 when ratio > 2× average

### Confidence Tiers

| Tier | Up Probability |
|------|---------------|
| STRONG BUY | ≥ 80% |
| BUY | ≥ 65% and < 80% |
| HOLD | > 35% and < 65% |
| SELL | > 20% and ≤ 35% |
| STRONG SELL | ≤ 20% |

The underlying signal is BUY, HOLD, or SELL; the confidence tier adds the STRONG labels. These thresholds stay fixed when the evaluation process tunes the model.

---

## Features

- **Market data** — Split-adjusted daily price bars from Alpaca Markets (IEX feed), refreshed every 5 minutes
- **Finnhub enrichment** — News headlines, social sentiment, and fundamentals per ticker
- **7-component signal engine** — Weighted probability score with confidence tiers
- **Portfolio dashboard** — All eight stocks sorted by signal strength with probability bars
- **Ticker detail page** — Full breakdown: Signal Breakdown, Price History chart, Fundamentals Snapshot, and Latest News
- **Plain-English explanations** — Each signal includes a generated sentence explaining the key drivers, including volume and news context when relevant
- **In-memory caching** — Five-minute signal cache keyed by the active model version; Finnhub endpoints cached independently
- **Bloomberg terminal aesthetic** — Monospaced dark UI with green/red probability bars
- **Plain-English Evaluation tab** — Recorded, waiting, and checked forecast counts; progress toward the minimum history; readable weekly decisions and local-time schedules
- **Expandable technical details** — Calibration tables, active parameters, model versions, and the full methodology remain available without overwhelming the main page
- **Persistent history** — PostgreSQL stores forecast snapshots, outcomes, weekly reports, and previous settings versions

---

## Weekly Forecast Evaluation

### What is checked?

After the market closes, the terminal saves each stock's estimated chance of going up, the inputs used, and the model version. It checks whether the split-adjusted closing price is strictly higher after **five trading sessions**. Weekends and market closures do not count. A flat price counts as **down or unchanged**.

The original forecast is not rewritten after seeing the result. Missing prediction days and historical news are never invented. Missing reference or target price bars leave the forecast waiting for a result.

### When does it run?

| Job | Schedule |
|-----|----------|
| Daily forecast recording | Monday–Friday at 22:15 UTC |
| Weekly evaluation | Saturday at 00:30 UTC |

The internal scheduler checks every ten minutes and also runs when the API starts. A late daily recording is allowed only on the same UTC evening; a missed weekly check catches up after restart. The Evaluation page refreshes every minute, displays times in the viewer's timezone, and retains the exact UTC schedule in its technical details.

### When can settings change?

The process needs at least **200 checked forecasts** and **40 separate, non-overlapping portfolio periods** within the most recent 12 months. Stocks from the same prediction day are grouped together, so correlated stocks and overlapping forecast windows do not inflate the evidence.

With consistent daily recording, the 40-period requirement takes roughly **10–12 months**. Weekly reports are still produced during collection, but the starting settings remain unchanged until there is enough evidence.

Earlier periods are used to learn possible adjustments, the next eight periods select a candidate, and the latest twelve periods test it on results not used to choose its settings. An update must pass every check:

- Improve the probability-error score (**Brier score**) by at least 0.002 on the selection set and 0.005 on the final test set.
- Beat a simple predictor based only on the frequency of up outcomes in the training data.
- Have no worse **log loss**, which penalizes confidently wrong forecasts.
- Show a positive lower bound in a 95% paired portfolio-block bootstrap confidence check.

Weight adjustments transfer at most 0.01 between varying components. Calibration slope changes are limited to 0.5 and intercept changes to 0.1 per update. There must be at least **28 days** between automatic updates.

Passing these checks does not guarantee future accuracy or returns. Direction accuracy is not investment profit, and repeated testing on a fixed portfolio limits how broadly the findings apply.

### What does the Evaluation page show?

- **Recorded:** forecasts saved so far.
- **Waiting for result:** forecasts awaiting the final price, including missing price data.
- **Checked:** forecasts compared with actual outcomes.
- **Settings decisions:** whether there was too little history, existing settings were kept, or a validated update was applied.
- **Forecast quality:** direction accuracy, Brier score, log loss, and stated chances compared with how often prices actually went up.
- **History:** recent forecasts, weekly reports, and retained settings versions.

The page is read-only: there are no public run, tuning, or rollback controls. Model activation and its report are saved together in a database transaction; an advisory lock prevents overlapping scheduler runs across server instances.

### Continuous operation

**The API must stay running for unattended recording and weekly checks.** Use an always-on host, such as a Replit Reserved VM. An idle Autoscale deployment can stop the background timer; development Preview is not a guarantee of unattended scheduling. Publishing the dashboard alone does not make missed forecasts recoverable.

---

## Tech Stack

### Frontend (`artifacts/trading-dashboard`)
- React 19 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- Recharts (price history chart)
- Wouter (routing)
- TanStack Query

### Backend (`artifacts/api-server`)
- Node.js 24 + Express 5 + TypeScript
- Zod schema validation
- PostgreSQL + Drizzle ORM
- Pino logging
- esbuild bundler

### Shared Libraries
- `lib/api-spec` — OpenAPI 3.1 schema (source of truth)
- `lib/api-zod` — Auto-generated Zod validators
- `lib/api-client-react` — Auto-generated React Query hooks
- `lib/db` — PostgreSQL connection and Drizzle schemas

Orval output explicitly targets React Query v5 and Zod 3 to match the installed runtimes.

---

## Project Structure

```
.
├── artifacts/
│   ├── api-server/          # Express API — signal engine, Alpaca + Finnhub integration
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── indicators.ts   # 7-component signal engine
│   │       │   ├── finnhub.ts      # Finnhub enrichment + caching
│   │       │   ├── alpaca.ts       # Alpaca price bars
│   │       │   └── probability-*.ts # Calibration, validation, scheduling + storage
│   │       └── routes/
│   │           ├── signals.ts      # Portfolio + ticker endpoints
│   │           └── probability-evaluation.ts # Read-only evaluation status endpoint
│   └── trading-dashboard/   # React/Vite frontend
│       └── src/
│           ├── pages/
│           │   ├── dashboard.tsx   # Portfolio overview
│           │   ├── stock-detail.tsx # Ticker detail page
│           │   └── evaluation.tsx   # Plain-English forecast check-up
│           └── components/
├── lib/
│   ├── api-spec/            # openapi.yaml — API contract
│   ├── api-zod/             # Generated Zod schemas
│   ├── api-client-react/    # Generated React Query hooks
│   └── db/                  # Persistent forecast, model + report schemas
└── pnpm-workspace.yaml
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/signals` | All eight portfolio signals |
| `GET` | `/api/signals/:ticker` | Single ticker — full detail with fundamentals + news |
| `GET` | `/api/portfolio/summary` | Aggregate counts (BUY / HOLD / SELL) |
| `GET` | `/api/probability-evaluation` | Collection status, forecast quality, weekly decisions, settings versions, and recent forecasts |

---

## Environment Variables

| Secret | Description |
|--------|-------------|
| `ALPACA_API_KEY` | Alpaca Markets API key |
| `ALPACA_API_SECRET` | Alpaca Markets API secret |
| `FINNHUB_API_KEY` | Finnhub API key (free tier supported) |
| `DATABASE_URL` | PostgreSQL connection for forecast, report, and model history |

Keep credentials in Replit Secrets or your host's secret manager; never commit them. Alpaca credentials are required for live signal endpoints. Finnhub enables news, fundamentals, and company enrichment; unavailable enrichment contributes neutral values rather than invented news. PostgreSQL is required for model state and evaluation history.

Both services require `PORT`; the frontend also requires `BASE_PATH` (normally `/`). Managed Replit artifact workflows supply these routing values.

---

## Getting Started

This project uses [pnpm workspaces](https://pnpm.io/workspaces).

### Prerequisites

- Node.js 24
- pnpm 10

### Install and prepare the development database

Configure PostgreSQL and `DATABASE_URL` securely before applying the schema. Also supply the market-data credentials before starting the API.

```bash
pnpm install
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/db run push
```

Configure the API credentials and `DATABASE_URL` securely before starting the app. The schema command applies the development database schema; review any proposed changes when using an existing database.

### Run on Replit

Start the existing managed workflows:

- `artifacts/api-server: API Server`
- `artifacts/trading-dashboard: web`

They supply the service ports and route the dashboard at `/` and API at `/api`. Do not create duplicate workflows.

### Run on another host

Start the API and frontend in separate terminals after supplying the required environment variables:

```bash
# API server (requires PORT, DATABASE_URL, and API credentials)
pnpm --filter @workspace/api-server run dev

# Frontend (requires its own PORT and BASE_PATH)
pnpm --filter @workspace/trading-dashboard run dev
```

Use a same-origin reverse proxy to serve the frontend at `/` and forward `/api` to the API server. The frontend deliberately does not include a localhost API URL or a Vite API proxy.

### Checks and tests

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test:probabilities
```

The deterministic offline tests cover five-session outcomes, holidays, missing ticker bars, incomplete sessions, schedules, overlapping windows, sample minimums, calibration, held-back results, confidence checks, and live use of model parameters. They do not need market-data credentials or a database.

### Build

```bash
pnpm run build
```

The frontend build requires `PORT` and `BASE_PATH` even though it produces static files. On Replit, use the managed artifact publishing configuration.

---

## Data Sources

- **[Alpaca Markets](https://alpaca.markets/)** — Approximately 300 calendar days of historical daily OHLCV bars via the IEX feed. Used for price, moving averages, RSI, volume, momentum, and split-adjusted outcome checks. This is not a streaming tick feed.
- **[Finnhub](https://finnhub.io/)** — Company news headlines, social sentiment scores, and key fundamental metrics (P/E, EPS, beta, 52-week range, market cap).

---

## Notes

- Finnhub social sentiment requires premium access; when unavailable, its score is neutral rather than fabricated.
- Price direction and price-change results exclude dividends and are not total investment returns.
- Forecasts and evaluation history are stored in PostgreSQL. Signal responses and provider enrichment use in-memory caches.
- Previous model versions are retained. Changing the active model changes the signal-cache key.
- No orders are submitted to a broker.
