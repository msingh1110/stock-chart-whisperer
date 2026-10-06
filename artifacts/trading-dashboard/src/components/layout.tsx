import React from "react";
import { Activity } from "lucide-react";
import { Link } from "wouter";
import { FooterSignature } from "./footer-signature";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark selection:bg-primary selection:text-primary-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/80 backdrop-blur">
        <div className="container flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 max-w-7xl mx-auto px-4 py-3 sm:py-0">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-mono font-bold tracking-tight text-base sm:text-lg whitespace-nowrap">Manny's Terminal</span>
          </Link>
          <nav aria-label="Main navigation" className="order-3 w-full flex items-center gap-3 font-mono text-sm sm:order-none sm:w-auto sm:ml-4">
            <Link href="/" className="text-muted-foreground hover:text-foreground" data-testid="link-dashboard">Dashboard</Link>
            <Link href="/evaluation" className="text-muted-foreground hover:text-foreground" data-testid="link-evaluation">Evaluation</Link>
          </nav>
          <div className="ml-auto flex items-center space-x-4">
            <span className="text-xs font-mono text-muted-foreground flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              SYSTEM ONLINE
            </span>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full p-4 md:p-6 lg:p-8">
        {children}
      </main>
      <FooterSignature />
    </div>
  );
}
