const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // no 0/O, 1/I/L confusion
const STORAGE_KEY = "ledger_player_code";

export function generatePlayerCode(): string {
  const chars = Array.from(
    { length: 8 },
    () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
  );
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function normalizePlayerCode(input: string): string {
  const clean = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export function isValidPlayerCode(code: string): boolean {
  return /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code);
}

export function loadPlayerCode(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function savePlayerCode(code: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, code);
  window.dispatchEvent(new Event("player-code"));
}

export function ensurePlayerCode(): string {
  const existing = loadPlayerCode();
  if (existing) return existing;
  const fresh = generatePlayerCode();
  savePlayerCode(fresh);
  return fresh;
}
