import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { plan1 } from '../data/plan1';
import MealCard, { MealCardLog } from '../components/MealCard';

const ACCENT = '#1D9E75';
const STORAGE_KEY = 'today_tick_state_v1';
const MEAL_LOGS_STORAGE_KEY = 'meal_logs_v1';

type TickState = {
  date: string;
  checkedIds: string[];
};

type MealLogsState = {
  [mealId: string]: MealCardLog;
};

const getTodayKey = () => new Date().toISOString().slice(0, 10);

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function TodayScreen() {
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mealLogs, setMealLogs] = useState<MealLogsState>({});

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

  const persistMealLogs = useCallback(async (logs: MealLogsState) => {
    try {
      await AsyncStorage.setItem(MEAL_LOGS_STORAGE_KEY, JSON.stringify(logs));
    } catch {
      // ignore transient persistence failures
    }
  }, []);

  useEffect(() => {
    loadState();
    loadMealLogs();
  }, [loadState, loadMealLogs]);

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
    }, msUntilMidnight);

    return () => clearTimeout(timer);
  }, [persistState]);

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
  };

  const progress = useMemo(() => checkedIds.length / plan1.length, [checkedIds.length]);

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

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Today</Text>

      <View style={styles.progressWrap}>
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>Meals logged</Text>
          <Text style={styles.progressText}>
            {checkedIds.length}/{plan1.length}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {plan1.map((meal) => {
          const checked = checkedIds.includes(meal.id);
          const expanded = expandedId === meal.id;
          const log = mealLogs[meal.id];

          return (
            <MealCard
              key={meal.id}
              id={meal.id}
              title={meal.title}
              time={meal.time}
              details={meal.details}
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
              onChangeNote={(text) =>
                updateMealLog(meal.id, {
                  note: text,
                })
              }
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F7F6',
    paddingTop: 64,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
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
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '500',
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: ACCENT,
  },
  listContent: {
    paddingBottom: 20,
  },
});
