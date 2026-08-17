export type Player = {
  id: string;
  name: string;
  buyIns: number;
  cashOut: number | null;
};

export type Session = {
  id: string;
  date: string; // ISO
  bankValue: number;
  currency: string;
  players: Player[];
  startedAt: number;
  endedAt: number | null;
  status: "active" | "settled";
};

export type Transfer = { from: string; to: string; amount: number };

const ACTIVE_KEY = "poker_active_session";
const HISTORY_KEY = "poker_history";
const NAMES_KEY = "poker_known_names";

const isBrowser = () => typeof window !== "undefined";

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("poker-store"));
}

export const loadActive = () => read<Session | null>(ACTIVE_KEY, null);
export const saveActive = (s: Session | null) => {
  if (!isBrowser()) return;
  if (s === null) {
    window.localStorage.removeItem(ACTIVE_KEY);
    window.dispatchEvent(new Event("poker-store"));
  } else write(ACTIVE_KEY, s);
};

export const loadHistory = () => read<Session[]>(HISTORY_KEY, []);
export const saveHistory = (list: Session[]) => write(HISTORY_KEY, list);

export const loadNames = () => read<string[]>(NAMES_KEY, []);
export const rememberNames = (names: string[]) => {
  const set = new Set([...loadNames(), ...names.map((n) => n.trim()).filter(Boolean)]);
  write(NAMES_KEY, Array.from(set).slice(0, 60));
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export const totalBanks = (s: Session) => s.players.reduce((a, p) => a + p.buyIns, 0);
export const totalPool = (s: Session) => totalBanks(s) * s.bankValue;
export const totalCashOut = (s: Session) =>
  s.players.reduce((a, p) => a + (p.cashOut ?? 0), 0);
export const netOf = (s: Session, p: Player) => (p.cashOut ?? 0) - p.buyIns * s.bankValue;

export function formatMoney(amount: number, currency = "₹") {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${currency}${Math.abs(Math.round(amount)).toLocaleString("en-IN")}`;
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Splitwise-style minimal transfer settlement. */
export function settle(session: Session): Transfer[] {
  const debtors: { name: string; amt: number }[] = [];
  const creditors: { name: string; amt: number }[] = [];
  session.players.forEach((p) => {
    const net = Math.round(netOf(session, p));
    if (net < 0) debtors.push({ name: p.name, amt: -net });
    else if (net > 0) creditors.push({ name: p.name, amt: net });
  });
  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const amount = Math.min(d.amt, c.amt);
    if (amount > 0) transfers.push({ from: d.name, to: c.name, amount });
    d.amt -= amount;
    c.amt -= amount;
    if (d.amt <= 0) i++;
    if (c.amt <= 0) j++;
  }
  return transfers;
}
