"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Spade, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePlayerCode } from "@/lib/use-player-code";
import { isValidPlayerCode, normalizePlayerCode } from "@/lib/player-code";

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col pb-16">
      <header className="flex items-center justify-between px-5 pt-6 pb-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="btn-gold flex h-9 w-9 items-center justify-center rounded-lg">
            <Spade className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight">
            THE <span className="gold-text">LEDGER</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <PlayerCodeBadge />
          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className={cn(
                "rounded-lg border border-border bg-secondary p-2 text-muted-foreground",
                pathname === "/" && "text-primary",
              )}
            >
              <Home className="h-4 w-4" />
            </Link>
            <Link
              href="/history"
              className={cn(
                "rounded-lg border border-border bg-secondary p-2 text-muted-foreground",
                pathname === "/history" && "text-primary",
              )}
            >
              <CalendarDays className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 px-5">{children}</main>
      <footer className="fixed inset-x-0 bottom-2 mx-auto w-full max-w-lg border-t border-border bg-background px-5 py-3 text-center text-xs text-muted-foreground">
        made by{" "}
        <a
          href="https://bombayblokes.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="gold-text font-bold"
        >
          Bombay Blokes
        </a>
      </footer>
    </div>
  );
}

function PlayerCodeBadge() {
  const { code, importCode } = usePlayerCode();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!code) return null;

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const applyImport = () => {
    const normalized = normalizePlayerCode(input);
    if (!isValidPlayerCode(normalized)) {
      setError("Enter the full 8-character code.");
      return;
    }
    importCode(normalized);
    setInput("");
    setError(null);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-right leading-tight"
        aria-label="Player code settings"
      >
        <p className="text-[9px] font-bold tracking-[0.15em] text-muted-foreground">PLAYER CODE</p>
        <p className="tabular gold-text text-sm font-extrabold">{code}</p>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4">
          <div className="surface metallic w-full max-w-lg p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground">
                  YOUR PLAYER CODE
                </p>
                <h3 className="gold-text mt-1 text-2xl font-extrabold">{code}</h3>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              This code unlocks your settled game history and known players on a new device. Anyone
              with this code can view that history, so keep it to yourself.
            </p>
            <button onClick={copy} className="btn-ghost mt-4 w-full py-3 text-xs">
              {copied ? "Copied!" : "Copy code"}
            </button>

            <div className="mt-6 border-t border-border pt-5">
              <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground">
                HAVE A CODE?
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Entering a different code replaces this one and switches to that history.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setError(null);
                  }}
                  placeholder="XXXX-XXXX"
                  className="tabular flex-1 rounded-lg border border-border bg-secondary px-3 py-2.5 text-base font-bold uppercase"
                  aria-label="Enter a player code"
                />
                <button onClick={applyImport} className="btn-gold px-4 py-2.5 text-xs">
                  Use it
                </button>
              </div>
              {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-bold tracking-[0.2em] text-muted-foreground">{children}</h2>
  );
}
