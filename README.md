# Manny's Terminal

A full-stack trading signals dashboard for a curated 10-stock portfolio. Built with a Bloomberg-style dark terminal UI, a 7-component weighted probability engine, and live data from Alpaca Markets and Finnhub.

![Signal Dashboard](https://img.shields.io/badge/stack-TypeScript-blue) ![API](https://img.shields.io/badge/data-Alpaca%20%2B%20Finnhub-green) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Overview

Manny's Terminal analyzes a fixed portfolio of 8 stocks in real time, computing a weighted probability score for each ticker using technical indicators, news sentiment, and fundamental data. Every ticker gets a confidence-tiered signal (STRONG BUY → STRONG SELL) with a plain-English explanation of the reasoning.

---

## Live Demo

The dashboard is hosted on Replit. Open the live link below in any browser — no install required:

**🔗 [https://chart-whisperer.replit.app/](https://chart-whisperer.replit.app/)**

Notes:
- The link is served by the Replit workspace, so it is only reachable while the Repl is running. If the page does not load, the workspace may be asleep — open the project on Replit and click **Run** to wake it.
- The API runs on the same host under the `/api/*` path (e.g. `/api/signals`).
- For a permanent public URL, deploy the project via Replit's **Publish** button — you will get a stable `*.replit.app` domain.

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

### Component Weights

| Component | Weight | Source |
|-----------|--------|--------|
| Trend | 0.32 | Price vs MA20 / MA50 |
| Momentum | 0.23 | 5-day price return |
| Volume | 0.15 | Continuous volume ratio score |
| RSI | 0.13 | 14-day RSI |
| News | 0.10 | Finnhub headline sentiment |
| Social | 0.04 | Finnhub social sentiment |
| Fundamentals | 0.02 | P/E ratio + EPS quality |

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
| BUY | ≥ 65% |
| HOLD | 35% – 65% |
| SELL | ≤ 35% |
| STRONG SELL | ≤ 20% |

---

## Features

- **Live data** — Price bars from Alpaca Markets (IEX feed), refreshed every 5 minutes
- **Finnhub enrichment** — News headlines, social sentiment, and fundamentals per ticker
- **7-component signal engine** — Weighted probability score with confidence tiers
- **Portfolio dashboard** — All 10 stocks sorted by signal strength with probability bars
- **Ticker detail page** — Full breakdown: Signal Breakdown, Price History chart, Fundamentals Snapshot, and Latest News
- **Plain-English explanations** — Each signal includes a generated sentence explaining the key drivers, including volume and news context when relevant
- **In-memory caching** — 5-minute cache on signals; Finnhub endpoints cached independently (quotes: 5min, news: 30min, metrics: 12h, social: 15min)
- **Bloomberg terminal aesthetic** — Monospaced dark UI with green/red probability bars

---

## Tech Stack

### Frontend (`artifacts/trading-dashboard`)
- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- Recharts (price history chart)
- Wouter (routing)
- TanStack Query

### Backend (`artifacts/api-server`)
- Node.js + Express + TypeScript
- Zod schema validation
- Pino logging
- esbuild bundler

### Shared Libraries
- `lib/api-spec` — OpenAPI 3.1 schema (source of truth)
- `lib/api-zod` — Auto-generated Zod validators
- `lib/api-client-react` — Auto-generated React Query hooks

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
│   │       │   └── alpaca.ts       # Alpaca price bars
│   │       └── routes/
│   │           └── signals.ts      # Portfolio + ticker endpoints
│   └── trading-dashboard/   # React/Vite frontend
│       └── src/
│           ├── pages/
│           │   ├── dashboard.tsx   # Portfolio overview
│           │   └── stock-detail.tsx # Ticker detail page
│           └── components/
├── lib/
│   ├── api-spec/            # openapi.yaml — API contract
│   ├── api-zod/             # Generated Zod schemas
│   └── api-client-react/    # Generated React Query hooks
└── pnpm-workspace.yaml
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/signals` | All 10 portfolio signals |
| `GET` | `/api/signals/:ticker` | Single ticker — full detail with fundamentals + news |
| `GET` | `/api/portfolio/summary` | Aggregate counts (BUY / HOLD / SELL) |

---

## Environment Variables

| Secret | Description |
|--------|-------------|
| `ALPACA_API_KEY` | Alpaca Markets API key |
| `ALPACA_API_SECRET` | Alpaca Markets API secret |
| `FINNHUB_API_KEY` | Finnhub API key (free tier supported) |
| `SESSION_SECRET` | Express session secret |

---

## Getting Started

This project uses [pnpm workspaces](https://pnpm.io/workspaces).

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install dependencies

```bash
pnpm install
```

### Run locally

Start both the API server and the frontend in separate terminals:

```bash
# API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Frontend (Vite dev server)
pnpm --filter @workspace/trading-dashboard run dev
```

### Build

```bash
pnpm --filter @workspace/api-server run build
```

---

## Data Sources

- **[Alpaca Markets](https://alpaca.markets/)** — Historical daily OHLCV bars via the IEX feed (free tier). Used for price, moving averages, RSI, volume, and momentum calculations.
- **[Finnhub](https://finnhub.io/)** — Company news headlines, social sentiment scores, and key fundamental metrics (P/E, EPS, beta, 52-week range, market cap).

---

## Notes

- Social sentiment scoring always returns 0 on Finnhub's free tier (`/stock/social-sentiment` is a premium endpoint)
- The signal engine uses no database — all data is live from external APIs with in-memory caching
