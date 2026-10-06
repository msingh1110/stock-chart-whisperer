# Trading Signals Dashboard

## Overview

Full-stack trading signals dashboard powered by Alpaca Markets and Finnhub. Displays weighted technical, sentiment and fundamental signals for an eight-stock portfolio, with persistent prospective probability evaluation.

## Portfolio

**Tickers:** NVDA, MSFT, AAPL, META, SOFI, HOOD, SHEL, LMT

## Trading Strategy

- **MA20** — 20-day Simple Moving Average
- **MA50** — 50-day Simple Moving Average
- **RSI(14)** — 14-period Relative Strength Index using rolling average gains/losses

**Signal Logic:**
- Seven weighted components: trend, momentum, RSI, volume, news, social and fundamentals.
- **BUY** → up probability ≥65%; **SELL** → up probability ≤35%; **HOLD** otherwise.
- Strong-confidence thresholds remain 80% / 20%.
- Baseline probabilities are a linear score conversion, not empirically calibrated likelihoods. Validated versions can change weights and use logistic calibration.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (TypeScript)
- **Frontend**: React + Vite + Tailwind CSS + Recharts
- **Validation**: generated Zod 3 schemas; generator output version is explicitly pinned
- **API codegen**: Orval (from OpenAPI spec)

## Artifacts

- `artifacts/trading-dashboard` — React+Vite frontend, served at `/`
- `artifacts/api-server` — TypeScript/Express API server, served at `/api`

## Key Commands

### Running on Replit

Use the existing managed workflows:
- `artifacts/api-server: API Server` — starts the Express backend.
- `artifacts/trading-dashboard: web` — starts the dashboard at `/`.

These workflows supply the required `PORT` and `BASE_PATH` values and route `/api` to the backend. Do not create duplicate workflows or a Vite API proxy.

For a fresh checkout, use Node.js 24, run `pnpm install`, then `pnpm --filter @workspace/api-spec run codegen`. The generator targets React Query v5. Run `pnpm run typecheck` to check all packages.

Live signals require `ALPACA_API_KEY` and `ALPACA_API_SECRET` in Replit Secrets. `FINNHUB_API_KEY` enables news, fundamentals, and company enrichment. Without Alpaca credentials the UI can load, but signal endpoints fail; no simulated market data is substituted. Restart the API workflow after adding credentials.

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/trading-dashboard run dev` — run frontend locally
- `pnpm --filter @workspace/api-server run test:probabilities` — deterministic offline evaluation tests

## API Endpoints

- `GET /api/signals` — all 8 stock signals (cached 5 min, keyed by active model version)
- `GET /api/signals/:ticker` — signal + full price history for one stock
- `GET /api/portfolio/summary` — BUY/SELL/HOLD count summary
- `GET /api/probability-evaluation` — persistent collection status, metrics, weekly reports and model history

## Environment Variables / Secrets

- `ALPACA_API_KEY` — Alpaca Markets API Key ID (required)
- `ALPACA_API_SECRET` — Alpaca Markets API Secret Key (required)
- `FINNHUB_API_KEY` — news, fundamentals and company enrichment
- `DATABASE_URL` — managed PostgreSQL connection for prediction and model history
- `SESSION_SECRET` — session secret (pre-configured)

## Data

Fetches ~300 calendar days (~200 trading days) of daily OHLCV bars from Alpaca's IEX feed per ticker using individual REST requests. Live signals and evaluation use split-adjusted history; direction labels exclude dividends.

## Weekly Probability Evaluation

**User-selected policy:** predict direction after five trading sessions and automatically apply parameter changes only after validation. Preserve that policy unless the user changes it.

- UI: `/evaluation`. Read-only; no publicly accessible model-changing endpoints.
- PostgreSQL stores immutable daily features, enrichment context, precise probabilities and model IDs, plus outcomes, weekly reports and versioned parameters.
- Capture attempts run Mon–Fri at 22:15 UTC; weekly evaluations run Saturdays at 00:30 UTC. A ten-minute internal timer checks due work and runs on startup.
- Daily capture catches up only within the same UTC evening. Never reconstruct old news or fabricate missed forecasts. Weekly evaluation catches up after a restart.
- Shared completed portfolio session dates determine the fifth-session target. Missing ticker reference/target bars remain pending; flat outcomes count as not up.
- Use the latest 12 months of completed observations. Select non-overlapping portfolio outcome windows; require 200 completed observations and 40 such periods. The last eight pre-test periods select candidates, the last twelve periods test them, and earlier periods train them.
- Promotion requires validation Brier improvement of at least 0.002, held-out improvement of at least 0.005, a win against a training-only base-rate predictor, no worse log loss, and a positive 95% paired portfolio-block bootstrap lower bound.
- Limit changes to 0.01 transferred between varying component weights, calibration slope changes up to 0.5, intercept changes up to 0.1, and a 28-day promotion cooldown. Keep BUY/SELL thresholds unchanged.
- Model/report updates are atomic. A PostgreSQL advisory lock prevents concurrent replicas from duplicating scheduler work. Previous model versions are retained.
- New installations start with no prospective observations; 40 non-overlapping five-session outcome periods take roughly 10–12 months with consistent daily capture. No automatic changes happen during insufficient-data collection.
- For unattended collection, keep the API continuously running. Replit Reserved VM publishing supports always-on background work; an idle Autoscale deployment can stop the timer. Development Preview alone is not an unattended scheduling guarantee.
- Development schema command: `pnpm --filter @workspace/db run push`. Publish applies the managed production schema; do not add startup-time schema creation or custom production migrations.

This is research and probability calibration, not automated trade execution or a guarantee of returns.

## Features

- Real-time price data from Alpaca Markets IEX feed
- Color-coded signals: Green (BUY), Red (SELL), Yellow (HOLD)
- Price + MA20 + MA50 chart on stock detail page (Recharts)
- Portfolio-level summary bar
- Auto-refresh every 5 minutes
- 5-minute server-side cache to avoid rate limits
