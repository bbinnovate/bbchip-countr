// Date helpers for the analytics page. Days are YYYY-MM-DD strings in IST,
// and arithmetic runs on them in UTC so every day is exactly 24 hours.
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyCounts {
  day: string;
  newUsers: number;
  games: number;
}

type CountKey = "newUsers" | "games";

export interface WeeklySignups {
  weekStart: string; // The week's Monday
  newUsers: number;
  complete: boolean;
}

export interface DayRange {
  from: string;
  to: string;
}

export const RANGE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "thisWeek", label: "This week" },
  { value: "lastWeek", label: "Last week" },
  { value: "all", label: "All time" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["value"];

const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

export const addDays = (day: string, days: number) =>
  new Date(toMs(day) + days * DAY_MS).toISOString().slice(0, 10);

const mondayOf = (day: string) => addDays(day, -((new Date(toMs(day)).getUTCDay() + 6) % 7));

const daysIn = ({ from, to }: DayRange) => Math.round((toMs(to) - toMs(from)) / DAY_MS) + 1;

export function dayLabel(day: string) {
  return new Date(toMs(day)).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

export function rangeLabel({ from, to }: DayRange) {
  return from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`;
}

export function presetRange(preset: RangePreset, today: string, firstDay: string): DayRange {
  const range = (() => {
    switch (preset) {
      case "today":
        return { from: today, to: today };
      case "yesterday":
        return { from: addDays(today, -1), to: addDays(today, -1) };
      case "last7":
        return { from: addDays(today, -6), to: today };
      case "last30":
        return { from: addDays(today, -29), to: today };
      case "thisWeek":
        return { from: mondayOf(today), to: today };
      case "lastWeek":
        return { from: addDays(mondayOf(today), -7), to: addDays(mondayOf(today), -1) };
      case "all":
        return { from: firstDay, to: today };
    }
  })();
  return { ...range, from: range.from < firstDay ? firstDay : range.from };
}

export const firstDayWith = (daily: DailyCounts[], key: CountKey) =>
  daily.find((d) => d[key] > 0)?.day;

/** Each `previous` covers the same number of days just before the range, or is null if that reaches back before the data starts. */
export function summarizeRange(daily: DailyCounts[], range: DayRange) {
  const inRange = ({ from, to }: DayRange) => daily.filter((d) => d.day >= from && d.day <= to);
  const days = inRange(range);
  const previousRange = {
    from: addDays(range.from, -daysIn(range)),
    to: addDays(range.from, -1),
  };
  const total = (rows: DailyCounts[], key: CountKey) => rows.reduce((sum, d) => sum + d[key], 0);
  const previous = (key: CountKey) => {
    const first = firstDayWith(daily, key);
    return first && previousRange.from >= first ? total(inRange(previousRange), key) : null;
  };

  return {
    days,
    dayCount: daysIn(range),
    newUsers: total(days, "newUsers"),
    games: total(days, "games"),
    previousNewUsers: previous("newUsers"),
    previousGames: previous("games"),
  };
}

export function groupByWeek(daily: DailyCounts[], today: string): WeeklySignups[] {
  const first = firstDayWith(daily, "newUsers");
  const weeks = new Map<string, number>();
  daily.forEach((d) => {
    if (!first || d.day < first) return;
    const week = mondayOf(d.day);
    weeks.set(week, (weeks.get(week) ?? 0) + d.newUsers);
  });
  return [...weeks].map(([weekStart, newUsers]) => ({
    weekStart,
    newUsers,
    complete: addDays(weekStart, 6) < today,
  }));
}
