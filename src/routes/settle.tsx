import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Save } from "lucide-react";
import { Shell, SectionTitle } from "@/components/Shell";
import { usePokerStore } from "@/lib/use-poker-store";
import {
  formatMoney,
  loadHistory,
  netOf,
  saveActive,
  saveHistory,
  settle,
  totalCashOut,
  totalPool,
  type Session,
} from "@/lib/poker";

export const Route = createFileRoute("/settle")({
  head: () => ({
    meta: [
      { title: "Settlement — The Ledger" },
      {
        name: "description",
        content: "Enter final stacks and get the minimum set of payments to settle up.",
      },
      { property: "og:title", content: "Settlement — The Ledger" },
      {
        property: "og:description",
        content: "Splitwise-style poker payouts in the fewest transactions.",
      },
    ],
  }),
  component: SettleScreen,
});

function SettleScreen() {
  const { active, ready } = usePokerStore();
  const navigate = useNavigate();
  const [stacks, setStacks] = useState<Record<string, string>>({});

  useEffect(() => {
    if (ready && !active) navigate({ to: "/" });
  }, [ready, active, navigate]);

  if (!active) return <Shell>{null}</Shell>;

  const draft: Session = {
    ...active,
    players: active.players.map((p) => ({
      ...p,
      cashOut: stacks[p.id] === undefined || stacks[p.id] === "" ? 0 : Number(stacks[p.id]),
    })),
  };

  const pool = totalPool(draft);
  const out = totalCashOut(draft);
  const diff = pool - out;
  const transfers = settle(draft);

  const finish = () => {
    const finished: Session = {
      ...draft,
      endedAt: Date.now(),
      status: "settled",
    };
    saveHistory([finished, ...loadHistory()]);
    saveActive(null);
    navigate({ to: "/history" });
  };

  return (
    <Shell>
      <h1 className="mb-5 text-3xl font-extrabold">
        Cash <span className="gold-text">Out</span>
      </h1>

      <SectionTitle>FINAL STACKS ({active.currency})</SectionTitle>
      <div className="space-y-2">
        {active.players.map((p) => (
          <div key={p.id} className="surface flex items-center gap-3 p-3">
            <div className="flex-1">
              <p className="text-sm font-extrabold">{p.name}</p>
              <p className="tabular text-xs text-muted-foreground">
                in {formatMoney(p.buyIns * active.bankValue, active.currency)}
              </p>
            </div>
            <input
              type="number"
              inputMode="numeric"
              value={stacks[p.id] ?? ""}
              onChange={(e) => setStacks((s) => ({ ...s, [p.id]: e.target.value }))}
              placeholder="0"
              className="tabular w-32 rounded-lg border border-border bg-secondary px-3 py-2.5 text-right text-lg font-bold"
              aria-label={`Final stack for ${p.name}`}
            />
          </div>
        ))}
      </div>

      <div
        className={`surface mt-5 flex items-center gap-3 p-4 ${diff === 0 ? "" : "metallic"}`}
      >
        {diff === 0 ? (
          <CheckCircle2 className="h-5 w-5 text-success" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-destructive" />
        )}
        <div className="tabular text-xs">
          <p className="font-bold">
            Pool {formatMoney(pool, active.currency)} · Cashed out{" "}
            {formatMoney(out, active.currency)}
          </p>
          <p className={diff === 0 ? "text-success" : "text-destructive"}>
            {diff === 0
              ? "Books balanced."
              : diff > 0
                ? `Pool mismatch: +${formatMoney(diff, active.currency)} uncollected`
                : `Pool mismatch: ${formatMoney(diff, active.currency)} over-counted`}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <SectionTitle>NET RESULTS</SectionTitle>
        <div className="surface divide-y divide-border">
          {[...draft.players]
            .sort((a, b) => netOf(draft, b) - netOf(draft, a))
            .map((p) => {
              const net = netOf(draft, p);
              return (
                <div key={p.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-bold">{p.name}</span>
                  <span
                    className={`tabular text-sm font-extrabold ${
                      net > 0
                        ? "text-success"
                        : net < 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {net > 0 ? "+" : ""}
                    {formatMoney(net, active.currency)}
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      <div className="mt-6">
        <SectionTitle>SETTLE UP ({transfers.length} PAYMENTS)</SectionTitle>
        {transfers.length === 0 ? (
          <div className="surface p-4 text-sm text-muted-foreground">
            Nothing to settle yet — enter final stacks above.
          </div>
        ) : (
          <div className="space-y-2">
            {transfers.map((t, i) => (
              <div
                key={i}
                className="surface flex items-center justify-between gap-2 p-4 text-sm"
              >
                <span className="font-bold text-destructive">{t.from}</span>
                <ArrowRight className="h-4 w-4 text-primary" />
                <span className="font-bold text-success">{t.to}</span>
                <span className="tabular ml-auto font-extrabold">
                  {formatMoney(t.amount, active.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={finish} className="btn-gold mt-8 mb-4 w-full py-4 text-sm">
        <span className="inline-flex items-center gap-2">
          <Save className="h-4 w-4" /> Save to history
        </span>
      </button>
    </Shell>
  );
}
