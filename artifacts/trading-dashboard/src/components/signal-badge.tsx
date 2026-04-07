import React from "react";
import { cn } from "@/lib/utils";
import type { SignalType, ConfidenceTier } from "@workspace/api-client-react/src/generated/api.schemas";

interface SignalBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  signal: SignalType;
  size?: "sm" | "md" | "lg";
}

export function SignalBadge({ signal, size = "md", className, ...props }: SignalBadgeProps) {
  const isBuy  = signal === "BUY";
  const isSell = signal === "SELL";

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center font-mono font-bold border uppercase",
        size === "sm" && "text-[10px] px-1.5 py-0.5 rounded-sm",
        size === "md" && "text-xs px-2.5 py-1 rounded-sm tracking-wider",
        size === "lg" && "text-sm px-4 py-1.5 rounded tracking-widest",
        isBuy  && "bg-[#00ff00]/10 text-[#00ff00] border-[#00ff00]/30 shadow-[0_0_10px_rgba(0,255,0,0.15)]",
        isSell && "bg-[#ff0000]/10 text-[#ff0000] border-[#ff0000]/30 shadow-[0_0_10px_rgba(255,0,0,0.15)]",
        !isBuy && !isSell && "bg-[#ffcc00]/10 text-[#ffcc00] border-[#ffcc00]/30 shadow-[0_0_10px_rgba(255,204,0,0.15)]",
        className
      )}
      {...props}
    >
      {signal}
    </div>
  );
}

const TIER_STYLES: Record<string, string> = {
  "STRONG BUY":  "bg-emerald-400/15 text-emerald-300 border-emerald-400/50 shadow-[0_0_12px_rgba(52,211,153,0.25)]",
  "BUY":         "bg-green-500/10 text-green-400 border-green-500/40",
  "HOLD":        "bg-yellow-500/10 text-yellow-400 border-yellow-500/40",
  "SELL":        "bg-red-500/10 text-red-400 border-red-500/40",
  "STRONG SELL": "bg-red-700/20 text-red-300 border-red-600/60 shadow-[0_0_12px_rgba(220,38,38,0.25)]",
};

interface ConfidenceBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  tier: ConfidenceTier;
  size?: "sm" | "md" | "lg";
}

export function ConfidenceBadge({ tier, size = "md", className, ...props }: ConfidenceBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center font-mono font-semibold border uppercase tracking-wider rounded-full",
        size === "sm" && "text-[10px] px-2.5 py-0.5",
        size === "md" && "text-xs px-3 py-1",
        size === "lg" && "text-sm px-4 py-1.5",
        TIER_STYLES[tier] ?? TIER_STYLES["HOLD"],
        className
      )}
      {...props}
    >
      {tier}
    </div>
  );
}
