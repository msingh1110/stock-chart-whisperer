import React from "react";
import { Link } from "wouter";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ConfidenceBadge } from "./signal-badge";
import { cn } from "@/lib/utils";
import type { StockSignal } from "@workspace/api-client-react/src/generated/api.schemas";

export function getSignalNoteFromValues(
  currentPrice: number,
  ma20: number,
  ma50: number,
  rsi: number,
  changePercent: number,
): string {
  const aboveMa20 = currentPrice > ma20;
  const uptrend = ma20 > ma50;

  const positionClause = aboveMa20
    ? "Trading above the 20-day average"
    : "Trading below the 20-day average";
  const trendClause = uptrend
    ? "within a short-term uptrend"
    : "within a broader downtrend";
  const sentence1 = `${positionClause} ${trendClause}.`;

  let momentumPhrase: string;
  if (rsi >= 70) {
    momentumPhrase = `Momentum is overextended — RSI at ${rsi.toFixed(0)} signals overbought conditions.`;
  } else if (rsi >= 50 && rsi <= 65) {
    momentumPhrase = `Momentum is constructive with RSI at ${rsi.toFixed(0)}, supporting further upside.`;
  } else if (rsi < 30) {
    momentumPhrase = `RSI at ${rsi.toFixed(0)} is deeply oversold, suggesting potential for a near-term bounce.`;
  } else if (rsi < 45) {
    momentumPhrase = `Momentum is deteriorating — RSI at ${rsi.toFixed(0)} reflects selling pressure.`;
  } else {
    momentumPhrase = `Momentum is neutral with RSI at ${rsi.toFixed(0)}, awaiting a directional catalyst.`;
  }

  let intradayNote = "";
  if (changePercent <= -2) {
    intradayNote = ` Notably, the stock is down ${Math.abs(changePercent).toFixed(1)}% on an elevated intraday decline.`;
  } else if (changePercent >= 2) {
    intradayNote = ` The stock is up ${changePercent.toFixed(1)}% today, indicating strong intraday demand.`;
  }

  return `${sentence1} ${momentumPhrase}${intradayNote}`;
}

export function ProbabilityBar({ upProbability, downProbability, large = false }: { upProbability: number; downProbability: number; large?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className={cn("font-mono uppercase tracking-wider text-muted-foreground", large ? "text-xs" : "text-[10px]")}>
          Up / Down Probability
        </span>
        <div className={cn("flex items-center gap-2 font-mono font-semibold", large ? "text-sm" : "text-[10px]")}>
          <span className="text-green-400">{upProbability}%</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-red-400">{downProbability}%</span>
        </div>
      </div>
      <div className={cn("w-full rounded-full overflow-hidden bg-muted/50 flex", large ? "h-2.5" : "h-1.5")}>
        <div
          className="h-full bg-green-500 transition-all duration-500"
          style={{ width: `${upProbability}%` }}
        />
        <div
          className="h-full bg-red-500 transition-all duration-500"
          style={{ width: `${downProbability}%` }}
        />
      </div>
    </div>
  );
}

export function StockCard({ signal }: { signal: StockSignal }) {
  const isPositive = signal.change >= 0;
  const ChangeIcon = isPositive ? ArrowUpRight : ArrowDownRight;
  const note = signal.explanation;

  return (
    <Link href={`/stock/${signal.ticker}`}>
      <Card
        className="group h-full cursor-pointer overflow-hidden border-border/50 bg-card/50 transition-all hover:bg-card hover:border-border hover:shadow-sm"
        data-testid={`card-stock-${signal.ticker}`}
      >
        <CardContent className="p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-mono text-xl font-bold tracking-tight">{signal.ticker}</h3>
              {signal.company && (
                <p className="text-[10px] font-mono text-muted-foreground/60 tracking-wide leading-tight mt-0.5">
                  {signal.company}
                </p>
              )}
            </div>
            <ConfidenceBadge tier={signal.confidenceTier} />
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold tracking-tight">
                ${signal.currentPrice.toFixed(2)}
              </span>
              <span
                className={cn(
                  "flex items-center font-mono text-sm font-medium",
                  isPositive ? "text-green-500" : "text-red-500"
                )}
                data-testid={`text-change-${signal.ticker}`}
              >
                <ChangeIcon className="h-3 w-3 mr-0.5" />
                {Math.abs(signal.changePercent).toFixed(2)}%
              </span>
            </div>
            <div className="text-xs font-mono text-muted-foreground">
              {isPositive ? "+" : "-"}${Math.abs(signal.change).toFixed(2)} today
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/50">
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">MA20</span>
              <span className="font-mono text-xs font-medium">${signal.ma20.toFixed(2)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">MA50</span>
              <span className="font-mono text-xs font-medium">${signal.ma50.toFixed(2)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">RSI</span>
              <span className={cn(
                "font-mono text-xs font-medium",
                signal.rsi > 70 ? "text-red-400" : signal.rsi < 30 ? "text-green-400" : "text-foreground"
              )}
                data-testid={`text-rsi-${signal.ticker}`}
              >
                {signal.rsi.toFixed(1)}
              </span>
            </div>
          </div>

          <div className="pt-1 border-t border-border/50 flex flex-col gap-2">
            <ProbabilityBar
              upProbability={signal.upProbability}
              downProbability={signal.downProbability}
            />
            <p
              className="text-[10px] font-mono text-muted-foreground/70 leading-relaxed"
              data-testid={`text-note-${signal.ticker}`}
            >
              {note}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function StockCardSkeleton() {
  return (
    <Card className="h-full border-border/50 bg-card/30">
      <CardContent className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-16 bg-muted rounded animate-pulse" />
          <div className="h-6 w-14 bg-muted rounded animate-pulse" />
        </div>
        <div className="space-y-2 pt-2">
          <div className="h-8 w-28 bg-muted rounded animate-pulse" />
          <div className="h-4 w-20 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-3 gap-2 pt-4 mt-2 border-t border-border/50">
          <div className="h-8 w-full bg-muted rounded animate-pulse" />
          <div className="h-8 w-full bg-muted rounded animate-pulse" />
          <div className="h-8 w-full bg-muted rounded animate-pulse" />
        </div>
        <div className="pt-3 mt-1 border-t border-border/50">
          <div className="h-5 w-full bg-muted rounded animate-pulse" />
          <div className="h-2 w-full bg-muted rounded animate-pulse mt-2" />
        </div>
      </CardContent>
    </Card>
  );
}
