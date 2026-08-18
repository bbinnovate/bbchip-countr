import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Coins, Minus, Plus, Timer, Trash2, Users, X } from "lucide-react";
import { Shell, SectionTitle } from "@/components/Shell";
import { usePokerStore } from "@/lib/use-poker-store";
import {
  formatDuration,
  formatMoney,
  saveActive,
  totalBanks,
  totalPool,
  type Player,
} from "@/lib/poker";

export const Route = createFileRoute("/session")({
  head: () => ({
    meta: [
      { title: "Live Table — The Ledger" },
      {
        name: "description",
        content: "One-tap rebuy tracking and a live cash pool for your poker table.",
      },
      { property: "og:title", content: "Live Table — The Ledger" },
      {
        property: "og:description",
        content: "Track buy-ins, pool size, and session time in real time.",
      },
    ],
  }),
  component: LiveSession,
});

function LiveSession() {
  const { active, ready } = usePokerStore();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState<Player | null>(null);
  const [buyInCount, setBuyInCount] = useState(1);


  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (ready && !active) navigate({ to: "/" });
  }, [ready, active, navigate]);

  if (!active) return <Shell>{null}</Shell>;

  const update = (id: string, delta: number) => {
    saveActive({
      ...active,
      players: active.players.map((p) =>
        p.id === id ? { ...p, buyIns: Math.max(0, p.buyIns + delta) } : p,
      ),
    });
  };

  return (
    <Shell>
      <div className="surface metallic mb-5 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground">
              CASH ON TABLE
            </p>
            <p className="tabular gold-text mt-1 text-4xl font-extrabold">
              {formatMoney(totalPool(active), active.currency)}
            </p>
            <p className="tabular mt-1 text-xs text-muted-foreground">
              {totalBanks(active)} banks × {active.currency}
              {active.bankValue.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="text-right">
            <p className="tabular flex items-center gap-1 text-sm font-bold">
              <Timer className="h-4 w-4 text-primary" />
              {formatDuration(now - active.startedAt)}
            </p>
            <p className="tabular mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" /> {active.players.length}
            </p>
          </div>
        </div>
      </div>

      <SectionTitle>TABLE</SectionTitle>
      <div className="space-y-3">
        {active.players.map((p) => (
          <div key={p.id} className="surface flex items-center gap-3 p-3">
            <div className="flex-1">
              <p className="text-sm font-extrabold">{p.name}</p>
              <p className="tabular text-xs text-muted-foreground">
                {p.buyIns} banks · {formatMoney(p.buyIns * active.bankValue, active.currency)}
              </p>
            </div>
            <button
              onClick={() => update(p.id, -1)}
              className="btn-ghost p-2.5"
              aria-label={`Remove buy-in from ${p.name}`}
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setBuyInCount(1);
                setConfirm(p);
              }}
              className="btn-gold flex items-center gap-1 px-4 py-2.5 text-xs"
            >
              <Plus className="h-4 w-4" /> Buy in
            </button>

          </div>
        ))}
      </div>

      <div className="mt-8 space-y-3">
        <button
          onClick={() => navigate({ to: "/settle" })}
          className="btn-gold w-full py-4 text-sm"
        >
          <span className="inline-flex items-center gap-2">
            <Coins className="h-4 w-4" /> End game & cash out
          </span>
        </button>
        <button
          onClick={() => {
            if (window.confirm("Discard this session? Nothing will be saved.")) {
              saveActive(null);
              navigate({ to: "/" });
            }
          }}
          className="btn-ghost flex w-full items-center justify-center gap-2 py-3 text-xs text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Discard session
        </button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4">
          <div className="surface metallic w-full max-w-lg p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground">
                  CONFIRM BUY-IN
                </p>
                <h3 className="mt-1 text-2xl font-extrabold">{confirm.name}</h3>
              </div>
              <button onClick={() => setConfirm(null)} aria-label="Close">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <p className="tabular mt-3 text-sm text-muted-foreground">
              Currently {confirm.buyIns} banks (
              {formatMoney(confirm.buyIns * active.bankValue, active.currency)}) → will be{" "}
              <span className="text-primary">
                {confirm.buyIns + 1} banks (
                {formatMoney((confirm.buyIns + 1) * active.bankValue, active.currency)})
              </span>
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="btn-ghost flex-1 py-3 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  update(confirm.id, 1);
                  setConfirm(null);
                }}
                className="btn-gold flex-1 py-3 text-xs"
              >
                Add buy-in
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
