import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Clock, Users, X } from "lucide-react";
import { Shell, SectionTitle } from "@/components/Shell";
import { usePokerStore } from "@/lib/use-poker-store";
import {
  formatDuration,
  formatMoney,
  netOf,
  settle,
  totalPool,
  type Session,
} from "@/lib/poker";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Session History — The Ledger" },
      {
        name: "description",
        content: "Calendar of every poker night with pools, players and settlements.",
      },
      { property: "og:title", content: "Session History — The Ledger" },
      {
        property: "og:description",
        content: "Browse past poker sessions by date and review final ledgers.",
      },
    ],
  }),
  component: HistoryPage,
});

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

function HistoryPage() {
  const { history } = usePokerStore();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Session | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    history.forEach((s) => {
      const key = new Date(s.date).toDateString();
      map.set(key, [...(map.get(key) ?? []), s]);
    });
    return map;
  }, [history]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  const shift = (n: number) => setCursor(new Date(year, month + n, 1));

  return (
    <Shell>
      <h1 className="mb-5 text-3xl font-extrabold">
        Game <span className="gold-text">History</span>
      </h1>

      <div className="surface mb-6 p-4">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => shift(-1)} className="btn-ghost p-2" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-extrabold tracking-widest uppercase">
            {cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          </p>
          <button onClick={() => shift(1)} className="btn-ghost p-2" aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {DAYS.map((d, i) => (
            <span key={i} className="py-1 text-[10px] font-bold text-muted-foreground">
              {d}
            </span>
          ))}
          {cells.map((d, i) => {
            const sessions = d ? (byDay.get(d.toDateString()) ?? []) : [];
            const has = sessions.length > 0;
            return (
              <button
                key={i}
                disabled={!has}
                onClick={() => setSelected(sessions[0] ?? null)}
                className={`tabular aspect-square rounded-lg text-xs font-bold ${
                  has
                    ? "btn-gold"
                    : d
                      ? "bg-secondary text-muted-foreground"
                      : "opacity-0"
                }`}
              >
                {d?.getDate() ?? ""}
              </button>
            );
          })}
        </div>
      </div>

      <SectionTitle>ALL SESSIONS</SectionTitle>
      {history.length === 0 ? (
        <div className="surface p-5 text-sm text-muted-foreground">
          No games logged yet.
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="surface flex w-full items-center justify-between p-4 text-left"
            >
              <div>
                <p className="text-sm font-bold">
                  {new Date(s.date).toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </p>
                <p className="tabular mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" /> {s.players.length} ·{" "}
                  {formatMoney(totalPool(s), s.currency)}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {selected && <DaySheet session={selected} onClose={() => setSelected(null)} />}
    </Shell>
  );
}

function DaySheet({ session, onClose }: { session: Session; onClose: () => void }) {
  const transfers = settle(session);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <div className="surface metallic max-h-[85vh] w-full max-w-lg overflow-y-auto p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground">
              SESSION LEDGER
            </p>
            <h3 className="mt-1 text-2xl font-extrabold">
              {new Date(session.date).toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="tabular mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="POOL" value={formatMoney(totalPool(session), session.currency)} />
          <Stat
            label="1 BANK"
            value={`${session.currency}${session.bankValue.toLocaleString("en-IN")}`}
          />
          <Stat
            label="DURATION"
            value={formatDuration((session.endedAt ?? session.startedAt) - session.startedAt)}
          />
        </div>

        <p className="mt-5 mb-2 text-xs font-bold tracking-[0.2em] text-muted-foreground">
          PLAYERS
        </p>
        <div className="surface divide-y divide-border">
          {[...session.players]
            .sort((a, b) => netOf(session, b) - netOf(session, a))
            .map((p) => {
              const net = netOf(session, p);
              return (
                <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm font-bold">{p.name}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {p.buyIns} banks
                  </span>
                  <span
                    className={`tabular w-24 text-right text-sm font-extrabold ${
                      net > 0 ? "text-success" : net < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {net > 0 ? "+" : ""}
                    {formatMoney(net, session.currency)}
                  </span>
                </div>
              );
            })}
        </div>

        <p className="mt-5 mb-2 text-xs font-bold tracking-[0.2em] text-muted-foreground">
          SETTLEMENT
        </p>
        <div className="space-y-2">
          {transfers.length === 0 ? (
            <div className="surface p-3 text-xs text-muted-foreground">All square.</div>
          ) : (
            transfers.map((t, i) => (
              <div key={i} className="surface flex items-center gap-2 p-3 text-sm">
                <span className="font-bold text-destructive">{t.from}</span>
                <ArrowRight className="h-4 w-4 text-primary" />
                <span className="font-bold text-success">{t.to}</span>
                <span className="tabular ml-auto font-extrabold">
                  {formatMoney(t.amount, session.currency)}
                </span>
              </div>
            ))
          )}
        </div>

        <p className="tabular mt-4 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          Started {new Date(session.startedAt).toLocaleTimeString("en-IN")}
        </p>

        <button onClick={onClose} className="btn-ghost mt-5 w-full py-3 text-xs">
          Close
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface p-3">
      <p className="text-[10px] font-bold tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-primary">{value}</p>
    </div>
  );
}
