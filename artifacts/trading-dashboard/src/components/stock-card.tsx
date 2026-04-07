import React from "react";
import { Link } from "wouter";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SignalBadge } from "./signal-badge";
import { cn } from "@/lib/utils";
import type { StockSignal } from "@workspace/api-client-react/src/generated/api.schemas";

export function StockCard({ signal }: { signal: StockSignal }) {
  const isPositive = signal.change >= 0;
  const ChangeIcon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <Link href={`/stock/${signal.ticker}`}>
      <Card className="group h-full cursor-pointer overflow-hidden border-border/50 bg-card/50 transition-all hover:bg-card hover:border-border hover:shadow-sm">
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
              >
                <ChangeIcon className="h-3 w-3 mr-0.5" />
                {Math.abs(signal.changePercent).toFixed(2)}%
              </span>
            </div>
            <div className="text-xs font-mono text-muted-foreground">
              {isPositive ? "+" : "-"}${Math.abs(signal.change).toFixed(2)} today
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border/50">
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
              )}>
                {signal.rsi.toFixed(1)}
              </span>
            </div>
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
      </CardContent>
    </Card>
  );
}
