"use client";

import Link from "next/link";
import { ChevronRight, History, PlayCircle, Trophy, Users } from "lucide-react";
import { Shell, SectionTitle } from "@/components/Shell";
import { usePokerStore } from "@/lib/use-poker-store";
import { formatMoney, totalPool, netOf } from "@/lib/poker";

export default function Dashboard() {
  const { active, history } = usePokerStore();
  const recent = history.slice(0, 3);

  return (
    <Shell>
      <div className="surface metallic mb-6 p-5">
        <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground">
          TONIGHT&apos;S TABLE
        </p>
        <h1 className="mt-1 text-3xl leading-none font-extrabold">
          {active ? "Session live" : "Ready to deal"}
        </h1>
        {active ? (
          <>
            <p className="tabular mt-2 text-sm text-muted-foreground">
              {active.players.length} players · pool{" "}
              <span className="text-primary">
                {formatMoney(totalPool(active), active.currency)}
              </span>
            </p>
            <Link
              href={`/session/${active.id}`}
              className="btn-gold mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm"
            >
              <PlayCircle className="h-4 w-4" /> Resume session
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Set your bank value, load the crew, and start counting buy-ins.
            </p>
            <Link
              href="/new"
              className="btn-gold mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm"
            >
              <PlayCircle className="h-4 w-4" /> Start new session
            </Link>
          </>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link href="/history" className="surface flex flex-col gap-2 p-4">
          <History className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold">Past games</span>
          <span className="tabular text-xs text-muted-foreground">{history.length} logged</span>
        </Link>
        <div className="surface flex flex-col gap-2 p-4">
          <Trophy className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold">Lifetime pool</span>
          <span className="tabular text-xs text-muted-foreground">
            {formatMoney(
              history.reduce((a, s) => a + totalPool(s), 0),
              history[0]?.currency ?? "₹",
            )}
          </span>
        </div>
      </div>

      <SectionTitle>RECENT GAMES</SectionTitle>
      {recent.length === 0 ? (
        <div className="surface p-5 text-sm text-muted-foreground">
          No sessions yet. Your first game will show up here.
        </div>
      ) : (
        <div className="space-y-3">
          {recent.map((s) => {
            const top = [...s.players].sort((a, b) => netOf(s, b) - netOf(s, a))[0];
            return (
              <Link
                key={s.id}
                href="/history"
                className="surface flex items-center justify-between p-4"
              >
                <div>
                  <p className="text-sm font-bold">
                    {s.date
                      ? s.date.toDate().toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                  <p className="tabular mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" /> {s.players.length} ·{" "}
                    {formatMoney(totalPool(s), s.currency)}
                    {top && (
                      <span className="text-success">
                        {" "}
                        {top.name} {formatMoney(netOf(s, top), s.currency)}
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
