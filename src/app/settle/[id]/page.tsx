"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Save } from "lucide-react";
import { Shell, SectionTitle } from "@/components/Shell";
import { usePlayerCode } from "@/lib/use-player-code";
import {
  finishSession,
  formatMoney,
  hasHistoryEntry,
  netOf,
  settle,
  subscribeSession,
  totalCashOut,
  totalPool,
  type Session,
} from "@/lib/poker";

export default function SettleScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { code } = usePlayerCode();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [stacks, setStacks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const finishingRef = useRef(false);

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
    if (!ready || finishingRef.current) return;
    if (!session) {
      router.push("/");
      return;
    }
    if (session.status === "settled" && code) {
      hasHistoryEntry(code, session.id).then((exists) => {
        if (exists) router.push("/");
      });
    }
  }, [ready, session, code, router]);

  if (!session) return <Shell>{null}</Shell>;

  const draft: Session = {
    ...session,
    players: session.players.map((p) => ({
      ...p,
      cashOut: stacks[p.id] === undefined || stacks[p.id] === "" ? 0 : Number(stacks[p.id]),
    })),
  };

  const pool = totalPool(draft);
  const out = totalCashOut(draft);
  const diff = pool - out;
  const transfers = settle(draft);

  const finish = async () => {
    if (!code || saving) return;
    setError(null);
    setSaving(true);
    try {
      await finishSession(session.id, draft.players, code);
      finishingRef.current = true;
      router.push("/");
    } catch (err) {
      console.error("Failed to save session to history:", err);
      const detail = err instanceof Error ? err.message : String(err);
      setError(`Couldn't save this session: ${detail}`);
      setSaving(false);
    }
  };

  return (
    <Shell>
      <h1 className="mb-5 text-3xl font-extrabold">
        Cash <span className="gold-text">Out</span>
      </h1>

      <SectionTitle>FINAL STACKS ({session.currency})</SectionTitle>
      <div className="space-y-2">
        {session.players.map((p) => (
          <div key={p.id} className="surface flex items-center gap-3 p-3">
            <div className="flex-1">
              <p className="text-sm font-extrabold">{p.name}</p>
              <p className="tabular text-xs text-muted-foreground">
                in {formatMoney(p.buyIns * session.bankValue, session.currency)}
              </p>
            </div>
            <input
              type="number"
              inputMode="numeric"
              value={stacks[p.id] ?? ""}
              onChange={(e) => setStacks((s) => ({ ...s, [p.id]: e.target.value }))}
              placeholder="0"
              className="tabular w-32 [appearance:textfield] rounded-lg border border-border bg-secondary px-3 py-2.5 text-right text-lg font-bold [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              aria-label={`Final stack for ${p.name}`}
            />
          </div>
        ))}
      </div>

      <div className={`surface mt-5 flex items-center gap-3 p-4 ${diff === 0 ? "" : "metallic"}`}>
        {diff === 0 ? (
          <CheckCircle2 className="h-5 w-5 text-success" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-destructive" />
        )}
        <div className="tabular text-xs">
          <p className="font-bold">
            Pool {formatMoney(pool, session.currency)} · Cashed out{" "}
            {formatMoney(out, session.currency)}
          </p>
          <p className={diff === 0 ? "text-success" : "text-destructive"}>
            {diff === 0
              ? "Books balanced."
              : diff > 0
                ? `Pool mismatch: +${formatMoney(diff, session.currency)} uncollected`
                : `Pool mismatch: ${formatMoney(diff, session.currency)} over-counted`}
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
                    {formatMoney(net, session.currency)}
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
              <div key={i} className="surface flex items-center justify-between gap-2 p-4 text-sm">
                <span className="font-bold text-destructive">{t.from}</span>
                <ArrowRight className="h-4 w-4 text-primary" />
                <span className="font-bold text-success">{t.to}</span>
                <span className="tabular ml-auto font-extrabold">
                  {formatMoney(t.amount, session.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mt-4 text-center text-xs font-bold text-destructive">{error}</p>}

      <button
        onClick={finish}
        disabled={saving}
        className="btn-gold mt-4 mb-4 w-full py-4 text-sm disabled:opacity-60"
      >
        <span className="inline-flex items-center gap-2">
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save to history"}
        </span>
      </button>
    </Shell>
  );
}
