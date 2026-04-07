import React from "react";

export function FooterSignature() {
  return (
    <div className="fixed bottom-3 right-4 z-50 flex items-center gap-2 text-[11px] text-muted-foreground/50 font-mono select-none transition-opacity duration-300 hover:text-muted-foreground/80">
      <span>
        Built by{" "}
        <a
          href="https://www.linkedin.com/in/manmeetsingh11/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Manmeet Singh
        </a>
      </span>
      <span className="opacity-40">•</span>
      <span>v1.0</span>
      <span className="opacity-40">•</span>
      <span>Powered by</span>
      <a
        href="https://alpaca.markets/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <img
          src="/alpaca-logo.svg"
          alt="Alpaca"
          className="h-3 opacity-60 hover:opacity-90 transition-opacity"
          style={{ imageRendering: "crisp-edges" }}
        />
      </a>
    </div>
  );
}
