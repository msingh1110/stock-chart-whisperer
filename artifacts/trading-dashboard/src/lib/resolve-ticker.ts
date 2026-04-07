/**
 * Natural language → ticker symbol resolver.
 *
 * Resolution flow:
 *   1. Exact ticker format match (all caps, 1-10 chars) – used as-is
 *   2. Exact key match in company map (after punctuation normalization)
 *   3. Partial / starts-with match in company map (best score wins)
 *   4. Caller should invoke /api/search for dynamic lookup
 */

export type MatchType = "ticker" | "exact" | "partial";

export interface ResolveResult {
  ticker: string;
  wasMapped: boolean;
  displayName: string;
  matchType: MatchType;
}

/** Strip punctuation and collapse spaces for fuzzy key comparison. */
function normalize(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/[&.,'''\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comprehensive company name → ticker map.
 * Keys are already normalized (uppercase, punctuation stripped).
 */
const COMPANY_MAP: Record<string, { ticker: string; displayName: string }> = {
  // ── Default portfolio ──────────────────────────────────────────────
  SOFI:      { ticker: "SOFI", displayName: "SoFi Technologies Inc." },
  ROBINHOOD: { ticker: "HOOD", displayName: "Robinhood Markets Inc." },
  SHELL:     { ticker: "SHEL", displayName: "Shell plc" },

  // ── Mega-cap tech ──────────────────────────────────────────────────
  APPLE:             { ticker: "AAPL", displayName: "Apple Inc." },
  MICROSOFT:         { ticker: "MSFT", displayName: "Microsoft Corporation" },
  NVIDIA:            { ticker: "NVDA", displayName: "NVIDIA Corporation" },
  AMAZON:            { ticker: "AMZN", displayName: "Amazon.com, Inc." },
  ALPHABET:          { ticker: "GOOGL", displayName: "Alphabet Inc." },
  GOOGLE:            { ticker: "GOOGL", displayName: "Alphabet Inc." },
  META:              { ticker: "META", displayName: "Meta Platforms Inc." },
  FACEBOOK:          { ticker: "META", displayName: "Meta Platforms Inc." },
  TESLA:             { ticker: "TSLA", displayName: "Tesla, Inc." },
  NETFLIX:           { ticker: "NFLX", displayName: "Netflix, Inc." },

  // ── Software & Cloud ───────────────────────────────────────────────
  SALESFORCE:         { ticker: "CRM",  displayName: "Salesforce, Inc." },
  ADOBE:              { ticker: "ADBE", displayName: "Adobe Inc." },
  ORACLE:             { ticker: "ORCL", displayName: "Oracle Corporation" },
  "SERVICENOW":       { ticker: "NOW",  displayName: "ServiceNow, Inc." },
  WORKDAY:            { ticker: "WDAY", displayName: "Workday, Inc." },
  SNOWFLAKE:          { ticker: "SNOW", displayName: "Snowflake Inc." },
  PALANTIR:           { ticker: "PLTR", displayName: "Palantir Technologies Inc." },
  DATADOG:            { ticker: "DDOG", displayName: "Datadog, Inc." },
  MONGODB:            { ticker: "MDB",  displayName: "MongoDB, Inc." },
  TWILIO:             { ticker: "TWLO", displayName: "Twilio Inc." },
  ZOOM:               { ticker: "ZM",   displayName: "Zoom Video Communications" },
  "PALO ALTO":        { ticker: "PANW", displayName: "Palo Alto Networks, Inc." },
  "PALO ALTO NETWORKS": { ticker: "PANW", displayName: "Palo Alto Networks, Inc." },
  CROWDSTRIKE:        { ticker: "CRWD", displayName: "CrowdStrike Holdings, Inc." },

  // ── Semiconductors ─────────────────────────────────────────────────
  INTEL:                    { ticker: "INTC", displayName: "Intel Corporation" },
  AMD:                      { ticker: "AMD",  displayName: "Advanced Micro Devices, Inc." },
  "ADVANCED MICRO DEVICES": { ticker: "AMD",  displayName: "Advanced Micro Devices, Inc." },
  QUALCOMM:                 { ticker: "QCOM", displayName: "Qualcomm Incorporated" },
  BROADCOM:                 { ticker: "AVGO", displayName: "Broadcom Inc." },
  "TEXAS INSTRUMENTS":      { ticker: "TXN",  displayName: "Texas Instruments Incorporated" },
  MICRON:                   { ticker: "MU",   displayName: "Micron Technology, Inc." },
  "APPLIED MATERIALS":      { ticker: "AMAT", displayName: "Applied Materials, Inc." },
  "LAM RESEARCH":           { ticker: "LRCX", displayName: "Lam Research Corporation" },
  "ANALOG DEVICES":         { ticker: "ADI",  displayName: "Analog Devices, Inc." },

  // ── Consumer Internet & Platforms ──────────────────────────────────
  UBER:     { ticker: "UBER", displayName: "Uber Technologies, Inc." },
  LYFT:     { ticker: "LYFT", displayName: "Lyft, Inc." },
  AIRBNB:   { ticker: "ABNB", displayName: "Airbnb, Inc." },
  DOORDASH: { ticker: "DASH", displayName: "DoorDash, Inc." },
  COINBASE: { ticker: "COIN", displayName: "Coinbase Global, Inc." },
  PAYPAL:   { ticker: "PYPL", displayName: "PayPal Holdings, Inc." },
  SHOPIFY:  { ticker: "SHOP", displayName: "Shopify Inc." },
  SPOTIFY:  { ticker: "SPOT", displayName: "Spotify Technology S.A." },
  TWITTER:  { ticker: "X",    displayName: "X Corp." },
  BLOCK:    { ticker: "XYZ",  displayName: "Block, Inc." },
  SQUARE:   { ticker: "XYZ",  displayName: "Block, Inc." },
  PINTEREST: { ticker: "PINS", displayName: "Pinterest, Inc." },
  SNAP:     { ticker: "SNAP", displayName: "Snap Inc." },
  ROBLOX:   { ticker: "RBLX", displayName: "Roblox Corporation" },

  // ── Finance ────────────────────────────────────────────────────────
  JPMORGAN:            { ticker: "JPM", displayName: "JPMorgan Chase & Co." },
  "JP MORGAN":         { ticker: "JPM", displayName: "JPMorgan Chase & Co." },
  "JPMORGAN CHASE":    { ticker: "JPM", displayName: "JPMorgan Chase & Co." },
  BERKSHIRE:           { ticker: "BRK.B", displayName: "Berkshire Hathaway Inc." },
  "BERKSHIRE HATHAWAY": { ticker: "BRK.B", displayName: "Berkshire Hathaway Inc." },
  "BANK OF AMERICA":   { ticker: "BAC", displayName: "Bank of America Corporation" },
  "WELLS FARGO":       { ticker: "WFC", displayName: "Wells Fargo & Company" },
  "GOLDMAN SACHS":     { ticker: "GS",  displayName: "The Goldman Sachs Group, Inc." },
  GOLDMAN:             { ticker: "GS",  displayName: "The Goldman Sachs Group, Inc." },
  "MORGAN STANLEY":    { ticker: "MS",  displayName: "Morgan Stanley" },
  CITIGROUP:           { ticker: "C",   displayName: "Citigroup Inc." },
  CITI:                { ticker: "C",   displayName: "Citigroup Inc." },
  "AMERICAN EXPRESS":  { ticker: "AXP", displayName: "American Express Company" },
  AMEX:                { ticker: "AXP", displayName: "American Express Company" },
  VISA:                { ticker: "V",   displayName: "Visa Inc." },
  MASTERCARD:          { ticker: "MA",  displayName: "Mastercard Incorporated" },
  BLACKROCK:           { ticker: "BLK", displayName: "BlackRock, Inc." },
  "CHARLES SCHWAB":    { ticker: "SCHW", displayName: "The Charles Schwab Corporation" },
  SCHWAB:              { ticker: "SCHW", displayName: "The Charles Schwab Corporation" },

  // ── Healthcare & Pharma ────────────────────────────────────────────
  "JOHNSON JOHNSON":         { ticker: "JNJ",  displayName: "Johnson & Johnson" },
  "JOHNSON AND JOHNSON":     { ticker: "JNJ",  displayName: "Johnson & Johnson" },
  UNITEDHEALTH:              { ticker: "UNH",  displayName: "UnitedHealth Group Incorporated" },
  "UNITED HEALTH":           { ticker: "UNH",  displayName: "UnitedHealth Group Incorporated" },
  PFIZER:                    { ticker: "PFE",  displayName: "Pfizer Inc." },
  "ELI LILLY":               { ticker: "LLY",  displayName: "Eli Lilly and Company" },
  LILLY:                     { ticker: "LLY",  displayName: "Eli Lilly and Company" },
  ABBVIE:                    { ticker: "ABBV", displayName: "AbbVie Inc." },
  MERCK:                     { ticker: "MRK",  displayName: "Merck & Co., Inc." },
  "BRISTOL MYERS SQUIBB":    { ticker: "BMY",  displayName: "Bristol-Myers Squibb Company" },
  "BRISTOL MYERS":           { ticker: "BMY",  displayName: "Bristol-Myers Squibb Company" },
  ABBOTT:                    { ticker: "ABT",  displayName: "Abbott Laboratories" },
  "THERMO FISHER":           { ticker: "TMO",  displayName: "Thermo Fisher Scientific Inc." },
  MODERNA:                   { ticker: "MRNA", displayName: "Moderna, Inc." },
  GILEAD:                    { ticker: "GILD", displayName: "Gilead Sciences, Inc." },
  AMGEN:                     { ticker: "AMGN", displayName: "Amgen Inc." },
  REGENERON:                 { ticker: "REGN", displayName: "Regeneron Pharmaceuticals, Inc." },
  INTUITIVE:                 { ticker: "ISRG", displayName: "Intuitive Surgical, Inc." },
  "INTUITIVE SURGICAL":      { ticker: "ISRG", displayName: "Intuitive Surgical, Inc." },

  // ── Consumer & Retail ──────────────────────────────────────────────
  WALMART:         { ticker: "WMT",  displayName: "Walmart Inc." },
  "HOME DEPOT":    { ticker: "HD",   displayName: "The Home Depot, Inc." },
  COSTCO:          { ticker: "COST", displayName: "Costco Wholesale Corporation" },
  "COCA COLA":     { ticker: "KO",   displayName: "The Coca-Cola Company" },
  COKE:            { ticker: "KO",   displayName: "The Coca-Cola Company" },
  PEPSI:           { ticker: "PEP",  displayName: "PepsiCo, Inc." },
  PEPSICO:         { ticker: "PEP",  displayName: "PepsiCo, Inc." },
  MCDONALDS:       { ticker: "MCD",  displayName: "McDonald's Corporation" },
  "MCDONALD S":    { ticker: "MCD",  displayName: "McDonald's Corporation" },
  STARBUCKS:       { ticker: "SBUX", displayName: "Starbucks Corporation" },
  NIKE:            { ticker: "NKE",  displayName: "NIKE, Inc." },
  "PROCTER GAMBLE":{ ticker: "PG",   displayName: "Procter & Gamble Co." },
  "P G":           { ticker: "PG",   displayName: "Procter & Gamble Co." },
  COLGATE:         { ticker: "CL",   displayName: "Colgate-Palmolive Company" },
  TARGET:          { ticker: "TGT",  displayName: "Target Corporation" },
  LOWES:           { ticker: "LOW",  displayName: "Lowe's Companies, Inc." },

  // ── Energy ─────────────────────────────────────────────────────────
  EXXON:         { ticker: "XOM", displayName: "Exxon Mobil Corporation" },
  "EXXON MOBIL": { ticker: "XOM", displayName: "Exxon Mobil Corporation" },
  CHEVRON:       { ticker: "CVX", displayName: "Chevron Corporation" },
  CONOCOPHILLIPS:{ ticker: "COP", displayName: "ConocoPhillips" },

  // ── Industrials & Defense ──────────────────────────────────────────
  BOEING:                { ticker: "BA",  displayName: "The Boeing Company" },
  "LOCKHEED MARTIN":     { ticker: "LMT", displayName: "Lockheed Martin Corporation" },
  LOCKHEED:              { ticker: "LMT", displayName: "Lockheed Martin Corporation" },
  "GENERAL ELECTRIC":    { ticker: "GE",  displayName: "GE Aerospace" },
  CATERPILLAR:           { ticker: "CAT", displayName: "Caterpillar Inc." },
  DEERE:                 { ticker: "DE",  displayName: "Deere & Company" },
  "JOHN DEERE":          { ticker: "DE",  displayName: "Deere & Company" },
  HONEYWELL:             { ticker: "HON", displayName: "Honeywell International Inc." },
  "3M":                  { ticker: "MMM", displayName: "3M Company" },
  RAYTHEON:              { ticker: "RTX", displayName: "RTX Corporation" },
  "NORTHROP GRUMMAN":    { ticker: "NOC", displayName: "Northrop Grumman Corporation" },
  "GENERAL DYNAMICS":    { ticker: "GD",  displayName: "General Dynamics Corporation" },
  "UNION PACIFIC":       { ticker: "UNP", displayName: "Union Pacific Corporation" },
  UPS:                   { ticker: "UPS", displayName: "United Parcel Service, Inc." },
  "UNITED PARCEL":       { ticker: "UPS", displayName: "United Parcel Service, Inc." },
  FEDEX:                 { ticker: "FDX", displayName: "FedEx Corporation" },

  // ── Communication & Media ──────────────────────────────────────────
  DISNEY:     { ticker: "DIS",  displayName: "The Walt Disney Company" },
  COMCAST:    { ticker: "CMCSA",displayName: "Comcast Corporation" },
  "AT T":     { ticker: "T",    displayName: "AT&T Inc." },
  ATT:        { ticker: "T",    displayName: "AT&T Inc." },
  VERIZON:    { ticker: "VZ",   displayName: "Verizon Communications Inc." },
  "T MOBILE": { ticker: "TMUS", displayName: "T-Mobile US, Inc." },
  TMOBILE:    { ticker: "TMUS", displayName: "T-Mobile US, Inc." },

  // ── Real Estate & Utilities ────────────────────────────────────────
  "AMERICAN TOWER": { ticker: "AMT", displayName: "American Tower Corporation" },
};

/** Regex for a valid ticker symbol: 1–10 uppercase letters or dots (BRK.B) */
const TICKER_RE = /^[A-Z.]{1,10}$/;

export function resolveTicker(raw: string): ResolveResult | null {
  const upper = raw.trim().toUpperCase();
  if (!upper) return null;

  const key = normalize(raw);

  // 1. Exact match in the company map
  const exact = COMPANY_MAP[key];
  if (exact) {
    const wasMapped = key !== exact.ticker;
    return { ticker: exact.ticker, wasMapped, displayName: exact.displayName, matchType: "exact" };
  }

  // 2. Partial match — prefer starts-with (score 2) over contains (score 1)
  let best: { ticker: string; displayName: string } | null = null;
  let bestScore = 0;

  for (const [mapKey, value] of Object.entries(COMPANY_MAP)) {
    let score = 0;
    if (mapKey.startsWith(key) && key.length >= 3) score = 2;
    else if (mapKey.includes(key) && key.length >= 3) score = 1;

    if (score > bestScore) {
      bestScore = score;
      best = value;
    }
  }

  if (best) {
    return { ticker: best.ticker, wasMapped: true, displayName: best.displayName, matchType: "partial" };
  }

  // 3. Looks like a valid ticker symbol → pass through directly
  if (TICKER_RE.test(upper)) {
    return { ticker: upper, wasMapped: false, displayName: "", matchType: "ticker" };
  }

  // 4. Could not resolve locally — caller should try /api/search
  return null;
}

/** Result shape returned by the /api/search endpoint. */
export interface SearchSuggestion {
  ticker: string;
  company: string;
  matchType: "local" | "dynamic";
}
