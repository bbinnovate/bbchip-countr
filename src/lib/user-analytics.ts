import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Timestamp } from "firebase-admin/firestore";
import type { DailyCounts } from "./analytics-range";

const TIME_ZONE = "Asia/Kolkata";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface UserAnalytics {
  asOf: string;
  today: string; // YYYY-MM-DD in IST
  totalUsers: number;
  totalGames: number;
  daily: DailyCounts[];
}

const dayKey = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

function countByDay(times: number[]) {
  const perDay = new Map<string, number>();
  times.forEach((t) => {
    const day = dayKey(t);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  });
  return perDay;
}

/** Turns timestamps into counts only, so no user ids ever leave the server. */
export function summarizeUsage(
  accountsCreated: number[],
  gamesStarted: number[],
  now: number,
): UserAnalytics {
  const newUsers = countByDay(accountsCreated);
  const games = countByDay(gamesStarted);

  const today = dayKey(now);
  const daily: DailyCounts[] = [];
  const firstDay = [...newUsers.keys(), ...games.keys()].sort()[0];
  if (firstDay) {
    // Walks plain calendar dates in UTC, so every day is exactly 24 hours.
    let cursor = Date.parse(`${firstDay}T00:00:00Z`);
    while (new Date(cursor).toISOString().slice(0, 10) <= today) {
      const day = new Date(cursor).toISOString().slice(0, 10);
      daily.push({ day, newUsers: newUsers.get(day) ?? 0, games: games.get(day) ?? 0 });
      cursor += DAY_MS;
    }
  }

  return {
    asOf: new Date(now).toISOString(),
    today,
    totalUsers: accountsCreated.length,
    totalGames: gamesStarted.length,
    daily,
  };
}

function adminApp() {
  return (
    getApps()[0] ??
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? "")),
    })
  );
}

async function fetchAccountsCreated() {
  const auth = getAuth(adminApp());
  const createdAt: number[] = [];
  let pageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);
    page.users.forEach((user) => createdAt.push(Date.parse(user.metadata.creationTime)));
    pageToken = page.pageToken;
  } while (pageToken);

  return createdAt;
}

async function fetchGamesStarted() {
  const snap = await getFirestore(adminApp()).collection("sessions").select("startedAt").get();
  return snap.docs.flatMap((doc) => {
    const startedAt = doc.get("startedAt") as Timestamp | null | undefined;
    return startedAt ? [startedAt.toMillis()] : [];
  });
}

export async function fetchUserAnalytics(): Promise<UserAnalytics> {
  const [accountsCreated, gamesStarted] = await Promise.all([
    fetchAccountsCreated(),
    fetchGamesStarted(),
  ]);
  return summarizeUsage(accountsCreated, gamesStarted, Date.now());
}
