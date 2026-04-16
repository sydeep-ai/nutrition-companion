import AsyncStorage from '@react-native-async-storage/async-storage';

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Plan day index using the device's local calendar (not raw 24h elapsed from the ISO timestamp).
 * Day 1 is the calendar day of `plan_start_date` in local time; increments at local midnight.
 */
export function computePlanDayFromPlanStart(planStartRaw: string | null): number {
  if (!planStartRaw?.trim()) {
    return 1;
  }
  const start = new Date(planStartRaw);
  if (Number.isNaN(start.getTime())) {
    return 1;
  }
  const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const n = new Date();
  const todayLocal = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const diffDays = Math.round((todayLocal.getTime() - startLocal.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, diffDays + 1);
}

export type MealTicksPayload = { done: number; total: number };

export function parseMealTicks(raw: string | null): MealTicksPayload | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as { done?: number; total?: number };
    if (typeof m.done !== 'number' || typeof m.total !== 'number') return null;
    return { done: m.done, total: m.total };
  } catch {
    return null;
  }
}

export type DaySnapshot = {
  done: number;
  total: number;
  journalTrimmed: string;
  cups: number;
  supplementsDone: boolean;
  stepsHit: boolean;
  workoutHit: boolean;
};

function parseWaterCups(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { cups?: number };
    if (parsed && typeof parsed.cups === 'number') return parsed.cups;
  } catch {
    /* fall through */
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function truthyFlag(raw: string | null): boolean {
  return raw === 'true' || raw === '1';
}

export function pointsFromSnapshot(s: DaySnapshot): number {
  const done = s.done;
  const total = s.total;

  let points = Math.min(12, done * 2);
  if (total > 0 && done >= total) {
    points += 5;
  }

  if (s.cups >= 8) points += 3;
  if (s.supplementsDone) points += 2;
  if (s.stepsHit) points += 5;
  if (s.workoutHit) points += 5;

  const journalDone = s.journalTrimmed.length > 0;
  if (journalDone) points += 3;

  const allMealsDone = total > 0 && done >= total;
  const perfect =
    allMealsDone &&
    journalDone &&
    s.cups >= 8 &&
    s.supplementsDone &&
    s.stepsHit &&
    s.workoutHit;
  if (perfect) points += 5;

  return Math.min(40, points);
}

export async function loadDaySnapshot(date: string): Promise<DaySnapshot> {
  const [mealTicks, journal, water, supplements, steps, workout] = await AsyncStorage.multiGet([
    `meal_ticks_${date}`,
    `journal_${date}`,
    `water_${date}`,
    `supplements_${date}`,
    `movement_steps_${date}`,
    `movement_workout_${date}`,
  ]);

  const ticks = parseMealTicks(mealTicks[1]);

  return {
    done: ticks?.done ?? 0,
    total: ticks?.total ?? 0,
    journalTrimmed: (journal[1] ?? '').trim(),
    cups: parseWaterCups(water[1]),
    supplementsDone: truthyFlag(supplements[1]),
    stepsHit: truthyFlag(steps[1]),
    workoutHit: truthyFlag(workout[1]),
  };
}

export function mergeSnapshotWithLive(
  base: DaySnapshot,
  live: Partial<Pick<DaySnapshot, 'done' | 'total' | 'journalTrimmed'>>
): DaySnapshot {
  return {
    ...base,
    ...live,
  };
}

export function calculateDayPointsFromSnapshot(s: DaySnapshot): number {
  return pointsFromSnapshot(s);
}

export async function calculateDayPoints(date: string): Promise<number> {
  return pointsFromSnapshot(await loadDaySnapshot(date));
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function calculateStreak(): Promise<number> {
  const d = new Date();
  let streak = 0;
  for (let i = 0; i < 4000; i++) {
    const key = d.toISOString().slice(0, 10);
    const raw = await AsyncStorage.getItem(`meal_ticks_${key}`);
    const ticks = parseMealTicks(raw);
    const done = ticks?.done ?? 0;
    if (done >= 4) {
      streak += 1;
      d.setUTCDate(d.getUTCDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export async function getTotalPoints(): Promise<number> {
  const keys = await AsyncStorage.getAllKeys();
  const dates = new Set<string>();
  for (const k of keys) {
    if (k.startsWith('journal_')) {
      const rest = k.slice('journal_'.length);
      if (isYmd(rest)) dates.add(rest);
    }
    if (k.startsWith('meal_ticks_')) {
      const rest = k.slice('meal_ticks_'.length);
      if (isYmd(rest)) dates.add(rest);
    }
  }
  let sum = 0;
  for (const date of dates) {
    sum += await calculateDayPoints(date);
  }
  return sum;
}

export async function collectHistoryDates(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  const dateSet = new Set<string>();
  for (const k of keys) {
    if (k.startsWith('journal_')) {
      const rest = k.slice('journal_'.length);
      if (isYmd(rest)) dateSet.add(rest);
    }
    if (k.startsWith('meal_ticks_')) {
      const rest = k.slice('meal_ticks_'.length);
      if (isYmd(rest)) dateSet.add(rest);
    }
  }
  return Array.from(dateSet).sort((a, b) => b.localeCompare(a));
}

export function formatHistoryHeading(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3) return ymd;
  const [y, m, day] = parts;
  const d = new Date(y, m - 1, day);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export async function readMovementSteps(ymd: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(`movement_steps_${ymd}`);
  return truthyFlag(v);
}

export async function readMovementWorkout(ymd: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(`movement_workout_${ymd}`);
  return truthyFlag(v);
}

export async function readJournalPreview(ymd: string, maxLen: number): Promise<string> {
  const raw = await AsyncStorage.getItem(`journal_${ymd}`);
  const t = (raw ?? '').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

export async function readJournalFull(ymd: string): Promise<string> {
  const raw = await AsyncStorage.getItem(`journal_${ymd}`);
  return (raw ?? '').trim();
}
