"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { Shell, SectionTitle } from "@/components/Shell";
import { useAnonAuth } from "@/lib/use-anon-auth";
import { usePlayerCode } from "@/lib/use-player-code";
import { createSession, rememberCodeNames, subscribeCodeNames } from "@/lib/poker";

const PRESETS = [100, 500, 1000, 5000, 10000];

export default function NewSession() {
  const router = useRouter();
  const { uid } = useAnonAuth();
  const { code } = usePlayerCode();
  const [bankValue, setBankValue] = useState(500);
  const [currency, setCurrency] = useState("₹");
  const [names, setNames] = useState<string[]>(["", ""]);
  const [known, setKnown] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!code) return;
    return subscribeCodeNames(code, setKnown);
  }, [code]);

  const setName = (i: number, v: string) => setNames((n) => n.map((x, idx) => (idx === i ? v : x)));

  const addName = (v = "") => setNames((n) => (n.length >= 12 ? n : [...n, v]));

  const valid = names.filter((n) => n.trim()).length >= 2 && bankValue > 0 && !!uid;

  const start = async () => {
    if (!uid) return;
    setCreating(true);
    try {
      const clean = names.map((n) => n.trim()).filter(Boolean);
      const id = await createSession(uid, bankValue, currency, clean);
      if (code) await rememberCodeNames(code, clean);
      router.push(`/session/${id}`);
    } catch (err) {
      console.error("Failed to create session:", err);
      setCreating(false);
    }
  };

  return (
    <Shell>
      <h1 className="mb-5 text-3xl font-extrabold">
        New <span className="gold-text">Session</span>
      </h1>

      <SectionTitle>BANK VALUE</SectionTitle>
      <div className="surface mb-5 p-4">
        <div className="flex items-center gap-3">
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.slice(0, 3))}
            className="w-14 rounded-lg border border-border bg-secondary px-3 py-3 text-center text-lg font-bold"
            aria-label="Currency symbol"
          />
          <input
            type="number"
            inputMode="numeric"
            value={bankValue}
            onChange={(e) => setBankValue(Number(e.target.value))}
            className="tabular w-0 min-w-0 flex-1 rounded-lg border border-border bg-secondary px-4 py-3 text-2xl font-extrabold text-primary"
            aria-label="Value of one bank"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          1 Bank = {currency}
          {bankValue.toLocaleString("en-IN")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setBankValue(p)}
              className="btn-ghost tabular px-3 py-1.5 text-xs"
            >
              {currency}
              {p.toLocaleString("en-IN")}
            </button>
          ))}
        </div>
      </div>

      <SectionTitle>PLAYERS ({names.filter((n) => n.trim()).length}/12)</SectionTitle>
      <div className="space-y-2">
        {names.map((n, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={n}
              onChange={(e) => setName(i, e.target.value)}
              placeholder={`Player ${i + 1}`}
              className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-base font-semibold"
            />
            <button
              onClick={() => setNames((arr) => arr.filter((_, idx) => idx !== i))}
              className="btn-ghost p-3 text-destructive"
              aria-label={`Remove player ${i + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {names.length < 12 && (
        <button
          onClick={() => addName()}
          className="btn-ghost mt-3 flex w-full items-center justify-center gap-2 py-3 text-xs"
        >
          <Plus className="h-4 w-4" /> Add player
        </button>
      )}

      {known.length > 0 && (
        <div className="mt-6">
          <SectionTitle>REGULARS</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {known
              .filter((k) => !names.includes(k))
              .map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    const empty = names.findIndex((n) => !n.trim());
                    if (empty >= 0) setName(empty, k);
                    else addName(k);
                  }}
                  className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs normal-case"
                >
                  <Users className="h-3 w-3" /> {k}
                </button>
              ))}
          </div>
        </div>
      )}

      <button
        disabled={!valid || creating}
        onClick={start}
        className="btn-gold mt-8 w-full py-4 text-sm disabled:opacity-40"
      >
        {creating ? "Dealing..." : "Deal me in"}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Everyone starts with 1 buy-in.
      </p>
    </Shell>
  );
}
