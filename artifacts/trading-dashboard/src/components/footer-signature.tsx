import React from "react";

export function FooterSignature() {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors duration-200 font-mono tracking-wide select-none bg-gray-900/60 backdrop-blur-sm rounded-full">
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
