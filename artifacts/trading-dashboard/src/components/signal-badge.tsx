import React from "react";
import { cn } from "@/lib/utils";
import type { SignalType } from "@workspace/api-client-react/src/generated/api.schemas";

interface SignalBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  signal: SignalType;
  size?: "sm" | "md" | "lg";
}

export function SignalBadge({ signal, size = "md", className, ...props }: SignalBadgeProps) {
  const isBuy = signal === "BUY";
  const isSell = signal === "SELL";
  const isHold = signal === "HOLD";

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center font-mono font-bold border uppercase",
        size === "sm" && "text-[10px] px-1.5 py-0.5 rounded-sm",
        size === "md" && "text-xs px-2.5 py-1 rounded-sm tracking-wider",
        size === "lg" && "text-sm px-4 py-1.5 rounded tracking-widest",
        isBuy && "bg-[#00ff00]/10 text-[#00ff00] border-[#00ff00]/30 shadow-[0_0_10px_rgba(0,255,0,0.15)]",
        isSell && "bg-[#ff0000]/10 text-[#ff0000] border-[#ff0000]/30 shadow-[0_0_10px_rgba(255,0,0,0.15)]",
        isHold && "bg-[#ffcc00]/10 text-[#ffcc00] border-[#ffcc00]/30 shadow-[0_0_10px_rgba(255,204,0,0.15)]",
        className
      )}
      {...props}
    >
      {signal}
    </div>
  );
}
