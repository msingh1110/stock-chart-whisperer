import React from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft, AlertCircle, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { format } from "date-fns";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip,
  Legend
} from "recharts";

import { useGetSignalByTicker } from "@workspace/api-client-react";
import { SignalBadge } from "@/components/signal-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const REFETCH_INTERVAL = 5 * 60 * 1000;

export default function StockDetail() {
  const { ticker } = useParams<{ ticker: string }>();

  const { data: stock, isLoading, error } = useGetSignalByTicker(ticker ?? "", {
    query: { 
      enabled: !!ticker,
      refetchInterval: REFETCH_INTERVAL 
    }
  });

  if (!ticker) return null;

  if (error) {
    return (
      <div className="flex-1 flex flex-col pt-4 max-w-5xl mx-auto w-full">
        <Link href="/">
          <Button variant="ghost" className="w-fit mb-6 text-muted-foreground hover:text-foreground font-mono">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Terminal
          </Button>
        </Link>
        <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 font-mono">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Data Feed Error</AlertTitle>
          <AlertDescription>
            Could not retrieve details for {ticker}. The signal might not be available or the feed is disconnected.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading || !stock) {
    return (
      <div className="flex-1 flex flex-col pt-4 max-w-5xl mx-auto w-full gap-6">
        <div className="h-10 w-32 bg-muted rounded animate-pulse" />
        <Card className="border-border/50 bg-card/30 min-h-[400px]">
          <CardContent className="p-8 flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="font-mono text-muted-foreground text-sm uppercase tracking-widest">Loading Feed...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPositive = stock.change >= 0;
  const ChangeIcon = isPositive ? ArrowUpRight : ArrowDownRight;

  const chartData = [...stock.priceHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate min/max for better chart scaling
  const allPrices = chartData.flatMap(d => [d.close, d.ma20, d.ma50].filter(val => val !== null) as number[]);
  const minPrice = Math.floor(Math.min(...allPrices) * 0.95);
  const maxPrice = Math.ceil(Math.max(...allPrices) * 1.05);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card/90 backdrop-blur border border-border p-3 rounded-md shadow-lg font-mono text-xs">
          <p className="font-bold mb-2 pb-2 border-b border-border text-muted-foreground">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4 py-0.5">
              <span style={{ color: entry.color }} className="uppercase tracking-wider">{entry.name}</span>
              <span className="font-bold">${Number(entry.value).toFixed(2)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-5xl mx-auto w-full animate-in fade-in duration-500 pb-8">
      <div>
        <Link href="/">
          <Button variant="ghost" size="sm" className="w-fit mb-4 text-muted-foreground hover:text-foreground font-mono -ml-3">
            <ArrowLeft className="mr-2 h-4 w-4" /> TERMINAL
          </Button>
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <h1 className="text-4xl md:text-5xl font-bold font-mono tracking-tighter">{stock.ticker}</h1>
              <SignalBadge signal={stock.signal} size="lg" />
            </div>
            
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-mono font-bold tracking-tight">
                ${stock.currentPrice.toFixed(2)}
              </span>
              <span
                className={cn(
                  "flex items-center font-mono text-lg font-medium",
                  isPositive ? "text-green-500" : "text-red-500"
                )}
              >
                <ChangeIcon className="h-5 w-5 mr-1" />
                {Math.abs(stock.changePercent).toFixed(2)}%
              </span>
              <span className="text-sm font-mono text-muted-foreground ml-1">
                ({isPositive ? "+" : "-"}${Math.abs(stock.change).toFixed(2)})
              </span>
            </div>
          </div>

          <div className="flex flex-row md:flex-col items-center md:items-end gap-6 md:gap-2">
            <div className="flex items-center gap-2 text-muted-foreground font-mono text-xs uppercase tracking-wider">
              <Clock className="h-3 w-3" />
              <span>{format(new Date(stock.lastUpdated), "MMM dd, HH:mm:ss")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Current Price</span>
            <span className="font-mono text-lg font-bold">${stock.currentPrice.toFixed(2)}</span>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">MA (20 Day)</span>
            <span className="font-mono text-lg font-bold text-blue-400">${stock.ma20.toFixed(2)}</span>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">MA (50 Day)</span>
            <span className="font-mono text-lg font-bold text-orange-400">${stock.ma50.toFixed(2)}</span>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">RSI (14 Day)</span>
            <span className={cn(
              "font-mono text-lg font-bold",
              stock.rsi > 70 ? "text-red-400" : stock.rsi < 30 ? "text-green-400" : "text-foreground"
            )}>
              {stock.rsi.toFixed(2)}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/30">
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-sm uppercase tracking-widest text-muted-foreground">Price History & Indicators</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickMargin={10}
                  fontFamily="var(--app-font-mono)"
                  tickFormatter={(val) => {
                    const date = new Date(val);
                    return format(date, "MMM dd");
                  }}
                />
                <YAxis 
                  domain={[minPrice, maxPrice]}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickMargin={10}
                  fontFamily="var(--app-font-mono)"
                  tickFormatter={(val) => `$${val}`}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ fontFamily: 'var(--app-font-mono)', fontSize: '11px', paddingTop: '20px' }}
                  iconType="plainline"
                />
                <Line 
                  type="monotone" 
                  dataKey="close" 
                  name="Price"
                  stroke="hsl(var(--foreground))" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "hsl(var(--foreground))" }}
                />
                <Line 
                  type="monotone" 
                  dataKey="ma20" 
                  name="MA20"
                  stroke="#60a5fa" // blue-400
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 4"
                />
                <Line 
                  type="monotone" 
                  dataKey="ma50" 
                  name="MA50"
                  stroke="#fb923c" // orange-400
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
