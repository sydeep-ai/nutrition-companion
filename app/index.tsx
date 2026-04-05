import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  UIManager,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import MealCard, { MealCardLog } from '../components/MealCard';
import { DEFAULT_MEAL_PLAN, parseMealPlanFromStorage, PlanMeal } from '../data/defaultMealPlan';
import { requestDayCheckIn } from '../services/claude';
import { getTodayKey } from '../services/storage';

const ACCENT = '#D85A30';
const TEAL = '#1D9E75';
const TRACK_BORDER = '#555555';
const TRACK_BTN_TEXT_MUTED = '#888888';
const CUP_EMPTY_BG = '#444444';
const JOURNAL_INPUT_ACCESSORY_ID = 'today_journal_input_accessory';
const STORAGE_KEY = 'today_tick_state_v1';
const MEAL_LOGS_STORAGE_KEY = 'meal_logs_v1';
const MEAL_PLAN_STORAGE_KEY = 'meal_plan';
const TRACKING_CONFIG_KEY = 'tracking_config';
const STEPS_GOAL_KEY = 'steps_goal';
const WORKOUT_LABEL_KEY = 'workout_label';
const WATER_GOAL_KEY = 'water_goal';
const SUPPLEMENT_LIST_KEY = 'supplement_list';
const CUSTOM_ITEMS_KEY = 'custom_items';

const TRACKING_ORDER = [
  'meals',
  'steps',
  'workout',
  'water',
  'supplements',
  'custom',
] as const;

type TrackingId = (typeof TRACKING_ORDER)[number];

type SupplementRow = { name: string; timing: string };
type CustomItemRow = { label: string; emoji: string };

const stepsStorageKey = (d: string) => `steps_${d}`;
const workoutStorageKey = (d: string) => `workout_${d}`;
const waterCupsStorageKey = (d: string) => `water_cups_${d}`;
const supplementsStorageKey = (d: string) => `supplements_${d}`;
const customItemStorageKey = (index: number, d: string) => `custom_${index}_${d}`;

function isTrackingId(s: string): s is TrackingId {
  return (TRACKING_ORDER as readonly string[]).includes(s);
}

function parseTrackingConfig(raw: string | null): TrackingId[] {
  if (raw === null || raw === undefined) {
    return ['meals'];
  }
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) {
      return ['meals'];
    }
    if (arr.length === 0) {
      return [];
    }
    const ids = arr.filter((x): x is TrackingId => typeof x === 'string' && isTrackingId(x));
    return TRACKING_ORDER.filter((id) => ids.includes(id));
  } catch {
    return ['meals'];
  }
}

function parseWaterCupsStored(raw: string | null): number {
  if (!raw) return 0;
  try {
    const j = JSON.parse(raw) as { cups?: number };
    if (j && typeof j.cups === 'number' && Number.isFinite(j.cups)) {
      return Math.max(0, Math.floor(j.cups));
    }
  } catch {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

function parseYesNoAnswer(raw: string | null): 'yes' | 'no' | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw === 'yes' || raw === 'true' || raw === '1') return 'yes';
  if (raw === 'no' || raw === 'false' || raw === '0') return 'no';
  return null;
}

type TickState = {
  date: string;
  checkedIds: string[];
};

type MealLogsState = {
  [mealId: string]: MealCardLog;
};

const journalStorageKeyForDate = (date: string) => `journal_${date}`;
const checkinStorageKeyForDate = (date: string) => `checkin_${date}`;

function formatCheckinFooterTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  let h = d.getHours();
  const min = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) {
    h = 12;
  }
  const mm = min < 10 ? `0${min}` : String(min);
  return `Checked in at ${h}:${mm}${ampm}`;
}

function formatCommitmentDayLine(planStartRaw: string | null, targetDaysRaw: string | null): string {
  if (!planStartRaw?.trim() || !targetDaysRaw?.trim()) {
    return 'Commitment: start date or target length not set.';
  }
  const target = parseInt(targetDaysRaw, 10);
  const start = new Date(planStartRaw);
  if (Number.isNaN(start.getTime())) {
    return 'Commitment: could not parse plan start date.';
  }
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const now = new Date();
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((todayDay.getTime() - startDay.getTime()) / 86400000) + 1;
  const dayNum = Math.max(1, diffDays);
  const y =
    Number.isFinite(target) && target > 0 ? String(target) : 'unknown target length';
  return `Today is day ${dayNum} of ${y} in their commitment.`;
}

async function buildDayCheckinUserMessage(todayKey: string): Promise<string> {
  const entries = await AsyncStorage.multiGet([
    'user_name',
    'user_goal',
    'user_why',
    'user_intentions',
    'plan_start_date',
    'target_days',
    TRACKING_CONFIG_KEY,
    MEAL_PLAN_STORAGE_KEY,
    `meal_ticks_${todayKey}`,
    stepsStorageKey(todayKey),
    STEPS_GOAL_KEY,
    workoutStorageKey(todayKey),
    WORKOUT_LABEL_KEY,
    waterCupsStorageKey(todayKey),
    WATER_GOAL_KEY,
    supplementsStorageKey(todayKey),
    SUPPLEMENT_LIST_KEY,
    journalStorageKeyForDate(todayKey),
  ]);
  const g = Object.fromEntries(entries) as Record<string, string | null>;

  let intentionsBlock = '(none recorded)';
  try {
    const arr = g.user_intentions ? (JSON.parse(g.user_intentions) as unknown) : [];
    if (Array.isArray(arr) && arr.length > 0) {
      intentionsBlock = arr
        .map((x, i) => `${i + 1}. ${String(x)}`)
        .join('\n');
    }
  } catch {
    intentionsBlock = '(could not parse intentions)';
  }

  const tracking = parseTrackingConfig(g[TRACKING_CONFIG_KEY] ?? null);
  const trackingLabel =
    tracking.length > 0 ? tracking.join(', ') : 'nothing configured (default meals may still apply in app)';

  const lines: string[] = [];
  lines.push('## Intentions they committed to');
  lines.push(intentionsBlock);
  lines.push('');
  lines.push('## What they actually did today');
  lines.push(`Name: ${g.user_name?.trim() || '(not set)'}`);
  lines.push(`Goal: ${g.user_goal?.trim() || '(not set)'}`);
  lines.push(`Why: ${g.user_why?.trim() || '(not set)'}`);
  lines.push(formatCommitmentDayLine(g.plan_start_date, g.target_days));
  lines.push(`Tracking areas enabled: ${trackingLabel}`);
  lines.push('');

  if (tracking.includes('meals')) {
    let mealSummary = '(no meal plan in storage)';
    try {
      const plan = g[MEAL_PLAN_STORAGE_KEY] ? (JSON.parse(g[MEAL_PLAN_STORAGE_KEY] as string) as PlanMeal[]) : [];
      if (Array.isArray(plan) && plan.length > 0) {
        mealSummary = plan
          .map((m) => {
            const em = (m.emoji || '🍽️').trim();
            return `- ${em} ${m.title?.trim() || 'Meal'} @ ${m.time?.trim() || '?'}${m.intention?.trim() ? ` — ${m.intention.trim()}` : ''}`;
          })
          .join('\n');
      }
    } catch {
      mealSummary = '(meal plan parse error)';
    }
    let ticksLine = '(no meal tick data)';
    try {
      const ticksRaw = g[`meal_ticks_${todayKey}`];
      if (ticksRaw) {
        const t = JSON.parse(ticksRaw) as { done?: number; total?: number };
        const done = typeof t.done === 'number' ? t.done : '?';
        const total = typeof t.total === 'number' ? t.total : '?';
        ticksLine = `Meals completed vs planned: ${done}/${total}`;
      }
    } catch {
      ticksLine = '(meal ticks parse error)';
    }
    lines.push('### Meals');
    lines.push(mealSummary);
    lines.push(ticksLine);
    lines.push('');
  }

  if (tracking.includes('steps')) {
    const ans = parseYesNoAnswer(g[stepsStorageKey(todayKey)] ?? null);
    const goal = g[STEPS_GOAL_KEY]?.trim() || '10000';
    lines.push('### Steps');
    lines.push(`Daily goal: ${goal}`);
    lines.push(
      ans === 'yes'
        ? 'Logged: Yes (hit goal)'
        : ans === 'no'
          ? 'Logged: No (did not hit goal)'
          : 'Logged: not answered yet'
    );
    lines.push('');
  }

  if (tracking.includes('workout')) {
    const ans = parseYesNoAnswer(g[workoutStorageKey(todayKey)] ?? null);
    const label = g[WORKOUT_LABEL_KEY]?.trim() || 'Workout';
    lines.push('### Workout');
    lines.push(`Label / type: ${label}`);
    lines.push(
      ans === 'yes'
        ? 'Logged: Yes, worked out'
        : ans === 'no'
          ? 'Logged: No workout'
          : 'Logged: not answered yet'
    );
    lines.push('');
  }

  if (tracking.includes('water')) {
    const cups = parseWaterCupsStored(g[waterCupsStorageKey(todayKey)] ?? null);
    const wg = g[WATER_GOAL_KEY];
    const goalN = wg != null && wg !== '' ? Math.max(1, Math.floor(Number(wg))) : 8;
    lines.push('### Water');
    lines.push(`Cups logged: ${cups} / goal ${goalN}`);
    lines.push('');
  }

  if (tracking.includes('supplements')) {
    let listSummary = '(empty list)';
    try {
      const rows = g[SUPPLEMENT_LIST_KEY]
        ? (JSON.parse(g[SUPPLEMENT_LIST_KEY] as string) as SupplementRow[])
        : [];
      if (Array.isArray(rows) && rows.length > 0) {
        listSummary = rows
          .map((r, i) => `${i + 1}. ${r.name?.trim() || 'Supplement'} — ${r.timing?.trim() || 'timing not set'}`)
          .join('\n');
      }
    } catch {
      listSummary = '(supplement list parse error)';
    }
    let checks = '(no check state)';
    try {
      const raw = g[supplementsStorageKey(todayKey)];
      if (raw) {
        const o = JSON.parse(raw) as Record<string, boolean>;
        const pairs = Object.entries(o);
        checks =
          pairs.length > 0
            ? pairs.map(([k, v]) => `Slot ${k}: ${v ? 'taken' : 'not taken'}`).join('; ')
            : 'No per-supplement answers logged yet';
      }
    } catch {
      checks = '(supplement state parse error)';
    }
    lines.push('### Supplements');
    lines.push('Plan:');
    lines.push(listSummary);
    lines.push(`Today: ${checks}`);
    lines.push('');
  }

  lines.push('### Journal');
  lines.push(g[journalStorageKeyForDate(todayKey)]?.trim() || '(empty)');

  return lines.join('\n');
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  onPressHome?: () => void;
};

export default function TodayScreen({ onPressHome }: Props) {
  const summaryCaptureRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const journalInputRef = useRef<TextInput>(null);
  const journalSectionY = useRef(0);
  const [meals, setMeals] = useState<PlanMeal[]>(DEFAULT_MEAL_PLAN);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mealLogs, setMealLogs] = useState<MealLogsState>({});
  const [userName, setUserName] = useState('');
  const [summaryLogs, setSummaryLogs] = useState<MealLogsState>({});
  const [isSharing, setIsSharing] = useState(false);
  const [summaryCaptureReady, setSummaryCaptureReady] = useState(false);
  const [journalText, setJournalText] = useState('');
  const [journalInputHeight, setJournalInputHeight] = useState(100);
  const [journalExpanded, setJournalExpanded] = useState(false);
  const [trackingConfig, setTrackingConfig] = useState<TrackingId[]>(['meals']);
  const [stepsGoal, setStepsGoal] = useState('10000');
  const [workoutLabel, setWorkoutLabel] = useState('');
  const [waterGoal, setWaterGoal] = useState(8);
  const [supplementList, setSupplementList] = useState<SupplementRow[]>([]);
  const [customItems, setCustomItems] = useState<CustomItemRow[]>([]);
  const [stepsAnswer, setStepsAnswer] = useState<'yes' | 'no' | null>(null);
  const [workoutAnswer, setWorkoutAnswer] = useState<'yes' | 'no' | null>(null);
  const [waterCups, setWaterCups] = useState(0);
  const [supplementChecks, setSupplementChecks] = useState<Record<number, boolean>>({});
  const [customYesNo, setCustomYesNo] = useState<Record<number, 'yes' | 'no' | null>>({});
  const [customNotes, setCustomNotes] = useState<Record<number, string>>({});
  const [checkinSaved, setCheckinSaved] = useState<{
    text: string;
    checkedInAt: string;
  } | null>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinCardExpanded, setCheckinCardExpanded] = useState(false);

  const waterCupSize = useMemo(() => {
    const winW = Dimensions.get('window').width;
    const inner = winW - 32 - 28;
    const gap = 6;
    const widthNeeded = (size: number) =>
      waterGoal * size + Math.max(0, waterGoal - 1) * gap;
    if (widthNeeded(32) <= inner) {
      return 32;
    }
    return 28;
  }, [waterGoal]);

  const loadState = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const today = getTodayKey();

      if (!raw) {
        const fresh: TickState = { date: today, checkedIds: [] };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        setCheckedIds([]);
        return;
      }

      const parsed = JSON.parse(raw) as TickState;
      if (parsed.date !== today) {
        const fresh: TickState = { date: today, checkedIds: [] };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        setCheckedIds([]);
        return;
      }

      setCheckedIds(parsed.checkedIds ?? []);
    } catch {
      setCheckedIds([]);
    }
  }, []);

  const persistState = useCallback(async (nextChecked: string[]) => {
    const payload: TickState = { date: getTodayKey(), checkedIds: nextChecked };
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Intentionally ignore transient storage failures.
    }
  }, []);

  const loadMealLogs = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MEAL_LOGS_STORAGE_KEY);
      if (!raw) {
        setMealLogs({});
        return;
      }
      const parsed = JSON.parse(raw) as MealLogsState;
      setMealLogs(parsed || {});
    } catch {
      setMealLogs({});
    }
  }, []);

  const loadMealPlan = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MEAL_PLAN_STORAGE_KEY);
      if (!raw) {
        setMeals(DEFAULT_MEAL_PLAN);
        return;
      }
      const mealsNorm = parseMealPlanFromStorage(raw);
      setMeals(mealsNorm.length > 0 ? mealsNorm : []);
    } catch {
      setMeals(DEFAULT_MEAL_PLAN);
    }
  }, []);

  const persistMealLogs = useCallback(async (logs: MealLogsState) => {
    try {
      await AsyncStorage.setItem(MEAL_LOGS_STORAGE_KEY, JSON.stringify(logs));
    } catch {
      // ignore transient persistence failures
    }
  }, []);

  const loadJournal = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(journalStorageKeyForDate(getTodayKey()));
      const text = raw ?? '';
      setJournalText(text);
      if (!text.trim()) {
        setJournalInputHeight(100);
      } else {
        const lines = Math.max(1, text.split('\n').length);
        setJournalInputHeight(Math.min(400, Math.max(100, lines * 22 + 40)));
      }
    } catch {
      setJournalText('');
      setJournalInputHeight(100);
    }
  }, []);

  const persistJournal = useCallback(async (text: string) => {
    try {
      await AsyncStorage.setItem(journalStorageKeyForDate(getTodayKey()), text);
    } catch {
      // Intentionally ignore transient storage failures.
    }
  }, []);

  const loadSavedCheckin = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(checkinStorageKeyForDate(getTodayKey()));
      if (!raw?.trim()) {
        setCheckinSaved(null);
        setCheckinCardExpanded(false);
        return;
      }
      const parsed = JSON.parse(raw) as { text?: string; checkedInAt?: string };
      const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
      if (!text) {
        setCheckinSaved(null);
        setCheckinCardExpanded(false);
        return;
      }
      setCheckinSaved({
        text,
        checkedInAt:
          typeof parsed.checkedInAt === 'string' && parsed.checkedInAt
            ? parsed.checkedInAt
            : new Date().toISOString(),
      });
      setCheckinCardExpanded(false);
    } catch {
      setCheckinSaved(null);
      setCheckinCardExpanded(false);
    }
  }, []);

  const runDayCheckin = useCallback(async () => {
    const todayKey = getTodayKey();
    setCheckinLoading(true);
    setCheckinSaved(null);
    setCheckinCardExpanded(false);
    try {
      await AsyncStorage.removeItem(checkinStorageKeyForDate(todayKey));
    } catch {
      /* ignore */
    }
    try {
      const userMessage = await buildDayCheckinUserMessage(todayKey);
      const text = await requestDayCheckIn(userMessage);
      const checkedInAt = new Date().toISOString();
      const payload = JSON.stringify({ text, checkedInAt });
      await AsyncStorage.setItem(checkinStorageKeyForDate(todayKey), payload);
      setCheckinSaved({ text, checkedInAt });
      setCheckinCardExpanded(true);
    } catch (e) {
      Alert.alert(
        'Check-in failed',
        e instanceof Error ? e.message : 'Something went wrong. Try again.'
      );
    } finally {
      setCheckinLoading(false);
    }
  }, []);

  const loadTrackingBundle = useCallback(async () => {
    const today = getTodayKey();
    const [
      tcRaw,
      stepsGoalRaw,
      workoutLblRaw,
      waterGoalRaw,
      supListRaw,
      customRaw,
      stepsRaw,
      workoutRaw,
      waterCupsRaw,
      supStateRaw,
    ] = await Promise.all([
      AsyncStorage.getItem(TRACKING_CONFIG_KEY),
      AsyncStorage.getItem(STEPS_GOAL_KEY),
      AsyncStorage.getItem(WORKOUT_LABEL_KEY),
      AsyncStorage.getItem(WATER_GOAL_KEY),
      AsyncStorage.getItem(SUPPLEMENT_LIST_KEY),
      AsyncStorage.getItem(CUSTOM_ITEMS_KEY),
      AsyncStorage.getItem(stepsStorageKey(today)),
      AsyncStorage.getItem(workoutStorageKey(today)),
      AsyncStorage.getItem(waterCupsStorageKey(today)),
      AsyncStorage.getItem(supplementsStorageKey(today)),
    ]);

    setTrackingConfig(parseTrackingConfig(tcRaw));
    const sg = Number(stepsGoalRaw);
    setStepsGoal(
      stepsGoalRaw != null && stepsGoalRaw !== '' && Number.isFinite(sg) && sg > 0
        ? String(Math.floor(sg))
        : '10000'
    );
    setWorkoutLabel(workoutLblRaw?.trim() ?? '');
    const wg = Number(waterGoalRaw);
    setWaterGoal(
      waterGoalRaw != null && waterGoalRaw !== '' && Number.isFinite(wg) && wg > 0
        ? Math.floor(wg)
        : 8
    );

    let sups: SupplementRow[] = [];
    try {
      const p = supListRaw ? (JSON.parse(supListRaw) as SupplementRow[]) : [];
      sups = Array.isArray(p)
        ? p.map((r) => ({
            name: String(r?.name ?? ''),
            timing: String(r?.timing ?? ''),
          }))
        : [];
    } catch {
      sups = [];
    }
    setSupplementList(sups);

    let customs: CustomItemRow[] = [];
    try {
      const c = customRaw ? (JSON.parse(customRaw) as CustomItemRow[]) : [];
      customs = Array.isArray(c)
        ? c.map((r) => ({
            label: String(r?.label ?? ''),
            emoji: String(r?.emoji ?? '⭐'),
          }))
        : [];
    } catch {
      customs = [];
    }
    setCustomItems(customs);

    setStepsAnswer(parseYesNoAnswer(stepsRaw));
    setWorkoutAnswer(parseYesNoAnswer(workoutRaw));
    setWaterCups(parseWaterCupsStored(waterCupsRaw));

    let supMap: Record<number, boolean> = {};
    try {
      const o = supStateRaw ? (JSON.parse(supStateRaw) as Record<string, boolean>) : {};
      if (o && typeof o === 'object') {
        supMap = Object.fromEntries(
          Object.entries(o).map(([k, v]) => [Number(k), v === true])
        );
      }
    } catch {
      supMap = {};
    }
    setSupplementChecks(supMap);

    const customYn: Record<number, 'yes' | 'no' | null> = {};
    const customNt: Record<number, string> = {};
    await Promise.all(
      customs.map(async (_, i) => {
        const raw = await AsyncStorage.getItem(customItemStorageKey(i, today));
        if (!raw) {
          customYn[i] = null;
          customNt[i] = '';
          return;
        }
        try {
          const j = JSON.parse(raw) as { yes?: boolean; note?: string };
          if (typeof j.yes === 'boolean') {
            customYn[i] = j.yes ? 'yes' : 'no';
          } else {
            customYn[i] = null;
          }
          customNt[i] = typeof j.note === 'string' ? j.note : '';
        } catch {
          customYn[i] = null;
          customNt[i] = '';
        }
      })
    );
    setCustomYesNo(customYn);
    setCustomNotes(customNt);
  }, []);

  useEffect(() => {
    loadState();
    loadMealLogs();
    loadMealPlan();
    loadJournal();
    void loadTrackingBundle();
    void loadSavedCheckin();
  }, [loadState, loadMealLogs, loadMealPlan, loadJournal, loadTrackingBundle, loadSavedCheckin]);

  useEffect(() => {
    if (meals.length === 0) {
      return;
    }
    const mealIdSet = new Set(meals.map((m) => m.id));
    const done = checkedIds.filter((id) => mealIdSet.has(id)).length;
    void AsyncStorage.setItem(
      `meal_ticks_${getTodayKey()}`,
      JSON.stringify({ done, total: meals.length })
    );
  }, [meals, checkedIds]);

  useEffect(() => {
    if (meals.length === 0) {
      return;
    }
    const mealIdSet = new Set(meals.map((m) => m.id));
    setCheckedIds((prev) => {
      const next = prev.filter((id) => mealIdSet.has(id));
      if (next.length === prev.length) {
        return prev;
      }
      void persistState(next);
      return next;
    });
  }, [meals, persistState]);

  useEffect(() => {
    const loadUserName = async () => {
      const raw = await AsyncStorage.getItem('user_name');
      setUserName(raw?.trim() || '');
    };
    void loadUserName();
  }, []);

  // Reset at midnight if the app remains open.
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      0
    );
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    const timer = setTimeout(async () => {
      setCheckedIds([]);
      await persistState([]);
      setJournalText('');
      setJournalInputHeight(100);
      setJournalExpanded(false);
      setStepsAnswer(null);
      setWorkoutAnswer(null);
      setWaterCups(0);
      setSupplementChecks({});
      setCustomYesNo({});
      setCustomNotes({});
      setCheckinLoading(false);
      void loadTrackingBundle();
      void loadSavedCheckin();
    }, msUntilMidnight);

    return () => clearTimeout(timer);
  }, [persistState, loadTrackingBundle, loadSavedCheckin]);

  const toggleChecked = useCallback(
    (mealId: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCheckedIds((prev) => {
        const next = prev.includes(mealId)
          ? prev.filter((id) => id !== mealId)
          : [...prev, mealId];
        void persistState(next);
        return next;
      });
    },
    [persistState]
  );

  const toggleExpanded = (mealId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === mealId ? null : mealId));
    setJournalExpanded(false);
  };

  const toggleJournalExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(null);
    setJournalExpanded((prev) => {
      if (prev) {
        Keyboard.dismiss();
      }
      return !prev;
    });
  }, []);

  const focusJournalFromNudge = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(null);
    setJournalExpanded(true);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, journalSectionY.current - 16),
        animated: true,
      });
    });
    setTimeout(() => {
      journalInputRef.current?.focus();
    }, 280);
  }, []);

  const progressStats = useMemo(() => {
    let done = 0;
    let total = 0;
    if (trackingConfig.includes('meals') && meals.length > 0) {
      total += meals.length;
      done += checkedIds.length;
    }
    if (trackingConfig.includes('steps')) {
      total += 1;
      if (stepsAnswer === 'yes') done += 1;
    }
    if (trackingConfig.includes('workout')) {
      total += 1;
      if (workoutAnswer === 'yes') done += 1;
    }
    if (trackingConfig.includes('water') && waterGoal > 0) {
      total += waterGoal;
      done += Math.min(waterCups, waterGoal);
    }
    if (trackingConfig.includes('supplements')) {
      supplementList.forEach((row, i) => {
        if (!row.name.trim() && !row.timing.trim()) return;
        total += 1;
        if (supplementChecks[i]) done += 1;
      });
    }
    if (trackingConfig.includes('custom')) {
      customItems.forEach((_, i) => {
        total += 1;
        if (customYesNo[i] === 'yes') done += 1;
      });
    }
    const fraction = total > 0 ? done / total : 0;
    return { done, total, fraction };
  }, [
    trackingConfig,
    meals.length,
    checkedIds.length,
    stepsAnswer,
    workoutAnswer,
    waterGoal,
    waterCups,
    supplementList,
    supplementChecks,
    customItems,
    customYesNo,
  ]);

  const persistStepsAnswer = useCallback(async (v: 'yes' | 'no') => {
    setStepsAnswer(v);
    try {
      await AsyncStorage.setItem(stepsStorageKey(getTodayKey()), v);
    } catch {
      /* ignore */
    }
  }, []);

  const persistWorkoutAnswer = useCallback(async (v: 'yes' | 'no') => {
    setWorkoutAnswer(v);
    try {
      await AsyncStorage.setItem(workoutStorageKey(getTodayKey()), v);
    } catch {
      /* ignore */
    }
  }, []);

  const persistWaterCups = useCallback(async (n: number) => {
    const capped = Math.max(0, Math.min(n, waterGoal));
    setWaterCups(capped);
    try {
      await AsyncStorage.setItem(
        waterCupsStorageKey(getTodayKey()),
        JSON.stringify({ cups: capped })
      );
    } catch {
      /* ignore */
    }
  }, [waterGoal]);

  const updateSupplementCheck = useCallback((index: number, done: boolean) => {
    setSupplementChecks((prev) => {
      const next = { ...prev, [index]: done };
      void AsyncStorage.setItem(
        supplementsStorageKey(getTodayKey()),
        JSON.stringify(next)
      );
      return next;
    });
  }, []);

  const saveCustomCell = useCallback(
    async (index: number, yes: 'yes' | 'no' | null, note: string) => {
      setCustomYesNo((p) => ({ ...p, [index]: yes }));
      try {
        await AsyncStorage.setItem(
          customItemStorageKey(index, getTodayKey()),
          JSON.stringify({
            yes: yes === null ? null : yes === 'yes',
            note,
          })
        );
      } catch {
        /* ignore */
      }
    },
    []
  );

  const updateMealLog = useCallback(
    (mealId: string, patch: Partial<MealCardLog>) => {
      setMealLogs((prev) => {
        const next: MealLogsState = {
          ...prev,
          [mealId]: {
            ...prev[mealId],
            ...patch,
          },
        };
        void persistMealLogs(next);
        return next;
      });
    },
    [persistMealLogs]
  );

  const handleShareDay = useCallback(async () => {
    if (isSharing) {
      return;
    }

    setIsSharing(true);
    const todayLabel = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const compressLogsEntries = await Promise.all(
      Object.entries(mealLogs).map(async ([mealId, log]) => {
        if (!log?.photoUri) {
          return [mealId, log] as const;
        }

        try {
          const compressed = await ImageManipulator.manipulateAsync(
            log.photoUri,
            [{ resize: { width: 800 } }],
            {
              compress: 0.8,
              format: ImageManipulator.SaveFormat.JPEG,
            }
          );
          return [mealId, { ...log, photoUri: compressed.uri }] as const;
        } catch {
          return [mealId, log] as const;
        }
      })
    );

    const preparedLogs: MealLogsState = Object.fromEntries(compressLogsEntries);
    setSummaryLogs(preparedLogs);
    setSummaryCaptureReady(true);

    try {
      const mediaPermission = await MediaLibrary.requestPermissionsAsync();
      const canSaveToPhotos = mediaPermission.status === 'granted';

      await new Promise((resolve) => setTimeout(resolve, 120));

      const uri = await captureRef(summaryCaptureRef, {
        format: 'png',
        quality: 1,
      });

      if (canSaveToPhotos) {
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Saved', 'Your daily summary was saved to Photos.');
      }

      await Share.share({
        url: uri,
        message: `My Nutrition Day — ${todayLabel}`,
      });
    } finally {
      setSummaryCaptureReady(false);
      setIsSharing(false);
    }
  }, [checkedIds, isSharing, mealLogs, meals]);

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.title}>Today</Text>
        </View>
        <View style={styles.headerRightCluster}>
          <Pressable
            style={[styles.headerShareButton, isSharing && styles.headerShareButtonDisabled]}
            onPress={() => void handleShareDay()}
            disabled={isSharing}
            accessibilityLabel="Share my day"
          >
            <Ionicons name="share-outline" size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable style={styles.homeButton} onPress={onPressHome}>
            {userName ? (
              <Text style={styles.avatarText}>
                {userName.charAt(0).toUpperCase()}
              </Text>
            ) : (
              <Text style={styles.homeIcon}>🏠</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>Today&apos;s progress</Text>
          <Text style={styles.progressText}>
            {progressStats.total > 0
              ? `${progressStats.done}/${progressStats.total}`
              : '—'}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progressStats.fraction * 100}%` }]}
          />
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={JOURNAL_INPUT_ACCESSORY_ID}>
            <View style={styles.journalInputAccessory}>
              <Pressable
                onPress={() => Keyboard.dismiss()}
                style={styles.journalInputAccessoryDone}
                hitSlop={8}
              >
                <Text style={styles.journalInputAccessoryDoneText}>Done</Text>
              </Pressable>
            </View>
          </InputAccessoryView>
        ) : null}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={[styles.listContent, { paddingBottom: 300 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {trackingConfig.includes('meals') &&
              meals.map((meal) => {
                const checked = checkedIds.includes(meal.id);
                const expanded = expandedId === meal.id;
                const log = mealLogs[meal.id];
                const title = `${meal.emoji} ${meal.title}`.trim();

                return (
                  <MealCard
                    key={meal.id}
                    id={meal.id}
                    title={title}
                    time={meal.time}
                    details={meal.intention}
                    checked={checked}
                    expanded={expanded}
                    log={log}
                    onToggleChecked={() => toggleChecked(meal.id)}
                    onToggleExpanded={() => toggleExpanded(meal.id)}
                    onPhotoCaptured={(uri) =>
                      updateMealLog(meal.id, {
                        photoUri: uri,
                        timestamp: new Date().toISOString(),
                      })
                    }
                    onDeletePhoto={() =>
                      updateMealLog(meal.id, {
                        photoUri: undefined,
                        timestamp: undefined,
                      })
                    }
                    onChangeNote={(text) =>
                      updateMealLog(meal.id, {
                        note: text,
                      })
                    }
                  />
                );
              })}

            {trackingConfig.includes('steps') ? (
              <View style={styles.trackCard}>
                <View style={styles.trackHeaderRow}>
                  <Text style={styles.trackTitleText} numberOfLines={1}>
                    👟 Steps
                  </Text>
                  <View style={styles.trackYnGroup}>
                    <Pressable
                      style={[
                        styles.trackYnBtn,
                        stepsAnswer === 'yes' && styles.trackYnBtnYes,
                      ]}
                      onPress={() => void persistStepsAnswer('yes')}
                    >
                      <Text
                        style={[
                          styles.trackYnBtnLabel,
                          stepsAnswer === 'yes' && styles.trackYnBtnLabelOn,
                        ]}
                      >
                        Yes
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.trackYnBtn,
                        stepsAnswer === 'no' && styles.trackYnBtnNoActive,
                      ]}
                      onPress={() => void persistStepsAnswer('no')}
                    >
                      <Text
                        style={[
                          styles.trackYnBtnLabel,
                          stepsAnswer === 'no' && styles.trackYnBtnLabelOn,
                        ]}
                      >
                        No
                      </Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={[styles.trackQuestion, styles.trackQuestionSpacing]}>
                  Did you hit {stepsGoal} steps today?
                </Text>
              </View>
            ) : null}

            {trackingConfig.includes('workout') ? (
              <View style={styles.trackCard}>
                <View style={styles.trackHeaderRow}>
                  <Text style={styles.trackTitleText} numberOfLines={2}>
                    💪 {workoutLabel.trim() || 'Workout'}
                  </Text>
                  <View style={styles.trackYnGroup}>
                    <Pressable
                      style={[
                        styles.trackYnBtn,
                        workoutAnswer === 'yes' && styles.trackYnBtnYes,
                      ]}
                      onPress={() => void persistWorkoutAnswer('yes')}
                    >
                      <Text
                        style={[
                          styles.trackYnBtnLabel,
                          workoutAnswer === 'yes' && styles.trackYnBtnLabelOn,
                        ]}
                      >
                        Yes
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.trackYnBtn,
                        workoutAnswer === 'no' && styles.trackYnBtnNoActive,
                      ]}
                      onPress={() => void persistWorkoutAnswer('no')}
                    >
                      <Text
                        style={[
                          styles.trackYnBtnLabel,
                          workoutAnswer === 'no' && styles.trackYnBtnLabelOn,
                        ]}
                      >
                        No
                      </Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={[styles.trackQuestion, styles.trackQuestionSpacing]}>
                  Did you work out today?
                </Text>
              </View>
            ) : null}

            {trackingConfig.includes('water') && waterGoal > 0 ? (
              <View style={styles.trackCard}>
                <Text style={styles.trackWaterHeader}>💧 Water</Text>
                <View style={styles.waterCupsRow}>
                  {Array.from({ length: waterGoal }, (_, i) => {
                    const filled = i < waterCups;
                    return (
                      <Pressable
                        key={`cup-${i}`}
                        style={[
                          styles.waterCup,
                          {
                            width: waterCupSize,
                            height: waterCupSize,
                          },
                          filled ? styles.waterCupFilled : styles.waterCupEmpty,
                        ]}
                        onPress={() => void persistWaterCups(i + 1)}
                      >
                        <Text
                          style={[
                            styles.waterCupEmoji,
                            filled && styles.waterCupEmojiFilled,
                          ]}
                        >
                          💧
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.waterCupsMeta}>
                  {waterCups} of {waterGoal} cups
                </Text>
              </View>
            ) : null}

            {trackingConfig.includes('supplements') &&
            supplementList.some((r) => r.name.trim() || r.timing.trim()) ? (
              <View style={styles.trackCard}>
                <Text style={styles.trackSectionHeading}>💊 Supplements</Text>
                {supplementList
                  .map((row, i) => ({ row, i }))
                  .filter(
                    ({ row }) => row.name.trim() || row.timing.trim()
                  )
                  .map(({ row, i }, idx) => (
                    <View
                      key={`supp-${i}`}
                      style={[
                        styles.suppRowCompact,
                        idx > 0 && styles.suppRowDivider,
                      ]}
                    >
                      <View style={styles.trackHeaderRow}>
                        <Text style={styles.trackQuestion} numberOfLines={2}>
                          {row.name.trim() || 'Supplement'}
                          {row.timing.trim() ? ` · ${row.timing}` : ''}
                        </Text>
                        <View style={styles.trackYnGroup}>
                          <Pressable
                            style={[
                              styles.trackYnBtn,
                              supplementChecks[i] === true && styles.trackYnBtnYes,
                            ]}
                            onPress={() => updateSupplementCheck(i, true)}
                          >
                            <Text
                              style={[
                                styles.trackYnBtnLabel,
                                supplementChecks[i] === true && styles.trackYnBtnLabelOn,
                              ]}
                            >
                              Yes
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.trackYnBtn,
                              supplementChecks[i] === false && styles.trackYnBtnNoActive,
                            ]}
                            onPress={() => updateSupplementCheck(i, false)}
                          >
                            <Text
                              style={[
                                styles.trackYnBtnLabel,
                                supplementChecks[i] === false && styles.trackYnBtnLabelOn,
                              ]}
                            >
                              No
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ))}
              </View>
            ) : null}

            {trackingConfig.includes('custom') &&
            customItems.some((c) => c.label.trim())
              ? customItems.map((item, index) =>
                  item.label.trim() ? (
                    <View key={`custom-${index}`} style={styles.trackCard}>
                      <View style={styles.trackHeaderRow}>
                        <Text style={styles.trackTitleText} numberOfLines={2}>
                          {item.emoji} {item.label}
                        </Text>
                        <View style={styles.trackYnGroup}>
                          <Pressable
                            style={[
                              styles.trackYnBtn,
                              customYesNo[index] === 'yes' && styles.trackYnBtnYes,
                            ]}
                            onPress={() =>
                              void saveCustomCell(index, 'yes', customNotes[index] ?? '')
                            }
                          >
                            <Text
                              style={[
                                styles.trackYnBtnLabel,
                                customYesNo[index] === 'yes' && styles.trackYnBtnLabelOn,
                              ]}
                            >
                              Yes
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.trackYnBtn,
                              customYesNo[index] === 'no' && styles.trackYnBtnNoActive,
                            ]}
                            onPress={() =>
                              void saveCustomCell(index, 'no', customNotes[index] ?? '')
                            }
                          >
                            <Text
                              style={[
                                styles.trackYnBtnLabel,
                                customYesNo[index] === 'no' && styles.trackYnBtnLabelOn,
                              ]}
                            >
                              No
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                      <TextInput
                        style={styles.trackNoteInputCompact}
                        placeholder="Optional note"
                        placeholderTextColor="#9CA3AF"
                        value={customNotes[index] ?? ''}
                        onChangeText={(text) => {
                          setCustomNotes((p) => ({ ...p, [index]: text }));
                          const y = customYesNo[index];
                          void AsyncStorage.setItem(
                            customItemStorageKey(index, getTodayKey()),
                            JSON.stringify({
                              yes:
                                y === 'yes' ? true : y === 'no' ? false : null,
                              note: text,
                            })
                          );
                        }}
                      />
                    </View>
                  ) : null
                )
              : null}

            <View
              collapsable={false}
              onLayout={(e) => {
                journalSectionY.current = e.nativeEvent.layout.y;
              }}
            >
              <Pressable onPress={toggleJournalExpanded} style={styles.journalCard}>
                <View style={styles.journalCardHeader}>
                  <View style={styles.journalHeaderSpacer} />
                  <View style={styles.journalHeaderTextWrap}>
                    <View style={styles.journalTitleRow}>
                      <Text style={styles.journalEmoji}>📝</Text>
                      <Text style={styles.journalTitleText}>How did today feel?</Text>
                    </View>
                    {!journalExpanded && journalText.trim() ? (
                      <Text style={styles.journalPreview} numberOfLines={2}>
                        {journalText.trim()}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.journalHeaderEndSpacer} />
                </View>

                {journalExpanded ? (
                  <View style={styles.journalLogSection}>
                    <TextInput
                      ref={journalInputRef}
                      style={[styles.journalInput, { height: journalInputHeight }]}
                      placeholder="Write a quick note about your day..."
                      placeholderTextColor="#9CA3AF"
                      value={journalText}
                      multiline
                      inputAccessoryViewID={
                        Platform.OS === 'ios' ? JOURNAL_INPUT_ACCESSORY_ID : undefined
                      }
                      onChangeText={(text) => {
                        setJournalText(text);
                        void persistJournal(text);
                      }}
                      onContentSizeChange={(e) => {
                        const next = Math.max(100, Math.ceil(e.nativeEvent.contentSize.height));
                        setJournalInputHeight((prev) => (prev !== next ? next : prev));
                      }}
                    />
                  </View>
                ) : null}
              </Pressable>
            </View>

            {!journalText.trim() ? (
              <Pressable
                style={styles.journalNudgeRow}
                onPress={focusJournalFromNudge}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Text style={styles.journalNudgeText}>
                  📝 Add a journal note for a better review
                </Text>
              </Pressable>
            ) : null}

            {checkinLoading ? (
              <View style={styles.checkinLoadingCard}>
                <Text style={styles.checkinLoadingText}>Reviewing your day...</Text>
              </View>
            ) : null}
            {checkinSaved ? (
              <View style={styles.checkinResponseCard}>
                <View style={styles.checkinCardHeaderRow}>
                  <Text style={styles.checkinCardHeaderTitle} numberOfLines={1}>
                    ✅ Today&apos;s review
                  </Text>
                  <Pressable
                    onPress={() => setCheckinCardExpanded((prev) => !prev)}
                    hitSlop={8}
                  >
                    <Text style={styles.checkinToggleLink}>
                      {checkinCardExpanded ? '▲ Hide' : '▼ Show'}
                    </Text>
                  </Pressable>
                </View>
                {checkinCardExpanded ? (
                  <>
                    <Text style={styles.checkinResponseText}>{checkinSaved.text}</Text>
                    <Text style={styles.checkinFooterTime}>
                      {formatCheckinFooterTime(checkinSaved.checkedInAt)}
                    </Text>
                    <Pressable
                      onPress={() => void runDayCheckin()}
                      hitSlop={8}
                      style={styles.checkinRefreshWrap}
                    >
                      <Text style={styles.checkinRefreshLink}>Refresh</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null}
            <Pressable
              style={[
                styles.checkinReviewButton,
                checkinLoading ? styles.checkinReviewButtonDisabled : undefined,
              ]}
              onPress={() => void runDayCheckin()}
              disabled={checkinLoading}
            >
              <Text style={styles.checkinReviewButtonText}>🤖 Review my Day</Text>
            </Pressable>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <View style={styles.hiddenSummaryRoot} pointerEvents="none">
        {summaryCaptureReady ? (
          <View style={styles.summaryCard} collapsable={false} ref={summaryCaptureRef}>
            <Text style={styles.summaryTitle}>My Nutrition Day</Text>
            <Text style={styles.summaryDate}>
              {new Date().toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>

            <Text style={styles.summaryMeta}>
              Meals completed: {checkedIds.length}/{meals.length}
            </Text>
            <View style={styles.summaryProgressTrack}>
              <View
                style={[
                  styles.summaryProgressFill,
                  { width: `${meals.length > 0 ? (checkedIds.length / meals.length) * 100 : 0}%` },
                ]}
              />
            </View>

            {meals.map((meal) => {
              const done = checkedIds.includes(meal.id);
              const log = summaryLogs[meal.id];
              const note = log?.note?.trim();
              const title = `${meal.emoji} ${meal.title}`.trim();

              return (
                <View key={`summary-${meal.id}`} style={styles.summaryMealRow}>
                  <Text style={styles.summaryMealLine}>
                    {done ? '✅' : '❌'} {title} ({meal.time})
                  </Text>
                  {log?.photoUri ? (
                    <Image source={{ uri: log.photoUri }} style={styles.summaryThumb} />
                  ) : null}
                  {note ? <Text style={styles.summaryNote}>Note: {note}</Text> : null}
                </View>
              );
            })}

            <Text style={styles.summaryFooter}>Water: Not tracked yet</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    paddingTop: 64,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FAFAFA',
  },
  headerTitleBlock: {
    flex: 1,
    marginRight: 8,
  },
  headerRow: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerShareButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#2E2E2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerShareButtonDisabled: {
    opacity: 0.45,
  },
  homeButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeIcon: {
    fontSize: 18,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  progressWrap: {
    marginBottom: 16,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '500',
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#3F3F3F',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: ACCENT,
  },
  listContent: {
    paddingBottom: 20,
  },
  journalCard: {
    backgroundColor: '#2E2E2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    padding: 14,
    marginBottom: 12,
  },
  journalCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  journalHeaderSpacer: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  journalHeaderTextWrap: {
    flex: 1,
  },
  journalHeaderEndSpacer: {
    width: 28,
    height: 28,
    marginLeft: 8,
  },
  journalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  journalEmoji: {
    fontSize: 16,
  },
  journalTitleText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: ACCENT,
  },
  journalPreview: {
    marginTop: 2,
    fontSize: 13,
    color: '#9CA3AF',
  },
  journalNudgeRow: {
    marginBottom: 10,
    paddingVertical: 4,
  },
  journalNudgeText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  journalLogSection: {
    marginTop: 12,
  },
  journalInput: {
    width: '100%',
    minHeight: 100,
    padding: 0,
    margin: 0,
    fontSize: 15,
    lineHeight: 20,
    color: '#FAFAFA',
    textAlignVertical: 'top',
  },
  journalInputAccessory: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#2E2E2E',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3F3F3F',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  journalInputAccessoryDone: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  journalInputAccessoryDoneText: {
    color: ACCENT,
    fontSize: 17,
    fontWeight: '600',
  },
  checkinReviewButton: {
    width: '100%',
    alignSelf: 'stretch',
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinReviewButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  checkinReviewButtonDisabled: {
    opacity: 0.55,
  },
  checkinLoadingCard: {
    width: '100%',
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: '#3F3F3F',
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinLoadingText: {
    color: '#9CA3AF',
    fontSize: 15,
    fontWeight: '600',
  },
  checkinResponseCard: {
    width: '100%',
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: '#2E2E2E',
    borderRadius: 14,
    borderLeftWidth: 3,
    borderLeftColor: ACCENT,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  checkinCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  checkinCardHeaderTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
    color: '#FAFAFA',
  },
  checkinToggleLink: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  checkinResponseText: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 22,
  },
  checkinFooterTime: {
    marginTop: 14,
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  checkinRefreshWrap: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  checkinRefreshLink: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  trackCard: {
    backgroundColor: '#2E2E2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    padding: 14,
    marginBottom: 10,
  },
  trackHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  trackTitleText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
    color: ACCENT,
  },
  trackSectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: ACCENT,
    marginBottom: 8,
  },
  trackWaterHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: ACCENT,
    marginBottom: 8,
  },
  trackQuestion: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FAFAFA',
    flex: 1,
    minWidth: 0,
  },
  trackQuestionSpacing: {
    marginTop: 6,
  },
  trackYnGroup: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
    alignItems: 'center',
  },
  trackYnBtn: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TRACK_BORDER,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackYnBtnYes: {
    backgroundColor: TEAL,
    borderColor: TEAL,
  },
  trackYnBtnNoActive: {
    backgroundColor: '#555555',
    borderColor: '#555555',
  },
  trackYnBtnLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: TRACK_BTN_TEXT_MUTED,
  },
  trackYnBtnLabelOn: {
    color: '#FFFFFF',
  },
  waterCupsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    alignItems: 'center',
    marginBottom: 6,
  },
  waterCup: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterCupFilled: {
    backgroundColor: TEAL,
  },
  waterCupEmpty: {
    backgroundColor: CUP_EMPTY_BG,
  },
  waterCupEmoji: {
    fontSize: 14,
    color: '#888888',
  },
  waterCupEmojiFilled: {
    color: '#FFFFFF',
  },
  waterCupsMeta: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  suppRowCompact: {
    paddingVertical: 6,
  },
  suppRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3F3F3F',
    paddingTop: 8,
    marginTop: 2,
  },
  trackNoteInputCompact: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: TRACK_BORDER,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#FAFAFA',
    backgroundColor: '#252525',
  },
  hiddenSummaryRoot: {
    position: 'absolute',
    left: -9999,
    top: 0,
    width: 360,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#F1C3B2',
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  summaryDate: {
    marginTop: 2,
    fontSize: 12,
    color: '#4B5563',
  },
  summaryMeta: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#8A3A20',
  },
  summaryProgressTrack: {
    marginTop: 8,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  summaryProgressFill: {
    height: '100%',
    backgroundColor: ACCENT,
  },
  summaryMealRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  summaryMealLine: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
  },
  summaryThumb: {
    marginTop: 6,
    width: 84,
    height: 84,
    borderRadius: 8,
  },
  summaryNote: {
    marginTop: 5,
    color: '#374151',
    fontSize: 12,
  },
  summaryFooter: {
    marginTop: 14,
    color: '#4B5563',
    fontSize: 12,
  },
});
