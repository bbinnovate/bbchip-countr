import { ArrowRight, Clock, X } from "lucide-react";
import { formatDuration, formatMoney, netOf, settle, totalPool, type Session } from "@/lib/poker";

export function SessionLedgerModal({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
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
              {session.date
                ? session.date.toDate().toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : "—"}
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
            value={formatDuration(
              (session.endedAt?.toMillis() ?? 0) - (session.startedAt?.toMillis() ?? 0),
            )}
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
                  <span className="tabular text-xs text-muted-foreground">{p.buyIns} banks</span>
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
          Started {session.startedAt?.toDate().toLocaleTimeString("en-IN") ?? "—"}
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
