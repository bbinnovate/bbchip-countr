"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Coins, Minus, Plus, Timer, Trash2, Users, X } from "lucide-react";
import { Shell, SectionTitle } from "@/components/Shell";
import {
  discardSession,
  formatDuration,
  formatMoney,
  subscribeSession,
  totalBanks,
  totalPool,
  updatePlayers,
  type Player,
  type Session,
} from "@/lib/poker";

export default function LiveSession() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState<Player | null>(null);
  const [buyInCount, setBuyInCount] = useState(1);

  useEffect(() => {
    return subscribeSession(
      id,
      (s) => {
        setSession(s);
        setReady(true);
      },
      (err) => console.error("Failed to load session:", err),
    );
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) router.push("/");
    else if (session.status === "settled") router.push("/history");
  }, [ready, session, router]);

  if (!session || session.status !== "active") return <Shell>{null}</Shell>;

  const update = (playerId: string, delta: number) => {
    updatePlayers(
      session.id,
      session.players.map((p) =>
        p.id === playerId ? { ...p, buyIns: Math.max(0, p.buyIns + delta) } : p,
      ),
    );
  };

  const startedAtMs = session.startedAt?.toMillis() ?? now;

  return (
    <Shell>
      <div className="surface metallic mb-5 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground">
              CASH ON TABLE
            </p>
            <p className="tabular gold-text mt-1 text-4xl font-extrabold">
              {formatMoney(totalPool(session), session.currency)}
            </p>
            <p className="tabular mt-1 text-xs text-muted-foreground">
              {totalBanks(session)} banks × {session.currency}
              {session.bankValue.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="text-right">
            <p className="tabular flex items-center gap-1 text-sm font-bold">
              <Timer className="h-4 w-4 text-primary" />
              {formatDuration(now - startedAtMs)}
            </p>
            <p className="tabular mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" /> {session.players.length}
            </p>
          </div>
        </div>
      </div>

      <SectionTitle>TABLE</SectionTitle>
      <div className="space-y-3">
        {session.players.map((p) => (
          <div key={p.id} className="surface flex items-center gap-3 p-3">
            <div className="flex-1">
              <p className="text-sm font-extrabold">{p.name}</p>
              <p className="tabular text-xs text-muted-foreground">
                {p.buyIns} banks · {formatMoney(p.buyIns * session.bankValue, session.currency)}
              </p>
            </div>
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
          onClick={() => router.push(`/settle/${session.id}`)}
          className="btn-gold w-full py-4 text-sm"
        >
          <span className="inline-flex items-center gap-2">
            <Coins className="h-4 w-4" /> End game & cash out
          </span>
        </button>
        <button
          onClick={() => {
            if (window.confirm("Discard this session? Nothing will be saved.")) {
              discardSession(session.id);
              router.push("/");
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
              {formatMoney(confirm.buyIns * session.bankValue, session.currency)}) → will be{" "}
              <span className="text-primary">
                {confirm.buyIns + buyInCount} banks (
                {formatMoney((confirm.buyIns + buyInCount) * session.bankValue, session.currency)})
              </span>
            </p>

            <div className="mt-5 flex items-center justify-center gap-4">
              <button
                onClick={() => setBuyInCount((c) => Math.max(1, c - 1))}
                className="btn-ghost p-3"
                aria-label="Decrease buy-ins"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="min-w-[4rem] text-center">
                <p className="tabular text-3xl font-extrabold">{buyInCount}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">banks</p>
              </div>
              <button
                onClick={() => setBuyInCount((c) => c + 1)}
                className="btn-ghost p-3"
                aria-label="Increase buy-ins"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirm(null)} className="btn-ghost flex-1 py-3 text-xs">
                Cancel
              </button>
              <button
                onClick={() => {
                  update(confirm.id, buyInCount);
                  setConfirm(null);
                }}
                className="btn-gold flex-1 py-3 text-xs"
              >
                Add {buyInCount} bank{buyInCount > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
