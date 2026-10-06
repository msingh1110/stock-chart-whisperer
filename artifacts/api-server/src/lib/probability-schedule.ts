import type { DailyBar } from "./alpaca";

export function completedBars(bars: DailyBar[], now: Date): DailyBar[] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find(p => p.type === type)!.value;
  const today = `${value("year")}-${value("month")}-${value("day")}`;
  const closed = Number(value("hour")) >= 17;
  return bars.filter(b => b.date < today || (b.date === today && closed)).sort((a, b) => a.date.localeCompare(b.date));
}

export function captureDue(now: Date, lastCaptureDate: string | null): string | null {
  const day = now.getUTCDay();
  const date = now.toISOString().slice(0, 10);
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return day >= 1 && day <= 5 && minutes >= 22 * 60 + 15 && lastCaptureDate !== date ? date : null;
}

export function evaluationWeek(now: Date): string {
  const due = new Date(now);
  due.setUTCHours(0, 30, 0, 0);
  due.setUTCDate(due.getUTCDate() - ((due.getUTCDay() + 1) % 7));
  if (due > now) due.setUTCDate(due.getUTCDate() - 7);
  return due.toISOString().slice(0, 10);
}

export function nextCapture(now: Date): string {
  const due = new Date(now);
  due.setUTCHours(22, 15, 0, 0);
  if (due <= now) due.setUTCDate(due.getUTCDate() + 1);
  while (due.getUTCDay() === 0 || due.getUTCDay() === 6) due.setUTCDate(due.getUTCDate() + 1);
  return due.toISOString();
}

export function nextEvaluation(now: Date): string {
  const due = new Date(`${evaluationWeek(now)}T00:30:00.000Z`);
  due.setUTCDate(due.getUTCDate() + 7);
  return due.toISOString();
}

export function fiveSessionOutcome(asOfDate: string, bars: DailyBar[], sessionDates = bars.map(b => b.date)) {
  const reference = bars.find(b => b.date === asOfDate);
  const futureDates = [...new Set(sessionDates)].filter(d => d > asOfDate).sort();
  if (!reference || futureDates.length < 5 || reference.close <= 0) return null;
  const end = bars.find(b => b.date === futureDates[4]);
  if (!end) return null;
  return {
    outcomeDate: end.date, outcomeClose: end.close,
    outcome: Number(end.close > reference.close),
    returnPercent: (end.close / reference.close - 1) * 100,
  };
}
