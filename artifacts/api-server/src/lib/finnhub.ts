const FINNHUB_BASE = "https://finnhub.io/api/v1";

// ── Cache infrastructure ──────────────────────────────────────────────────────

interface CacheSlot<T> {
  data: T;
  ts:   number;
}

function makeCache<T>(ttlMs: number) {
  const store = new Map<string, CacheSlot<T>>();
  return {
    get(key: string): T | null {
      const slot = store.get(key);
      if (!slot) return null;
      if (Date.now() - slot.ts > ttlMs) { store.delete(key); return null; }
      return slot.data;
    },
    set(key: string, data: T) {
      store.set(key, { data, ts: Date.now() });
    },
  };
}

const quoteCache   = makeCache<FhQuote>(5 * 60_000);
const newsCache    = makeCache<FhArticle[]>(30 * 60_000);
const metricsCache = makeCache<Record<string, number | null>>(12 * 60 * 60_000);
const socialCache  = makeCache<FhSocial | null>(15 * 60_000);

// ── Raw Finnhub types ─────────────────────────────────────────────────────────

interface FhQuote {
  c: number; d: number; dp: number;
  h: number; l: number; o: number; pc: number;
}

interface FhArticle {
  headline: string;
  summary:  string;
  datetime: number;
  source:   string;
  url:      string;
}

interface FhSocialBucket {
  mention: number;
  positiveMention: number;
  negativeMention: number;
}

interface FhSocial {
  reddit?:  FhSocialBucket[];
  twitter?: FhSocialBucket[];
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function fhGet<T>(path: string): Promise<T | null> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${FINNHUB_BASE}${path}&token=${apiKey}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ── Individual fetchers ───────────────────────────────────────────────────────

async function fetchQuote(symbol: string): Promise<FhQuote | null> {
  const cached = quoteCache.get(symbol);
  if (cached) return cached;
  const data = await fhGet<FhQuote>(`/quote?symbol=${symbol}`);
  if (data) quoteCache.set(symbol, data);
  return data;
}

async function fetchNews(symbol: string): Promise<FhArticle[]> {
  const cached = newsCache.get(symbol);
  if (cached) return cached;
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const to   = new Date();
  const from = new Date(Date.now() - 3 * 24 * 60 * 60_000);
  const data = await fhGet<FhArticle[]>(
    `/company-news?symbol=${symbol}&from=${fmt(from)}&to=${fmt(to)}`,
  );
  const articles = data ?? [];
  newsCache.set(symbol, articles);
  return articles;
}

async function fetchMetrics(symbol: string): Promise<Record<string, number | null>> {
  const cached = metricsCache.get(symbol);
  if (cached) return cached;
  const raw = await fhGet<{ metric: Record<string, unknown> }>(
    `/stock/metric?symbol=${symbol}&metric=all`,
  );
  const metric: Record<string, number | null> = {};
  if (raw?.metric) {
    for (const [k, v] of Object.entries(raw.metric)) {
      metric[k] = typeof v === "number" ? v : null;
    }
  }
  metricsCache.set(symbol, metric);
  return metric;
}

async function fetchSocial(symbol: string): Promise<FhSocial | null> {
  const cached = socialCache.get(symbol);
  if (cached !== undefined) return cached;
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const to   = new Date();
  const from = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const data = await fhGet<FhSocial>(
    `/stock/social-sentiment?symbol=${symbol}&from=${fmt(from)}&to=${fmt(to)}`,
  );
  socialCache.set(symbol, data);
  return data;
}

// ── Sentiment scorers ─────────────────────────────────────────────────────────

const POS_WORDS = [
  "beat", "beats", "surge", "surges", "rally", "gain", "gains", "rise", "rises",
  "record", "strong", "strength", "growth", "upgrade", "upgrades", "bullish",
  "outperform", "exceeds", "exceeded", "positive", "jumps", "soars", "expands",
  "buy", "upside", "revenue beat", "profit beat",
];

const NEG_WORDS = [
  "miss", "misses", "fall", "falls", "drop", "drops", "decline", "declines",
  "weak", "weakness", "loss", "losses", "downgrade", "downgrades", "bearish",
  "underperform", "below", "negative", "warning", "concern", "risk", "sell",
  "slumps", "tumbles", "slides", "cut", "cuts", "revenue miss", "profit miss",
];

function scoreHeadline(headline: string, summary: string): number {
  const text = `${headline} ${summary ?? ""}`.toLowerCase();
  let score = 0;
  for (const w of POS_WORDS) if (text.includes(w)) score++;
  for (const w of NEG_WORDS) if (text.includes(w)) score--;
  return Math.max(-1, Math.min(1, score / 2));
}

function computeNewsScore(articles: FhArticle[]): {
  score: number;
  count: number;
  summary: "positive" | "neutral" | "negative";
} {
  if (articles.length === 0) return { score: 0, count: 0, summary: "neutral" };
  const recent = articles.slice(0, 10);
  const scores = recent.map((a) => scoreHeadline(a.headline, a.summary ?? ""));
  const avg    = scores.reduce((s, v) => s + v, 0) / scores.length;
  const bounded = Math.max(-1, Math.min(1, avg));
  const summary: "positive" | "neutral" | "negative" =
    bounded >=  0.2 ? "positive" :
    bounded <= -0.2 ? "negative" : "neutral";
  return { score: bounded, count: recent.length, summary };
}

function computeSocialScore(social: FhSocial | null): {
  score: number;
  summary: "bullish" | "neutral" | "bearish";
} {
  if (!social) return { score: 0, summary: "neutral" };
  const src = [...(social.reddit ?? []), ...(social.twitter ?? [])];
  if (src.length === 0) return { score: 0, summary: "neutral" };
  let pos = 0; let neg = 0;
  for (const s of src) {
    pos += s.positiveMention ?? 0;
    neg += s.negativeMention ?? 0;
  }
  const ratio   = (pos - neg) / (pos + neg + 1);
  const bounded = Math.max(-1, Math.min(1, ratio));
  const summary: "bullish" | "neutral" | "bearish" =
    bounded >=  0.15 ? "bullish" :
    bounded <= -0.15 ? "bearish" : "neutral";
  return { score: bounded, summary };
}

function computeFundamentalsScore(metrics: Record<string, number | null>): {
  score:   number;
  peRatio: number | null;
  eps:     number | null;
} {
  const pe  = metrics["peBasicExclExtraTTM"] ?? metrics["peNormalizedAnnual"] ?? null;
  const eps = metrics["epsBasicExclExtraItemsTTM"] ?? null;
  let score = 0;
  if (eps !== null) {
    if (eps > 0) score += 0.25;
    if (eps > 2) score += 0.25;
  }
  if (pe !== null && pe > 0) {
    if (pe < 20)       score += 0.25;
    else if (pe >= 40) score -= 0.25;
  }
  return { score: Math.max(-0.5, Math.min(0.5, score)), peRatio: pe, eps };
}

// ── Public types & export ─────────────────────────────────────────────────────

export interface FinnhubContext {
  dailyChangePct:         number | null;
  peRatio:                number | null;
  eps:                    number | null;
  newsHeadlineCount:      number;
  newsSentimentSummary:   "positive" | "neutral" | "negative";
  socialSentimentSummary: "bullish"  | "neutral" | "bearish";
}

export interface FinnhubEnrichment {
  newsScore:         number;
  socialScore:       number;
  fundamentalsScore: number;
  finnhubContext:    FinnhubContext;
}

export const NULL_ENRICHMENT: FinnhubEnrichment = {
  newsScore:         0,
  socialScore:       0,
  fundamentalsScore: 0,
  finnhubContext: {
    dailyChangePct:         null,
    peRatio:                null,
    eps:                    null,
    newsHeadlineCount:      0,
    newsSentimentSummary:   "neutral",
    socialSentimentSummary: "neutral",
  },
};

// ── Fundamentals snapshot (ticker detail page only) ───────────────────────────

export interface FundamentalsSnapshot {
  marketCap:         number | null; // in millions USD
  peRatio:           number | null;
  eps:               number | null;
  week52High:        number | null;
  week52Low:         number | null;
  beta:              number | null;
  sharesOutstanding: number | null; // in millions
}

export async function fetchFundamentalsSnapshot(symbol: string): Promise<FundamentalsSnapshot | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  try {
    const metrics = await fetchMetrics(symbol);
    const snap: FundamentalsSnapshot = {
      marketCap:         metrics["marketCapitalization"] ?? null,
      peRatio:           metrics["peBasicExclExtraTTM"] ?? metrics["peNormalizedAnnual"] ?? null,
      eps:               metrics["epsBasicExclExtraItemsTTM"] ?? null,
      week52High:        metrics["52WeekHigh"] ?? null,
      week52Low:         metrics["52WeekLow"]  ?? null,
      beta:              metrics["beta"]        ?? null,
      sharesOutstanding: metrics["shareOutstanding"] ?? null,
    };
    // Round each non-null field
    for (const k of Object.keys(snap) as (keyof FundamentalsSnapshot)[]) {
      if (snap[k] !== null) snap[k] = Math.round((snap[k] as number) * 100) / 100;
    }
    const hasAnyData = Object.values(snap).some((v) => v !== null);
    return hasAnyData ? snap : null;
  } catch {
    return null;
  }
}

// ── Detailed news (ticker detail page only) ───────────────────────────────────

export interface NewsArticle {
  headline:    string;
  source:      string;
  publishedAt: string; // ISO string
  url:         string;
}

export async function fetchDetailedNews(symbol: string, limit = 3): Promise<NewsArticle[]> {
  if (!process.env.FINNHUB_API_KEY) return [];
  try {
    const articles = await fetchNews(symbol);
    return articles
      .slice(0, limit)
      .map((a) => ({
        headline:    a.headline,
        source:      a.source ?? "",
        publishedAt: new Date(a.datetime * 1000).toISOString(),
        url:         a.url ?? "",
      }))
      .filter((a) => a.headline && a.url);
  } catch {
    return [];
  }
}

export async function enrichWithFinnhub(symbol: string): Promise<FinnhubEnrichment> {
  if (!process.env.FINNHUB_API_KEY) return NULL_ENRICHMENT;
  try {
    const [quoteRes, articlesRes, metricsRes, socialRes] = await Promise.allSettled([
      fetchQuote(symbol),
      fetchNews(symbol),
      fetchMetrics(symbol),
      fetchSocial(symbol),
    ]);

    const quote    = quoteRes.status    === "fulfilled" ? quoteRes.value    : null;
    const articles = articlesRes.status === "fulfilled" ? articlesRes.value : [];
    const metrics  = metricsRes.status  === "fulfilled" ? metricsRes.value  : {};
    const social   = socialRes.status   === "fulfilled" ? socialRes.value   : null;

    const news = computeNewsScore(articles);
    const soc  = computeSocialScore(social);
    const fund = computeFundamentalsScore(metrics);

    return {
      newsScore:         Math.round(news.score * 10000) / 10000,
      socialScore:       Math.round(soc.score  * 10000) / 10000,
      fundamentalsScore: Math.round(fund.score * 10000) / 10000,
      finnhubContext: {
        dailyChangePct:         quote?.dp != null ? Math.round(quote.dp * 100) / 100 : null,
        peRatio:                fund.peRatio != null ? Math.round(fund.peRatio * 10) / 10 : null,
        eps:                    fund.eps     != null ? Math.round(fund.eps     * 100) / 100 : null,
        newsHeadlineCount:      news.count,
        newsSentimentSummary:   news.summary,
        socialSentimentSummary: soc.summary,
      },
    };
  } catch {
    return NULL_ENRICHMENT;
  }
}
