"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Shell, SectionTitle } from "@/components/Shell";
import { SessionLedgerModal } from "@/components/SessionLedgerModal";
import { usePokerStore } from "@/lib/use-poker-store";
import { formatMoney, totalPool, type Session } from "@/lib/poker";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function HistoryPage() {
  const { history } = usePokerStore();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Session | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    history.forEach((s) => {
      if (!s.date) return;
      const key = s.date.toDate().toDateString();
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
                  has ? "btn-gold" : d ? "bg-secondary text-muted-foreground" : "opacity-0"
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
        <div className="surface p-5 text-sm text-muted-foreground">No games logged yet.</div>
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
                  {s.date
                    ? s.date.toDate().toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })
                    : "—"}
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

      {selected && <SessionLedgerModal session={selected} onClose={() => setSelected(null)} />}
    </Shell>
  );
}
