import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface SearchResult {
  ticker: string;
  company: string;
  matchType: "local" | "dynamic";
}

/** Strip punctuation and collapse spaces — mirrors frontend normalize(). */
function normalize(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/[&.,'''\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Local company-name map used for server-side matching.
 * Keys are already normalized (uppercase, punctuation stripped).
 */
const COMPANY_MAP: Record<string, { ticker: string; displayName: string }> = {
  SOFI: { ticker: "SOFI", displayName: "SoFi Technologies Inc." },
  ROBINHOOD: { ticker: "HOOD", displayName: "Robinhood Markets Inc." },
  SHELL: { ticker: "SHEL", displayName: "Shell plc" },
  APPLE: { ticker: "AAPL", displayName: "Apple Inc." },
  MICROSOFT: { ticker: "MSFT", displayName: "Microsoft Corporation" },
  NVIDIA: { ticker: "NVDA", displayName: "NVIDIA Corporation" },
  AMAZON: { ticker: "AMZN", displayName: "Amazon.com, Inc." },
  ALPHABET: { ticker: "GOOGL", displayName: "Alphabet Inc." },
  GOOGLE: { ticker: "GOOGL", displayName: "Alphabet Inc." },
  META: { ticker: "META", displayName: "Meta Platforms Inc." },
  FACEBOOK: { ticker: "META", displayName: "Meta Platforms Inc." },
  TESLA: { ticker: "TSLA", displayName: "Tesla, Inc." },
  NETFLIX: { ticker: "NFLX", displayName: "Netflix, Inc." },
  SALESFORCE: { ticker: "CRM", displayName: "Salesforce, Inc." },
  ADOBE: { ticker: "ADBE", displayName: "Adobe Inc." },
  ORACLE: { ticker: "ORCL", displayName: "Oracle Corporation" },
  SERVICENOW: { ticker: "NOW", displayName: "ServiceNow, Inc." },
  WORKDAY: { ticker: "WDAY", displayName: "Workday, Inc." },
  SNOWFLAKE: { ticker: "SNOW", displayName: "Snowflake Inc." },
  PALANTIR: { ticker: "PLTR", displayName: "Palantir Technologies Inc." },
  DATADOG: { ticker: "DDOG", displayName: "Datadog, Inc." },
  MONGODB: { ticker: "MDB", displayName: "MongoDB, Inc." },
  TWILIO: { ticker: "TWLO", displayName: "Twilio Inc." },
  ZOOM: { ticker: "ZM", displayName: "Zoom Video Communications" },
  "PALO ALTO": { ticker: "PANW", displayName: "Palo Alto Networks, Inc." },
  "PALO ALTO NETWORKS": { ticker: "PANW", displayName: "Palo Alto Networks, Inc." },
  CROWDSTRIKE: { ticker: "CRWD", displayName: "CrowdStrike Holdings, Inc." },
  INTEL: { ticker: "INTC", displayName: "Intel Corporation" },
  AMD: { ticker: "AMD", displayName: "Advanced Micro Devices, Inc." },
  "ADVANCED MICRO DEVICES": { ticker: "AMD", displayName: "Advanced Micro Devices, Inc." },
  QUALCOMM: { ticker: "QCOM", displayName: "Qualcomm Incorporated" },
  BROADCOM: { ticker: "AVGO", displayName: "Broadcom Inc." },
  "TEXAS INSTRUMENTS": { ticker: "TXN", displayName: "Texas Instruments Incorporated" },
  MICRON: { ticker: "MU", displayName: "Micron Technology, Inc." },
  "APPLIED MATERIALS": { ticker: "AMAT", displayName: "Applied Materials, Inc." },
  "LAM RESEARCH": { ticker: "LRCX", displayName: "Lam Research Corporation" },
  UBER: { ticker: "UBER", displayName: "Uber Technologies, Inc." },
  LYFT: { ticker: "LYFT", displayName: "Lyft, Inc." },
  AIRBNB: { ticker: "ABNB", displayName: "Airbnb, Inc." },
  DOORDASH: { ticker: "DASH", displayName: "DoorDash, Inc." },
  COINBASE: { ticker: "COIN", displayName: "Coinbase Global, Inc." },
  PAYPAL: { ticker: "PYPL", displayName: "PayPal Holdings, Inc." },
  SHOPIFY: { ticker: "SHOP", displayName: "Shopify Inc." },
  SPOTIFY: { ticker: "SPOT", displayName: "Spotify Technology S.A." },
  BLOCK: { ticker: "XYZ", displayName: "Block, Inc." },
  SQUARE: { ticker: "XYZ", displayName: "Block, Inc." },
  PINTEREST: { ticker: "PINS", displayName: "Pinterest, Inc." },
  SNAP: { ticker: "SNAP", displayName: "Snap Inc." },
  ROBLOX: { ticker: "RBLX", displayName: "Roblox Corporation" },
  JPMORGAN: { ticker: "JPM", displayName: "JPMorgan Chase & Co." },
  "JP MORGAN": { ticker: "JPM", displayName: "JPMorgan Chase & Co." },
  "JPMORGAN CHASE": { ticker: "JPM", displayName: "JPMorgan Chase & Co." },
  BERKSHIRE: { ticker: "BRK.B", displayName: "Berkshire Hathaway Inc." },
  "BERKSHIRE HATHAWAY": { ticker: "BRK.B", displayName: "Berkshire Hathaway Inc." },
  "BANK OF AMERICA": { ticker: "BAC", displayName: "Bank of America Corporation" },
  "WELLS FARGO": { ticker: "WFC", displayName: "Wells Fargo & Company" },
  "GOLDMAN SACHS": { ticker: "GS", displayName: "The Goldman Sachs Group, Inc." },
  GOLDMAN: { ticker: "GS", displayName: "The Goldman Sachs Group, Inc." },
  "MORGAN STANLEY": { ticker: "MS", displayName: "Morgan Stanley" },
  CITIGROUP: { ticker: "C", displayName: "Citigroup Inc." },
  CITI: { ticker: "C", displayName: "Citigroup Inc." },
  "AMERICAN EXPRESS": { ticker: "AXP", displayName: "American Express Company" },
  AMEX: { ticker: "AXP", displayName: "American Express Company" },
  VISA: { ticker: "V", displayName: "Visa Inc." },
  MASTERCARD: { ticker: "MA", displayName: "Mastercard Incorporated" },
  BLACKROCK: { ticker: "BLK", displayName: "BlackRock, Inc." },
  "CHARLES SCHWAB": { ticker: "SCHW", displayName: "The Charles Schwab Corporation" },
  SCHWAB: { ticker: "SCHW", displayName: "The Charles Schwab Corporation" },
  "JOHNSON JOHNSON": { ticker: "JNJ", displayName: "Johnson & Johnson" },
  "JOHNSON AND JOHNSON": { ticker: "JNJ", displayName: "Johnson & Johnson" },
  UNITEDHEALTH: { ticker: "UNH", displayName: "UnitedHealth Group Incorporated" },
  "UNITED HEALTH": { ticker: "UNH", displayName: "UnitedHealth Group Incorporated" },
  PFIZER: { ticker: "PFE", displayName: "Pfizer Inc." },
  "ELI LILLY": { ticker: "LLY", displayName: "Eli Lilly and Company" },
  LILLY: { ticker: "LLY", displayName: "Eli Lilly and Company" },
  ABBVIE: { ticker: "ABBV", displayName: "AbbVie Inc." },
  MERCK: { ticker: "MRK", displayName: "Merck & Co., Inc." },
  "BRISTOL MYERS SQUIBB": { ticker: "BMY", displayName: "Bristol-Myers Squibb Company" },
  "BRISTOL MYERS": { ticker: "BMY", displayName: "Bristol-Myers Squibb Company" },
  ABBOTT: { ticker: "ABT", displayName: "Abbott Laboratories" },
  "THERMO FISHER": { ticker: "TMO", displayName: "Thermo Fisher Scientific Inc." },
  MODERNA: { ticker: "MRNA", displayName: "Moderna, Inc." },
  GILEAD: { ticker: "GILD", displayName: "Gilead Sciences, Inc." },
  AMGEN: { ticker: "AMGN", displayName: "Amgen Inc." },
  REGENERON: { ticker: "REGN", displayName: "Regeneron Pharmaceuticals, Inc." },
  "INTUITIVE SURGICAL": { ticker: "ISRG", displayName: "Intuitive Surgical, Inc." },
  INTUITIVE: { ticker: "ISRG", displayName: "Intuitive Surgical, Inc." },
  WALMART: { ticker: "WMT", displayName: "Walmart Inc." },
  "HOME DEPOT": { ticker: "HD", displayName: "The Home Depot, Inc." },
  COSTCO: { ticker: "COST", displayName: "Costco Wholesale Corporation" },
  "COCA COLA": { ticker: "KO", displayName: "The Coca-Cola Company" },
  COKE: { ticker: "KO", displayName: "The Coca-Cola Company" },
  PEPSI: { ticker: "PEP", displayName: "PepsiCo, Inc." },
  PEPSICO: { ticker: "PEP", displayName: "PepsiCo, Inc." },
  MCDONALDS: { ticker: "MCD", displayName: "McDonald's Corporation" },
  "MCDONALD S": { ticker: "MCD", displayName: "McDonald's Corporation" },
  STARBUCKS: { ticker: "SBUX", displayName: "Starbucks Corporation" },
  NIKE: { ticker: "NKE", displayName: "NIKE, Inc." },
  "PROCTER GAMBLE": { ticker: "PG", displayName: "Procter & Gamble Co." },
  COLGATE: { ticker: "CL", displayName: "Colgate-Palmolive Company" },
  TARGET: { ticker: "TGT", displayName: "Target Corporation" },
  LOWES: { ticker: "LOW", displayName: "Lowe's Companies, Inc." },
  EXXON: { ticker: "XOM", displayName: "Exxon Mobil Corporation" },
  "EXXON MOBIL": { ticker: "XOM", displayName: "Exxon Mobil Corporation" },
  CHEVRON: { ticker: "CVX", displayName: "Chevron Corporation" },
  CONOCOPHILLIPS: { ticker: "COP", displayName: "ConocoPhillips" },
  BOEING: { ticker: "BA", displayName: "The Boeing Company" },
  "LOCKHEED MARTIN": { ticker: "LMT", displayName: "Lockheed Martin Corporation" },
  LOCKHEED: { ticker: "LMT", displayName: "Lockheed Martin Corporation" },
  "GENERAL ELECTRIC": { ticker: "GE", displayName: "GE Aerospace" },
  CATERPILLAR: { ticker: "CAT", displayName: "Caterpillar Inc." },
  DEERE: { ticker: "DE", displayName: "Deere & Company" },
  "JOHN DEERE": { ticker: "DE", displayName: "Deere & Company" },
  HONEYWELL: { ticker: "HON", displayName: "Honeywell International Inc." },
  RAYTHEON: { ticker: "RTX", displayName: "RTX Corporation" },
  "NORTHROP GRUMMAN": { ticker: "NOC", displayName: "Northrop Grumman Corporation" },
  "GENERAL DYNAMICS": { ticker: "GD", displayName: "General Dynamics Corporation" },
  "UNION PACIFIC": { ticker: "UNP", displayName: "Union Pacific Corporation" },
  UPS: { ticker: "UPS", displayName: "United Parcel Service, Inc." },
  FEDEX: { ticker: "FDX", displayName: "FedEx Corporation" },
  DISNEY: { ticker: "DIS", displayName: "The Walt Disney Company" },
  COMCAST: { ticker: "CMCSA", displayName: "Comcast Corporation" },
  "AT T": { ticker: "T", displayName: "AT&T Inc." },
  ATT: { ticker: "T", displayName: "AT&T Inc." },
  VERIZON: { ticker: "VZ", displayName: "Verizon Communications Inc." },
  "T MOBILE": { ticker: "TMUS", displayName: "T-Mobile US, Inc." },
  TMOBILE: { ticker: "TMUS", displayName: "T-Mobile US, Inc." },
};

function localSearch(query: string): SearchResult[] {
  const key = normalize(query);
  const seen = new Set<string>();
  const results: Array<{ result: SearchResult; score: number }> = [];

  for (const [mapKey, value] of Object.entries(COMPANY_MAP)) {
    if (seen.has(value.ticker)) continue;

    let score = 0;
    if (mapKey === key) score = 10;
    else if (mapKey.startsWith(key) && key.length >= 2) score = 5;
    else if (mapKey.includes(key) && key.length >= 3) score = 2;

    if (score > 0) {
      results.push({ result: { ticker: value.ticker, company: value.displayName, matchType: "local" }, score });
      seen.add(value.ticker);
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .map((r) => r.result)
    .slice(0, 3);
}

async function yahooSearch(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0&enableFuzzyQuery=false&enableCb=false`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "Yahoo Finance search returned non-OK");
      return [];
    }

    const data = (await res.json()) as {
      quotes?: Array<{
        symbol?: string;
        shortname?: string;
        longname?: string;
        quoteType?: string;
        exchange?: string;
      }>;
    };

    const US_EXCHANGES = new Set([
      "NMS", "NGM", "NCM", "NYSE", "NYQ", "PCX", "ASE", "BATS", "CBT",
      "NasdaqGS", "NasdaqGM", "NasdaqCM", "Nasdaq",
    ]);

    return (data.quotes ?? [])
      .filter((q) => {
        if (q.quoteType !== "EQUITY" || !q.symbol) return false;
        // Accept only tickers that look like US symbols (letters + optional dot-letter)
        if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(q.symbol)) return false;
        // Prefer US exchange when exchange info is available
        if (q.exchange && !US_EXCHANGES.has(q.exchange)) return false;
        return true;
      })
      .slice(0, 3)
      .map((q) => ({
        ticker: q.symbol!,
        company: q.longname ?? q.shortname ?? q.symbol!,
        matchType: "dynamic" as const,
      }));
  } catch (err) {
    logger.warn({ err }, "Yahoo Finance search failed");
    return [];
  }
}

// GET /search?q=<query>
router.get("/search", async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ error: "Missing query parameter q" });
    return;
  }

  // Try local map first
  const local = localSearch(q);
  if (local.length > 0) {
    res.json({ results: local });
    return;
  }

  // Fall back to Yahoo Finance
  const dynamic = await yahooSearch(q);
  if (dynamic.length === 0) {
    res.json({ results: [] });
    return;
  }

  res.json({ results: dynamic });
});

export default router;
