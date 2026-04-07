import React, { useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import { AlertCircle, Clock, RefreshCw, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAllSignals,
  useGetPortfolioSummary,
  getGetAllSignalsQueryKey,
  getGetPortfolioSummaryQueryKey,
} from "@workspace/api-client-react";
import { StockCard, StockCardSkeleton } from "@/components/stock-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StockSignal } from "@workspace/api-client-react/src/generated/api.schemas";

const REFETCH_INTERVAL = 5 * 60 * 1000;
const MAX_RECENT = 5;

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem("recentSearches");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(searches: string[]) {
  try {
    localStorage.setItem("recentSearches", JSON.stringify(searches));
  } catch {}
}

export default function Dashboard() {
  const queryClient = useQueryClient();

  const {
    data: signals,
    isLoading: isSignalsLoading,
    error: signalsError,
  } = useGetAllSignals({ query: { refetchInterval: REFETCH_INTERVAL } });

  const {
    data: summary,
    isLoading: isSummaryLoading,
    error: summaryError,
  } = useGetPortfolioSummary({ query: { refetchInterval: REFETCH_INTERVAL } });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetAllSignalsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPortfolioSummaryQueryKey() });
  };

  // ── Custom ticker state ──────────────────────────────────────────────────
  const [input, setInput] = useState("");
  const [customSignal, setCustomSignal] = useState<StockSignal | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);
  const inputRef = useRef<HTMLInputElement>(null);

  const addToRecent = useCallback((ticker: string) => {
    setRecentSearches((prev) => {
      const filtered = prev.filter((t) => t !== ticker);
      const updated = [ticker, ...filtered].slice(0, MAX_RECENT);
      saveRecentSearches(updated);
      return updated;
    });
  }, []);

  const handleAnalyze = useCallback(async (rawTicker: string) => {
    const ticker = rawTicker.trim().toUpperCase();
    if (!ticker) return;

    setCustomLoading(true);
    setCustomError(null);

    try {
      const res = await fetch(`/api/signals/${ticker}`);
      if (!res.ok) {
        throw new Error("Ticker not found or data unavailable");
      }
      const data: StockSignal = await res.json();
      setCustomSignal(data);
      addToRecent(ticker);
      setInput("");
    } catch {
      setCustomError("Ticker not found or data unavailable. Please check the symbol and try again.");
    } finally {
      setCustomLoading(false);
    }
  }, [addToRecent]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAnalyze(input);
  };

  const clearCustom = () => {
    setCustomSignal(null);
    setCustomError(null);
    setInput("");
  };

  if (signalsError || summaryError) {
    return (
      <div className="flex-1 flex flex-col pt-8">
        <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 font-mono">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Error</AlertTitle>
          <AlertDescription>
            Failed to retrieve real-time market data. The feed may be down.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-6 w-full animate-in fade-in duration-500">

      {/* ── Search bar ── */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="Analyze any ticker (e.g., TSLA)"
              className="pl-9 font-mono uppercase tracking-wider bg-card/50 border-border/50 placeholder:normal-case placeholder:tracking-normal placeholder:font-normal focus-visible:ring-primary/50"
              disabled={customLoading}
              maxLength={10}
            />
          </div>
          <Button
            onClick={() => handleAnalyze(input)}
            disabled={customLoading || !input.trim()}
            className="font-mono uppercase tracking-wider shrink-0"
          >
            {customLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              "Analyze"
            )}
          </Button>
        </div>

        {/* Recent searches */}
        {recentSearches.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Recent:
            </span>
            {recentSearches.map((ticker) => (
              <button
                key={ticker}
                onClick={() => handleAnalyze(ticker)}
                disabled={customLoading}
                className="text-[11px] font-mono px-2.5 py-0.5 rounded border border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/60 transition-all disabled:opacity-40 tracking-wider"
              >
                {ticker}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Custom ticker result ── */}
      {customError && (
        <Alert className="bg-destructive/10 text-destructive border-destructive/20 font-mono py-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">{customError}</AlertDescription>
        </Alert>
      )}

      {(customLoading || customSignal) && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Custom Analysis
            </span>
            {customSignal && !customLoading && (
              <button
                onClick={clearCustom}
                className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {customLoading ? (
              <div className="ring-1 ring-primary/40 rounded-lg shadow-sm shadow-primary/10">
                <StockCardSkeleton />
              </div>
            ) : customSignal ? (
              <div className="ring-1 ring-primary/40 rounded-lg shadow-sm shadow-primary/10">
                <StockCard signal={customSignal} />
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Portfolio summary bar ── */}
      <Card className="border-border/50 bg-card shadow-sm">
        <CardContent className="p-4 md:p-6">
          {isSummaryLoading || !summary ? (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="h-6 w-32 bg-muted rounded animate-pulse" />
              <div className="flex gap-4">
                <div className="h-6 w-16 bg-muted rounded animate-pulse" />
                <div className="h-6 w-16 bg-muted rounded animate-pulse" />
                <div className="h-6 w-16 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm uppercase tracking-wider">
                <Clock className="h-4 w-4 text-primary" />
                <span>Last Updated: {format(new Date(summary.lastUpdated), "HH:mm:ss")}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 ml-2 hover:bg-muted"
                  onClick={handleRefresh}
                  disabled={isSignalsLoading || isSummaryLoading}
                >
                  <RefreshCw className={cn("h-3 w-3", (isSignalsLoading || isSummaryLoading) && "animate-spin")} />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono uppercase tracking-widest">Buy</span>
                  <span className="font-mono text-lg font-bold text-[#00ff00]">{summary.buyCount}</span>
                </div>
                <Separator orientation="vertical" className="h-6 hidden md:block" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono uppercase tracking-widest">Hold</span>
                  <span className="font-mono text-lg font-bold text-[#ffcc00]">{summary.holdCount}</span>
                </div>
                <Separator orientation="vertical" className="h-6 hidden md:block" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono uppercase tracking-widest">Sell</span>
                  <span className="font-mono text-lg font-bold text-[#ff0000]">{summary.sellCount}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Default portfolio ── */}
      <div className="flex flex-col gap-3">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Default Portfolio
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {isSignalsLoading || !signals
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="min-h-[200px]">
                  <StockCardSkeleton />
                </div>
              ))
            : (signals as StockSignal[]).map((signal) => (
                <StockCard key={signal.ticker} signal={signal} />
              ))}
        </div>
      </div>
    </div>
  );
}
