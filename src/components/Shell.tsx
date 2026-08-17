import { Link } from "@tanstack/react-router";
import { CalendarDays, Home, Spade } from "lucide-react";
import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col pb-24">
      <header className="flex items-center justify-between px-5 pt-6 pb-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="btn-gold flex h-9 w-9 items-center justify-center rounded-lg">
            <Spade className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight">
            THE <span className="gold-text">LEDGER</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            to="/"
            className="rounded-lg border border-border bg-secondary p-2 text-muted-foreground"
            activeProps={{ className: "text-primary" }}
            activeOptions={{ exact: true }}
          >
            <Home className="h-4 w-4" />
          </Link>
          <Link
            to="/history"
            className="rounded-lg border border-border bg-secondary p-2 text-muted-foreground"
            activeProps={{ className: "text-primary" }}
          >
            <CalendarDays className="h-4 w-4" />
          </Link>
        </nav>
      </header>
      <main className="flex-1 px-5">{children}</main>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-bold tracking-[0.2em] text-muted-foreground">
      {children}
    </h2>
  );
}
