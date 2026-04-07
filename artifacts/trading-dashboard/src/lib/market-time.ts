const NY_TZ = "America/New_York";

/** Format a Date as HH:MM:SS in the given IANA timezone. */
export function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/** Return the short timezone abbreviation, e.g. "SGT", "EDT", "IST". */
export function tzAbbr(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** User's local IANA timezone from the browser. */
export function localTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Returns true if the NYSE/NASDAQ are currently open.
 * Regular session: Mon–Fri 09:30–16:00 ET.
 * Does NOT account for market holidays.
 */
export function isMarketOpen(date: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour    = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute  = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

  const isWeekday   = !["Sat", "Sun"].includes(weekday);
  const afterOpen   = hour > 9 || (hour === 9 && minute >= 30);
  const beforeClose = hour < 16;

  return isWeekday && afterOpen && beforeClose;
}

export { NY_TZ };
