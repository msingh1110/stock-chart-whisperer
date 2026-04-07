import React from "react";
import { Link } from "wouter";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SignalBadge } from "./signal-badge";
import { cn } from "@/lib/utils";
import type { StockSignal } from "@workspace/api-client-react/src/generated/api.schemas";

function getSignalNote(signal: StockSignal): string {
  const parts: string[] = [];

  // Price vs moving averages
  const priceVsMa20 = signal.currentPrice > signal.ma20 ? "above MA20" : "below MA20";
  const trendDir = signal.ma20 > signal.ma50 ? "uptrend" : "downtrend";
  parts.push(`${priceVsMa20}, ${trendDir}`);

  // RSI zone
  if (signal.rsi >= 70) {
    parts.push(`RSI overbought (${signal.rsi.toFixed(0)})`);
  } else if (signal.rsi >= 50 && signal.rsi <= 65) {
    parts.push(`RSI bullish zone (${signal.rsi.toFixed(0)})`);
  } else if (signal.rsi < 30) {
    parts.push(`RSI oversold (${signal.rsi.toFixed(0)})`);
  } else if (signal.rsi < 45) {
    parts.push(`RSI weak (${signal.rsi.toFixed(0)})`);
  } else {
    parts.push(`RSI neutral (${signal.rsi.toFixed(0)})`);
  }

  // Intraday move
  if (signal.changePercent <= -2) {
    parts.push("sharp selloff today");
  } else if (signal.changePercent >= 2) {
    parts.push("strong move up today");
  }

  return parts.join(" · ");
}

function ProbabilityBar({ upProbability, downProbability }: { upProbability: number; downProbability: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Up / Down Prob.</span>
        <div className="flex items-center gap-2 font-mono text-[10px] font-semibold">
          <span className="text-green-400">{upProbability}%</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-red-400">{downProbability}%</span>
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full overflow-hidden bg-muted/50 flex">
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
  const note = getSignalNote(signal);

  return (
    <Link href={`/stock/${signal.ticker}`}>
      <Card
        className="group h-full cursor-pointer overflow-hidden border-border/50 bg-card/50 transition-all hover:bg-card hover:border-border hover:shadow-sm"
        data-testid={`card-stock-${signal.ticker}`}
      >
        <CardContent className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xl font-bold tracking-tight">{signal.ticker}</h3>
            <SignalBadge signal={signal.signal} />
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
