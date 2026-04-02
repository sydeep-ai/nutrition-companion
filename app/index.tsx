import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import MealCard, { MealCardLog } from '../components/MealCard';
import { DEFAULT_MEAL_PLAN, PlanMeal } from '../data/defaultMealPlan';

const ACCENT = '#D85A30';
const STORAGE_KEY = 'today_tick_state_v1';
const MEAL_LOGS_STORAGE_KEY = 'meal_logs_v1';
const MEAL_PLAN_STORAGE_KEY = 'meal_plan';

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

type Props = {
  onPressHome?: () => void;
};

export default function TodayScreen({ onPressHome }: Props) {
  const summaryCaptureRef = useRef<View>(null);
  const [meals, setMeals] = useState<PlanMeal[]>(DEFAULT_MEAL_PLAN);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mealLogs, setMealLogs] = useState<MealLogsState>({});
  const [userName, setUserName] = useState('');
  const [summaryLogs, setSummaryLogs] = useState<MealLogsState>({});
  const [isSharing, setIsSharing] = useState(false);
  const [summaryCaptureReady, setSummaryCaptureReady] = useState(false);

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
      const parsed = JSON.parse(raw) as PlanMeal[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setMeals(parsed);
      } else {
        setMeals(DEFAULT_MEAL_PLAN);
      }
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

  useEffect(() => {
    loadState();
    loadMealLogs();
    loadMealPlan();
  }, [loadState, loadMealLogs, loadMealPlan]);

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

  const progress = useMemo(
    () => (meals.length > 0 ? checkedIds.length / meals.length : 0),
    [checkedIds.length, meals.length]
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
        <Text style={styles.title}>Today</Text>
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

      <View style={styles.progressWrap}>
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>Meals logged</Text>
          <Text style={styles.progressText}>
            {checkedIds.length}/{meals.length}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {meals.map((meal) => {
          const checked = checkedIds.includes(meal.id);
          const expanded = expandedId === meal.id;
          const log = mealLogs[meal.id];
          const title = `${meal.emoji} ${meal.name}`.trim();

          return (
            <MealCard
              key={meal.id}
              id={meal.id}
              title={title}
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

        <Pressable style={styles.shareButton} onPress={() => void handleShareDay()}>
          <Text style={styles.shareButtonText}>Share My Day</Text>
        </Pressable>
      </ScrollView>

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
              const title = `${meal.emoji} ${meal.name}`.trim();

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
  headerRow: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  homeButton: {
    width: 36,
    height: 36,
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
  shareButton: {
    width: '100%',
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
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
