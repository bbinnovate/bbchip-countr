"use client";

import { useMemo, useState } from "react";
import { dayLabel } from "@/lib/analytics-range";
import type { Host } from "@/lib/user-analytics";

export function HostsList({ hosts }: { hosts: Host[] }) {
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return hosts;
    return hosts.filter((host) =>
      [host.name, host.phone, host.playerCode].some((value) => value.toLowerCase().includes(term)),
    );
  }, [hosts, search]);

  if (hosts.length === 0) {
    return (
      <div className="surface mb-6 p-5 text-sm text-muted-foreground">
        No details yet. They&apos;ll show here when someone taps Deal me in.
      </div>
    );
  }

  return (
    <div className="mb-6">
      <input
        id="hosts-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name, number or player code"
        aria-label="Search people"
        className="mb-3 w-full rounded-lg border border-border bg-secondary px-4 py-3 text-base font-semibold"
      />
      {shown.length === 0 ? (
        <div className="surface p-5 text-sm text-muted-foreground">No one matches that search.</div>
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {shown.map((host) => (
            <div key={`${host.phone}-${host.playerCode}`} className="surface p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-bold break-words">{host.name}</p>
                <p className="tabular shrink-0 text-xs text-muted-foreground">
                  {host.games} {host.games === 1 ? "game" : "games"}
                </p>
              </div>
              <p className="tabular mt-1 text-sm">{host.phone}</p>
              <p className="tabular mt-1 text-xs text-muted-foreground">
                {host.playerCode} · Joined {dayLabel(host.joinedDay)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
