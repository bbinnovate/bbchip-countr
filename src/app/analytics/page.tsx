"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { format } from "date-fns";
import { CalendarDays, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Shell, SectionTitle } from "@/components/Shell";
import { Calendar } from "@/components/ui/calendar";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RANGE_PRESETS,
  dayLabel,
  firstDayWith,
  groupByWeek,
  presetRange,
  rangeLabel,
  summarizeRange,
  type DayRange,
  type RangePreset,
} from "@/lib/analytics-range";
import type { UserAnalytics } from "@/lib/user-analytics";

const KEY_STORAGE = "ledger.analyticsKey";
const CHART_WEEKS = 12;

const toDate = (day: string) => new Date(`${day}T00:00:00`);
const count = (n: number) => n.toLocaleString("en-IN");

function readStoredKey() {
  try {
    return sessionStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

function storeKey(key: string | null) {
  try {
    if (key) sessionStorage.setItem(KEY_STORAGE, key);
    else sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    // The key just won't survive a reload.
  }
}

function StatCard({ label, value, note }: { label: string; value: number; note: ReactNode }) {
  return (
    <div className="surface min-w-0 p-4">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="tabular mt-2 text-3xl font-extrabold">{count(value)}</p>
      <p className="tabular mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Comparison({
  current,
  previous,
  dayCount,
}: {
  current: number;
  previous: number | null;
  dayCount: number;
}) {
  if (previous === null) return <>No earlier data to compare</>;
  const period = dayCount === 1 ? "the day before" : `the ${dayCount} days before`;
  if (previous === 0) return <>vs 0 {period}</>;
  const change = Math.round(((current - previous) / previous) * 100);
  return (
    <>
      <span className={change >= 0 ? "text-primary" : "text-destructive"}>
        {change >= 0 ? "+" : ""}
        {change}%
      </span>{" "}
      vs {count(previous)} {period}
    </>
  );
}

function CountChart({
  bars,
  label,
  tooltipLabel,
}: {
  bars: { day: string; count: number; partial: boolean }[];
  label: string;
  tooltipLabel: (day: string) => string;
}) {
  return (
    <div className="surface mb-6 p-4">
      <ChartContainer
        config={{ count: { label, color: "var(--primary)" } }}
        className="aspect-auto h-56 w-full"
      >
        <BarChart data={bars} margin={{ left: -16, right: 4, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={dayLabel}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <ChartTooltip
            content={<ChartTooltipContent labelFormatter={(day) => tooltipLabel(String(day))} />}
          />
          <Bar dataKey="count" fill="var(--color-count)" radius={4}>
            {bars.map((bar) => (
              <Cell key={bar.day} fillOpacity={bar.partial ? 0.4 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

export default function AnalyticsPage() {
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [data, setData] = useState<UserAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<RangePreset | "custom">("last7");
  const [customRange, setCustomRange] = useState<DayRange | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pickStart, setPickStart] = useState<string | null>(null);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/users", {
        method: "POST",
        headers: { "x-analytics-key": key },
      });
      const body = await res
        .json()
        .catch(() => ({ error: "The server had a problem. Try again." }));
      if (res.status === 401) {
        storeKey(null);
        setAccessKey(null);
      }
      if (!res.ok) throw new Error(body.error);
      storeKey(key);
      setAccessKey(key);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = readStoredKey();
    if (stored) void load(stored);
  }, [load]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) void load(input.trim());
  };

  const firstDay = data?.daily[0]?.day;

  const range = useMemo(() => {
    if (!data || !firstDay) return null;
    if (preset === "custom" && customRange) return customRange;
    return presetRange(preset === "custom" ? "last7" : preset, data.today, firstDay);
  }, [data, firstDay, preset, customRange]);

  const summary = useMemo(
    () => (data && range ? summarizeRange(data.daily, range) : null),
    [data, range],
  );

  const weeks = useMemo(
    () => (data ? groupByWeek(data.daily, data.today).slice(-CHART_WEEKS) : []),
    [data],
  );

  // One tap shows that day straight away; a second tap turns it into a range.
  const pickDay = (date: Date) => {
    const day = format(date, "yyyy-MM-dd");
    setPreset("custom");
    if (pickStart === null) {
      setPickStart(day);
      setCustomRange({ from: day, to: day });
      return;
    }
    setCustomRange(pickStart <= day ? { from: pickStart, to: day } : { from: day, to: pickStart });
    setPickStart(null);
    setCalendarOpen(false);
  };

  const firstUserDay = data && firstDayWith(data.daily, "newUsers");
  const firstGameDay = data && firstDayWith(data.daily, "games");

  return (
    <Shell>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">
          User <span className="gold-text">Analytics</span>
        </h1>
        {accessKey && (
          <button
            onClick={() => load(accessKey)}
            disabled={loading}
            className="btn-ghost p-2 disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {!accessKey && (
        <form onSubmit={submit} className="surface p-4">
          <label htmlFor="analytics-key" className="mb-2 block text-sm font-bold">
            Access key
          </label>
          <div className="flex gap-2">
            <input
              id="analytics-key"
              type="password"
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-secondary px-3 py-2.5 text-base font-bold"
            />
            <button type="submit" disabled={loading} className="btn-gold px-4 py-2.5 text-xs">
              {loading ? "Checking" : "Open"}
            </button>
          </div>
        </form>
      )}

      {data && range && summary && firstDay && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Select
              value={preset}
              onValueChange={(value) => {
                setPreset(value as RangePreset);
                setPickStart(null);
              }}
            >
              <SelectTrigger className="min-w-36 flex-1" aria-label="Date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_PRESETS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
                {preset === "custom" && <SelectItem value="custom">Custom dates</SelectItem>}
              </SelectContent>
            </Select>

            <Popover
              open={calendarOpen}
              onOpenChange={(open) => {
                setCalendarOpen(open);
                setPickStart(null);
              }}
            >
              <PopoverTrigger asChild>
                <button className="tabular flex min-w-36 flex-1 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-bold">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  {rangeLabel(range)}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="range"
                  selected={{ from: toDate(range.from), to: toDate(range.to) }}
                  onSelect={(_, clicked) => pickDay(clicked)}
                  defaultMonth={toDate(range.to)}
                  startMonth={toDate(firstDay)}
                  endMonth={toDate(data.today)}
                  disabled={{ before: toDate(firstDay), after: toDate(data.today) }}
                />
                <p className="px-3 pb-3 text-xs text-muted-foreground">
                  {pickStart
                    ? "Tap an end date for a range."
                    : "Tap a day, or a start and end date."}
                </p>
              </PopoverContent>
            </Popover>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3">
            <StatCard
              label="New users"
              value={summary.newUsers}
              note={
                <Comparison
                  current={summary.newUsers}
                  previous={summary.previousNewUsers}
                  dayCount={summary.dayCount}
                />
              }
            />
            <StatCard
              label="Games started"
              value={summary.games}
              note={
                <Comparison
                  current={summary.games}
                  previous={summary.previousGames}
                  dayCount={summary.dayCount}
                />
              }
            />
            <StatCard
              label="Users on record"
              value={data.totalUsers}
              note={firstUserDay ? `Accounts since ${dayLabel(firstUserDay)}` : "No accounts yet"}
            />
            <StatCard
              label="Games on record"
              value={data.totalGames}
              note={firstGameDay ? `Games since ${dayLabel(firstGameDay)}` : "No games yet"}
            />
          </div>

          {summary.dayCount > 1 && (
            <>
              <SectionTitle>NEW USERS PER DAY, {rangeLabel(range).toUpperCase()}</SectionTitle>
              <CountChart
                label="New users"
                bars={summary.days.map((d) => ({
                  day: d.day,
                  count: d.newUsers,
                  partial: d.day === data.today,
                }))}
                tooltipLabel={dayLabel}
              />

              <SectionTitle>GAMES STARTED PER DAY, {rangeLabel(range).toUpperCase()}</SectionTitle>
              <CountChart
                label="Games started"
                bars={summary.days.map((d) => ({
                  day: d.day,
                  count: d.games,
                  partial: d.day === data.today,
                }))}
                tooltipLabel={dayLabel}
              />
            </>
          )}

          <SectionTitle>NEW USERS PER WEEK</SectionTitle>
          <CountChart
            label="New users"
            bars={weeks.map((w) => ({
              day: w.weekStart,
              count: w.newUsers,
              partial: !w.complete,
            }))}
            tooltipLabel={(week) => `Week of ${dayLabel(week)}`}
          />

          <p className="text-xs leading-relaxed text-muted-foreground">
            A new user is a new anonymous account, created the first time a browser opens any page.
            The same person on a second device or in a private window counts again, and so does
            anyone who only opened a shared table link. Accounts from before{" "}
            {firstUserDay ? dayLabel(firstUserDay) : "launch"} are no longer on record, so games go
            back further than users. Days are in IST and weeks start on Monday. Faded bars are still
            in progress, so comparisons that include today run low. Updated{" "}
            {new Date(data.asOf).toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata",
              hour: "numeric",
              minute: "2-digit",
            })}
            .
          </p>
        </>
      )}
    </Shell>
  );
}
