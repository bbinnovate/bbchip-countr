import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type Player = {
  id: string;
  name: string;
  buyIns: number;
  cashOut: number | null;
};

export type SessionDoc = {
  hostUid: string;
  bankValue: number;
  currency: string;
  players: Player[];
  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  status: "active" | "settled";
  date: Timestamp | null;
};

export type Session = SessionDoc & { id: string };

const SESSIONS = "sessions";
const HISTORIES = "playerHistories";

export const genId = () => Math.random().toString(36).slice(2, 10);

function toSession(id: string, data: SessionDoc): Session {
  return { id, ...data };
}

export async function createSession(
  hostUid: string,
  bankValue: number,
  currency: string,
  playerNames: string[],
): Promise<string> {
  const players: Player[] = playerNames.map((name) => ({
    id: genId(),
    name,
    buyIns: 1,
    cashOut: null,
  }));
  const ref = await addDoc(collection(db, SESSIONS), {
    hostUid,
    bankValue,
    currency,
    players,
    startedAt: serverTimestamp(),
    endedAt: null,
    status: "active",
    date: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeSession(
  id: string,
  cb: (session: Session | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, SESSIONS, id),
    (snap) => {
      if (!snap.exists()) return cb(null);
      cb(toSession(snap.id, snap.data({ serverTimestamps: "estimate" }) as SessionDoc));
    },
    (err) => onError?.(err),
  );
}

export function subscribeActiveSession(
  hostUid: string,
  cb: (session: Session | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, SESSIONS),
    where("hostUid", "==", hostUid),
    where("status", "==", "active"),
  );
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) return cb(null);
      const d = snap.docs[0]!;
      cb(toSession(d.id, d.data({ serverTimestamps: "estimate" }) as SessionDoc));
    },
    (err) => onError?.(err),
  );
}

/** Settled-history entries live under playerHistories/{code}/sessions — a
 * path-scoped namespace keyed by the user's portable Player Code, decoupled
 * from the device-bound Firebase auth uid. Knowing the code is what grants
 * access (same capability model as a session link); it never includes
 * active sessions, so a leaked code can't reach a live game. */
export function subscribeCodeHistory(
  code: string,
  cb: (sessions: Session[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, HISTORIES, code, "sessions"), orderBy("date", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs.map((d) =>
          toSession(d.id, d.data({ serverTimestamps: "estimate" }) as SessionDoc),
        ),
      );
    },
    (err) => onError?.(err),
  );
}

export async function updatePlayers(id: string, players: Player[]) {
  await updateDoc(doc(db, SESSIONS, id), { players });
}

export async function finishSession(id: string, players: Player[], ownerCode: string) {
  const settledAt = serverTimestamp();
  await updateDoc(doc(db, SESSIONS, id), {
    players,
    status: "settled",
    endedAt: settledAt,
  });
  const snap = await getDoc(doc(db, SESSIONS, id));
  const data = snap.data() as SessionDoc;
  await setDoc(doc(db, HISTORIES, ownerCode, "sessions", id), {
    hostUid: data.hostUid,
    bankValue: data.bankValue,
    currency: data.currency,
    players,
    startedAt: data.startedAt,
    endedAt: data.endedAt,
    status: "settled",
    date: data.date,
  });
}

export async function discardSession(id: string) {
  await deleteDoc(doc(db, SESSIONS, id));
}

export function subscribeCodeNames(
  code: string,
  cb: (names: string[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, HISTORIES, code),
    (snap) => cb((snap.data()?.names as string[] | undefined) ?? []),
    (err) => onError?.(err),
  );
}

export async function rememberCodeNames(code: string, names: string[]) {
  const ref = doc(db, HISTORIES, code);
  const snap = await getDoc(ref);
  const existing = (snap.data()?.names as string[] | undefined) ?? [];
  const set = new Set([...existing, ...names.map((n) => n.trim()).filter(Boolean)]);
  await setDoc(ref, { names: Array.from(set).slice(0, 60) }, { merge: true });
}

export const totalBanks = (s: Session) => s.players.reduce((a, p) => a + p.buyIns, 0);
export const totalPool = (s: Session) => totalBanks(s) * s.bankValue;
export const totalCashOut = (s: Session) => s.players.reduce((a, p) => a + (p.cashOut ?? 0), 0);
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

export type Transfer = { from: string; to: string; amount: number };

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
