import React from "react";
import { format } from "date-fns";
import { AlertCircle, ArrowRightLeft, Clock, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetAllSignals, 
  useGetPortfolioSummary,
  getGetAllSignalsQueryKey,
  getGetPortfolioSummaryQueryKey
} from "@workspace/api-client-react";
import { StockCard, StockCardSkeleton } from "@/components/stock-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const REFETCH_INTERVAL = 5 * 60 * 1000;

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { 
    data: signals, 
    isLoading: isSignalsLoading,
    error: signalsError 
  } = useGetAllSignals({
    query: { refetchInterval: REFETCH_INTERVAL }
  });

  const { 
    data: summary, 
    isLoading: isSummaryLoading,
    error: summaryError
  } = useGetPortfolioSummary({
    query: { refetchInterval: REFETCH_INTERVAL }
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetAllSignalsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPortfolioSummaryQueryKey() });
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
      
      {/* Portfolio Summary Bar */}
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

      {/* Signals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {isSignalsLoading || !signals
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="min-h-[200px]">
                <StockCardSkeleton />
              </div>
            ))
          : signals.map((signal) => (
              <StockCard key={signal.ticker} signal={signal} />
            ))
        }
      </div>
    </div>
  );
}
