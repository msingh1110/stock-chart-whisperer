# Trading Signals Dashboard

## Overview

Full-stack trading signals dashboard powered by the Alpaca Markets API. Displays real-time signals for a 6-stock portfolio using technical analysis (MA20/MA50 crossovers + RSI).

## Portfolio

**Tickers:** NVDA, MSFT, AAPL, META, SOFI, HOOD

## Trading Strategy

- **MA20** — 20-day Simple Moving Average
- **MA50** — 50-day Simple Moving Average
- **RSI(14)** — 14-period Relative Strength Index (Wilder's smoothed method)

**Signal Logic:**
- **BUY** → MA20 crosses above MA50 AND RSI < 70
- **SELL** → MA20 crosses below MA50 AND RSI > 30
- **HOLD** → otherwise (no crossover or overbought/oversold filter)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (TypeScript)
- **Frontend**: React + Vite + Tailwind CSS + Recharts
- **Validation**: Zod (`zod/v4`)
- **API codegen**: Orval (from OpenAPI spec)

## Artifacts

- `artifacts/trading-dashboard` — React+Vite frontend, served at `/`
- `artifacts/api-server` — TypeScript/Express API server, served at `/api`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/trading-dashboard run dev` — run frontend locally

## API Endpoints

- `GET /api/signals` — all 6 stock signals (cached 5 min)
- `GET /api/signals/:ticker` — signal + full price history for one stock
- `GET /api/portfolio/summary` — BUY/SELL/HOLD count summary

## Environment Variables / Secrets

- `ALPACA_API_KEY` — Alpaca Markets API Key ID (required)
- `ALPACA_API_SECRET` — Alpaca Markets API Secret Key (required)
- `SESSION_SECRET` — session secret (pre-configured)

## Data

Fetches ~300 calendar days (~200 trading days) of daily OHLCV bars from Alpaca's IEX feed per ticker using individual REST requests.

## Features

- Real-time price data from Alpaca Markets IEX feed
- Color-coded signals: Green (BUY), Red (SELL), Yellow (HOLD)
- Price + MA20 + MA50 chart on stock detail page (Recharts)
- Portfolio-level summary bar
- Auto-refresh every 5 minutes
- 5-minute server-side cache to avoid rate limits
