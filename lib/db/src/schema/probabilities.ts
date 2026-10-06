import { pgTable, serial, integer, text, boolean, jsonb, timestamp, date, doublePrecision, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const probabilityModels = pgTable("probability_models", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  active: boolean("active").notNull().default(false),
  reason: text("reason").notNull(),
  parameters: jsonb("parameters").notNull(),
}, t => [uniqueIndex("probability_one_active_model").on(t.active).where(sql`${t.active} = true`)]);

export const probabilityPredictions = pgTable("probability_predictions", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),
  asOfDate: date("as_of_date").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  modelId: integer("model_id").notNull().references(() => probabilityModels.id),
  probability: doublePrecision("probability").notNull(),
  referenceClose: doublePrecision("reference_close").notNull(),
  features: jsonb("features").notNull(),
  context: jsonb("context").notNull(),
  outcomeDate: date("outcome_date"),
  outcomeClose: doublePrecision("outcome_close"),
  outcome: integer("outcome"),
  returnPercent: doublePrecision("return_percent"),
}, t => [
  uniqueIndex("probability_daily_prediction").on(t.ticker, t.asOfDate),
  index("probability_pending_predictions").on(t.outcomeDate),
]);

export const probabilityReports = pgTable("probability_reports", {
  id: serial("id").primaryKey(),
  week: date("week").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  result: jsonb("result").notNull(),
});

export const probabilityService = pgTable("probability_service", {
  id: integer("id").primaryKey(),
  lastCaptureDate: date("last_capture_date"),
  lastCapturedAt: timestamp("last_captured_at", { withTimezone: true }),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
  lastError: text("last_error"),
});
