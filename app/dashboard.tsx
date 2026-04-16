import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FONT_BODY, FONT_SEMIBOLD, FONT_BOLD, FONT_EXTRA } from '../constants/fonts';
import {
  DEFAULT_MEAL_PLAN,
  parseMealPlanFromStorage,
  PlanMeal,
} from '../data/defaultMealPlan';
import { calculateStreak, computePlanDayFromPlanStart, parseMealTicks } from '../services/storage';

const ACCENT = '#D85A30';
const SURFACE = '#2E2E2E';
const BG = '#1A1A1A';
const TEXT_PRIMARY = '#FAFAFA';
const TEXT_SECONDARY = '#F0997B';
const COMPLETION = '#1D9E75';
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

const TRACKING_GRID_ITEMS: { id: TrackingId; emoji: string; label: string }[] = [
  { id: 'meals', emoji: '🍽️', label: 'Meals' },
  { id: 'steps', emoji: '👟', label: 'Steps' },
  { id: 'workout', emoji: '💪', label: 'Workout' },
  { id: 'water', emoji: '💧', label: 'Water' },
  { id: 'supplements', emoji: '💊', label: 'Supplements' },
  { id: 'custom', emoji: '⭐', label: 'Custom' },
];

const CUSTOM_ITEM_EMOJI_CYCLE = ['⭐', '🧘', '🚴', '📚', '🎯', '🌿'] as const;

type SupplementRow = { name: string; timing: string };

type CustomItemRow = { label: string; emoji: string };

function isTrackingId(s: string): s is TrackingId {
  return (TRACKING_ORDER as readonly string[]).includes(s);
}

function parseTrackingConfigForEdit(raw: string | null): TrackingId[] {
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

const REWARD_NAME_STORAGE_KEY = 'reward_name';
const REWARD_PHOTO_STORAGE_KEY = 'reward_photo';
const VISION_PHOTOS_KEY = 'vision_photos';
const VISION_SLOTS = 5;

type Props = {
  onStartToday: () => void;
  openEditPlanRef: React.MutableRefObject<(() => void) | null>;
  refreshKey?: number;
};

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const MEAL_TYPE_PRESETS = [
  { emoji: '🌅', title: 'Morning Ritual' },
  { emoji: '🍳', title: 'Breakfast' },
  { emoji: '🥗', title: 'Lunch' },
  { emoji: '🍎', title: 'Snack' },
  { emoji: '🍽️', title: 'Dinner' },
  { emoji: '💊', title: 'Supplement' },
] as const;

const CUSTOM_MEAL_EMOJI = '⭐';
const MEAL_TYPE_DEFAULT_BUTTON_LABEL = '🍽️ Meal';

function mealMatchesPreset(emoji: string, title: string): boolean {
  return MEAL_TYPE_PRESETS.some((p) => p.emoji === emoji && p.title === title);
}

function mealTypeDropdownLabel(meal: PlanMeal): string {
  if (!meal.title.trim()) {
    return MEAL_TYPE_DEFAULT_BUTTON_LABEL;
  }
  return `${meal.emoji} ${meal.title}`.trim();
}

function parseWaterCupsDay(raw: string | null): number {
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

function parseYesNoStored(raw: string | null): boolean | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw === 'yes' || raw === 'true' || raw === '1') return true;
  if (raw === 'no' || raw === 'false' || raw === '0') return false;
  return null;
}

type VisionBoardSlotProps = {
  uri: string;
  size: number;
  onPick: () => void;
  onDelete: () => void;
};

function VisionBoardSlot({ uri, size, onPick, onDelete }: VisionBoardSlotProps) {
  const slotFrame = [styles.visionBoardSlotFrame, { width: size, height: size }];
  if (uri) {
    return (
      <View style={slotFrame}>
        <Image source={{ uri }} style={styles.visionBoardSlotImage} />
        <Pressable
          style={styles.visionBoardDeleteBtn}
          onPress={onDelete}
          hitSlop={6}
        >
          <Text style={styles.visionBoardDeleteEmoji}>🗑️</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable style={[slotFrame, styles.visionBoardSlotEmpty]} onPress={onPick}>
      <Text style={styles.visionBoardPlus}>+</Text>
    </Pressable>
  );
}

export default function DashboardScreen({
  onStartToday,
  openEditPlanRef,
  refreshKey = 0,
}: Props) {
  const screenWidth = Dimensions.get('window').width;
  const visionCardWidth = Math.floor(screenWidth * 0.85);
  const visionCardGap = 10;
  const visionScrollRef = useRef<ScrollView>(null);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [userName, setUserName] = useState('');
  const [goalText, setGoalText] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [visionPhotos, setVisionPhotos] = useState<string[]>([]);
  const [targetDays, setTargetDays] = useState(30);
  const [planStartDate, setPlanStartDate] = useState<string>('');
  const [dashboardTracking, setDashboardTracking] = useState<TrackingId[]>(['meals']);
  const [glanceMealsDone, setGlanceMealsDone] = useState(0);
  const [glanceMealsTotal, setGlanceMealsTotal] = useState(0);
  const [glanceStepsYes, setGlanceStepsYes] = useState<boolean | null>(null);
  const [glanceWorkoutYes, setGlanceWorkoutYes] = useState<boolean | null>(null);
  const [glanceWaterCups, setGlanceWaterCups] = useState(0);
  const [glanceWaterGoal, setGlanceWaterGoal] = useState(8);
  const [glanceSupplementsOk, setGlanceSupplementsOk] = useState<boolean | null>(null);
  const [glanceCustomOk, setGlanceCustomOk] = useState<boolean[]>([]);
  const [glanceCustomLabels, setGlanceCustomLabels] = useState<{ emoji: string; label: string }[]>(
    []
  );
  const [streakDays, setStreakDays] = useState(0);
  const [visionIndex, setVisionIndex] = useState(0);
  const [mealPlan, setMealPlan] = useState<PlanMeal[]>(DEFAULT_MEAL_PLAN);
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [editTargetDays, setEditTargetDays] = useState('30');
  const [editStartDate, setEditStartDate] = useState('');
  const [editMeals, setEditMeals] = useState<PlanMeal[]>(DEFAULT_MEAL_PLAN);
  const [mealTypePickerIndex, setMealTypePickerIndex] = useState<number | null>(null);
  const [mealTypePickerCustom, setMealTypePickerCustom] = useState(false);
  const [mealTypeCustomDraft, setMealTypeCustomDraft] = useState('');
  const [editTrackingSelected, setEditTrackingSelected] = useState<TrackingId[]>(['meals']);
  const [editStepsGoal, setEditStepsGoal] = useState('10000');
  const [editWorkoutLabel, setEditWorkoutLabel] = useState('');
  const [editWaterGoal, setEditWaterGoal] = useState('8');
  const [editCustomItems, setEditCustomItems] = useState<CustomItemRow[]>([
    { label: '', emoji: '⭐' },
  ]);
  const [rewardName, setRewardName] = useState('');
  const [rewardPhoto, setRewardPhoto] = useState('');
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [rewardNameDraft, setRewardNameDraft] = useState('');
  const [showVisionBoardModal, setShowVisionBoardModal] = useState(false);
  const [visionEditSlots, setVisionEditSlots] = useState<string[]>(() =>
    Array.from({ length: VISION_SLOTS }, () => '')
  );

  useEffect(() => {
    const loadDashboardData = async () => {
      const [
        userNameRaw,
        userGoal,
        visionRaw,
        targetRaw,
        startRaw,
        mealPlanRaw,
        rewardNameRaw,
        rewardPhotoRaw,
      ] = await Promise.all([
        AsyncStorage.getItem('user_name'),
        AsyncStorage.getItem('user_goal'),
        AsyncStorage.getItem(VISION_PHOTOS_KEY),
        AsyncStorage.getItem('target_days'),
        AsyncStorage.getItem('plan_start_date'),
        AsyncStorage.getItem(MEAL_PLAN_STORAGE_KEY),
        AsyncStorage.getItem(REWARD_NAME_STORAGE_KEY),
        AsyncStorage.getItem(REWARD_PHOTO_STORAGE_KEY),
      ]);

      setUserName(userNameRaw?.trim() || 'friend');
      setGoalText(userGoal?.trim() || 'Your best self');
      setGoalDraft(userGoal?.trim() || '');

      try {
        const parsed = visionRaw ? (JSON.parse(visionRaw) as string[]) : [];
        setVisionPhotos(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
      } catch {
        setVisionPhotos([]);
      }

      const parsedTarget = Number(targetRaw);
      if (Number.isFinite(parsedTarget) && parsedTarget > 0) {
        setTargetDays(Math.floor(parsedTarget));
        setEditTargetDays(String(Math.floor(parsedTarget)));
      }

      setPlanStartDate(startRaw || '');
      setEditStartDate(formatDateForInput(startRaw || ''));

      const mealsNorm = parseMealPlanFromStorage(mealPlanRaw);
      setMealPlan(mealsNorm);

      const today = getTodayKey();
      const [
        tcRaw,
        mealTicksRaw,
        stepsRaw,
        workoutRaw,
        waterCupsRaw,
        waterGoalRaw,
        supListRaw,
        supStateRaw,
        customItemsRaw,
      ] = await Promise.all([
        AsyncStorage.getItem(TRACKING_CONFIG_KEY),
        AsyncStorage.getItem(`meal_ticks_${today}`),
        AsyncStorage.getItem(`steps_${today}`),
        AsyncStorage.getItem(`workout_${today}`),
        AsyncStorage.getItem(`water_cups_${today}`),
        AsyncStorage.getItem(WATER_GOAL_KEY),
        AsyncStorage.getItem(SUPPLEMENT_LIST_KEY),
        AsyncStorage.getItem(`supplements_${today}`),
        AsyncStorage.getItem(CUSTOM_ITEMS_KEY),
      ]);

      setDashboardTracking(parseTrackingConfigForEdit(tcRaw));

      const ticks = parseMealTicks(mealTicksRaw);
      const totalMeals = ticks?.total ?? Math.max(0, mealsNorm.length);
      const rawDone = ticks?.done ?? 0;
      setGlanceMealsTotal(totalMeals);
      setGlanceMealsDone(Math.min(rawDone, totalMeals));

      setGlanceStepsYes(parseYesNoStored(stepsRaw));
      setGlanceWorkoutYes(parseYesNoStored(workoutRaw));
      setGlanceWaterCups(parseWaterCupsDay(waterCupsRaw));
      const wg = Number(waterGoalRaw);
      setGlanceWaterGoal(
        waterGoalRaw != null && waterGoalRaw !== '' && Number.isFinite(wg) && wg > 0
          ? Math.floor(wg)
          : 8
      );

      let supListParsed: SupplementRow[] = [];
      try {
        const p = supListRaw ? (JSON.parse(supListRaw) as SupplementRow[]) : [];
        supListParsed = Array.isArray(p)
          ? p.map((r) => ({
              name: String(r?.name ?? ''),
              timing: String(r?.timing ?? ''),
            }))
          : [];
      } catch {
        supListParsed = [];
      }
      const activeSupp = supListParsed.filter((r) => r.name.trim() || r.timing.trim());
      let suppOk: boolean | null = null;
      if (activeSupp.length === 0) {
        suppOk = null;
      } else {
        try {
          const doneObj = supStateRaw
            ? (JSON.parse(supStateRaw) as Record<string, boolean>)
            : {};
          suppOk = activeSupp.every((_, i) => doneObj[String(i)] === true);
        } catch {
          suppOk = false;
        }
      }
      setGlanceSupplementsOk(suppOk);

      let customParsed: CustomItemRow[] = [];
      try {
        const c = customItemsRaw ? (JSON.parse(customItemsRaw) as CustomItemRow[]) : [];
        customParsed = Array.isArray(c)
          ? c.map((r) => ({
              label: String(r?.label ?? ''),
              emoji: String(r?.emoji ?? '⭐'),
            }))
          : [];
      } catch {
        customParsed = [];
      }
      setGlanceCustomLabels(customParsed);
      const customFlags = await Promise.all(
        customParsed.map(async (_, i) => {
          const raw = await AsyncStorage.getItem(`custom_${i}_${today}`);
          if (!raw) return false;
          try {
            const j = JSON.parse(raw) as { yes?: boolean };
            return j?.yes === true;
          } catch {
            return raw === 'yes' || raw === 'true';
          }
        })
      );
      setGlanceCustomOk(customFlags);

      setStreakDays(await calculateStreak());

      setRewardName(rewardNameRaw?.trim() || '');
      setRewardPhoto(rewardPhotoRaw?.trim() || '');
    };

    void loadDashboardData();
  }, [refreshKey]);

  useEffect(() => {
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
    if (visionPhotos.length <= 1) return;

    autoPlayRef.current = setInterval(() => {
      setVisionIndex((prev) => {
        const next = (prev + 1) % visionPhotos.length;
        visionScrollRef.current?.scrollTo({
          x: next * (visionCardWidth + visionCardGap),
          animated: true,
        });
        return next;
      });
    }, 2000);

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
    };
  }, [visionPhotos.length, visionCardWidth, visionCardGap]);

  const dayCounter = useMemo(
    () => computePlanDayFromPlanStart(planStartDate || null),
    [planStartDate]
  );

  const formatDateForInput = (raw: string) => {
    if (!raw) {
      return '';
    }
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const parseDateInput = (value: string) => {
    const parts = value.trim().split('/');
    if (parts.length !== 3) {
      return null;
    }
    const dd = Number(parts[0]);
    const mm = Number(parts[1]);
    const yyyy = Number(parts[2]);
    if (!dd || !mm || !yyyy) {
      return null;
    }
    const date = new Date(yyyy, mm - 1, dd);
    if (
      Number.isNaN(date.getTime()) ||
      date.getDate() !== dd ||
      date.getMonth() !== mm - 1 ||
      date.getFullYear() !== yyyy
    ) {
      return null;
    }
    return date.toISOString();
  };

  const saveGoal = async () => {
    const nextGoal = goalDraft.trim() || 'Your best self';
    setGoalText(nextGoal);
    setEditingGoal(false);
    await AsyncStorage.setItem('user_goal', nextGoal);
  };

  const padVisionSlotsFromStorage = (raw: string | null): string[] => {
    let arr: string[] = [];
    try {
      arr = raw ? (JSON.parse(raw) as string[]) : [];
      if (!Array.isArray(arr)) arr = [];
    } catch {
      arr = [];
    }
    return Array.from({ length: VISION_SLOTS }, (_, i) => (arr[i] || '').trim());
  };

  const persistVisionSlots = async (slots: string[]) => {
    const normalized = Array.from({ length: VISION_SLOTS }, (_, i) => (slots[i] || '').trim());
    const filtered = normalized.filter(Boolean);
    setVisionEditSlots(normalized);
    setVisionPhotos(filtered);
    setVisionIndex((prev) => (filtered.length === 0 ? 0 : Math.min(prev, filtered.length - 1)));
    await AsyncStorage.setItem(VISION_PHOTOS_KEY, JSON.stringify(filtered));
  };

  const openVisionBoardModal = async () => {
    const visionRaw = await AsyncStorage.getItem(VISION_PHOTOS_KEY);
    setVisionEditSlots(padVisionSlotsFromStorage(visionRaw));
    setShowVisionBoardModal(true);
  };

  const pickVisionSlot = async (slotIndex: number) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(
        'Photo access needed',
        'Please enable Photos permission in Settings to add vision images.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;
    const uri = result.assets[0]?.uri;
    if (!uri) return;

    const next = [...visionEditSlots];
    next[slotIndex] = uri;
    await persistVisionSlots(next);
  };

  const deleteVisionSlot = (slotIndex: number) => {
    const next = [...visionEditSlots];
    next[slotIndex] = '';
    void persistVisionSlots(next);
  };

  const visionModalSlotSide = useMemo(() => {
    const w = Dimensions.get('window').width;
    const pad = 16;
    const gap = 10;
    return (w - pad * 2 - gap) / 2;
  }, [screenWidth]);

  const scrollToVisionIndex = (index: number) => {
    const bounded = Math.max(0, Math.min(index, Math.max(visionPhotos.length - 1, 0)));
    setVisionIndex(bounded);
    visionScrollRef.current?.scrollTo({
      x: bounded * (visionCardWidth + visionCardGap),
      animated: true,
    });
  };

  const openEditPlanModal = async () => {
    const [
      targetRaw,
      startRaw,
      mealRaw,
      tcRaw,
      stepsRaw,
      workoutRaw,
      waterRaw,
      customRaw,
    ] = await Promise.all([
      AsyncStorage.getItem('target_days'),
      AsyncStorage.getItem('plan_start_date'),
      AsyncStorage.getItem(MEAL_PLAN_STORAGE_KEY),
      AsyncStorage.getItem(TRACKING_CONFIG_KEY),
      AsyncStorage.getItem(STEPS_GOAL_KEY),
      AsyncStorage.getItem(WORKOUT_LABEL_KEY),
      AsyncStorage.getItem(WATER_GOAL_KEY),
      AsyncStorage.getItem(CUSTOM_ITEMS_KEY),
    ]);

    const parsedTarget = Number(targetRaw);
    if (Number.isFinite(parsedTarget) && parsedTarget > 0) {
      setEditTargetDays(String(Math.floor(parsedTarget)));
    } else {
      setEditTargetDays(String(targetDays));
    }
    setEditStartDate(formatDateForInput(startRaw || planStartDate));
    setEditMeals(parseMealPlanFromStorage(mealRaw));
    setEditTrackingSelected(parseTrackingConfigForEdit(tcRaw));
    const stepsN = Number(stepsRaw);
    setEditStepsGoal(
      stepsRaw != null && stepsRaw !== '' && Number.isFinite(stepsN) && stepsN > 0
        ? String(Math.floor(stepsN))
        : '10000'
    );
    setEditWorkoutLabel(workoutRaw?.trim() ?? '');
    const waterN = Number(waterRaw);
    setEditWaterGoal(
      waterRaw != null && waterRaw !== '' && Number.isFinite(waterN) && waterN > 0
        ? String(Math.floor(waterN))
        : '8'
    );
    try {
      const ci = customRaw ? (JSON.parse(customRaw) as CustomItemRow[]) : [];
      setEditCustomItems(
        Array.isArray(ci) && ci.length > 0
          ? ci.map((r) => ({
              label: String(r?.label ?? ''),
              emoji: String(r?.emoji ?? '⭐'),
            }))
          : [{ label: '', emoji: '⭐' }]
      );
    } catch {
      setEditCustomItems([{ label: '', emoji: '⭐' }]);
    }
    setShowEditPlanModal(true);
  };

  const toggleEditTracking = (id: TrackingId) => {
    setEditTrackingSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      const nextSet = new Set([...prev, id]);
      return TRACKING_ORDER.filter((tid) => nextSet.has(tid));
    });
  };

  const updateMealField = (idx: number, field: keyof PlanMeal, value: string) => {
    setEditMeals((prev) =>
      prev.map((meal, mealIdx) => (mealIdx === idx ? { ...meal, [field]: value } : meal))
    );
  };

  const closeMealTypePicker = () => {
    setMealTypePickerIndex(null);
    setMealTypePickerCustom(false);
    setMealTypeCustomDraft('');
  };

  const showIosMealTypeActionSheet = (idx: number) => {
    const m = editMeals[idx];
    if (!m) return;
    const defaultCustom =
      m.title.trim() !== '' && !mealMatchesPreset(m.emoji, m.title) ? m.title : '';

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          'Morning Ritual',
          'Breakfast',
          'Lunch',
          'Snack',
          'Dinner',
          'Supplement',
          'Custom',
          'Cancel',
        ],
        cancelButtonIndex: 7,
        userInterfaceStyle: 'dark',
      },
      (buttonIndex) => {
        if (buttonIndex === undefined || buttonIndex === 7) return;
        if (buttonIndex === 6) {
          Alert.prompt(
            'Custom meal',
            'Enter a name for this meal',
            (text) => {
              const t = (text ?? '').trim();
              if (!t) {
                Alert.alert('Custom name', 'Please enter a meal name.');
                return;
              }
              setEditMeals((prev) =>
                prev.map((meal, i) =>
                  i === idx ? { ...meal, emoji: CUSTOM_MEAL_EMOJI, title: t } : meal
                )
              );
            },
            'plain-text',
            defaultCustom
          );
          return;
        }
        const preset = MEAL_TYPE_PRESETS[buttonIndex];
        if (!preset) return;
        setEditMeals((prev) =>
          prev.map((meal, i) =>
            i === idx ? { ...meal, emoji: preset.emoji, title: preset.title } : meal
          )
        );
      }
    );
  };

  const openMealTypePicker = (index: number) => {
    const m = editMeals[index];
    if (!m) return;
    if (Platform.OS === 'ios') {
      showIosMealTypeActionSheet(index);
      return;
    }
    const matchesPreset = mealMatchesPreset(m.emoji, m.title);
    const isCustom = m.title.trim() !== '' && !matchesPreset;
    setMealTypePickerIndex(index);
    setMealTypePickerCustom(isCustom);
    setMealTypeCustomDraft(isCustom ? m.title : '');
  };

  const applyMealPresetDashboard = (emoji: string, title: string) => {
    const idx = mealTypePickerIndex;
    if (idx === null) return;
    setEditMeals((prev) =>
      prev.map((meal, i) => (i === idx ? { ...meal, emoji, title } : meal))
    );
    closeMealTypePicker();
  };

  const applyMealCustomDashboard = () => {
    const t = mealTypeCustomDraft.trim();
    if (!t) {
      Alert.alert('Custom name', 'Please enter a meal name.');
      return;
    }
    const idx = mealTypePickerIndex;
    if (idx === null) return;
    setEditMeals((prev) =>
      prev.map((meal, i) =>
        i === idx ? { ...meal, emoji: CUSTOM_MEAL_EMOJI, title: t } : meal
      )
    );
    closeMealTypePicker();
  };

  const cycleEditCustomEmoji = (idx: number) => {
    setEditCustomItems((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const ix = CUSTOM_ITEM_EMOJI_CYCLE.findIndex((e) => e === r.emoji);
        const nextIndex = ix >= 0 ? (ix + 1) % CUSTOM_ITEM_EMOJI_CYCLE.length : 0;
        return { ...r, emoji: CUSTOM_ITEM_EMOJI_CYCLE[nextIndex] };
      })
    );
  };

  const closeEditPlanModal = () => {
    closeMealTypePicker();
    setShowEditPlanModal(false);
  };

  const savePlanEdits = async () => {
    const parsedTarget = Number(editTargetDays);
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      Alert.alert('Invalid target days', 'Please enter a valid number of days.');
      return;
    }
    const isoStartDate = parseDateInput(editStartDate);
    if (!isoStartDate) {
      Alert.alert('Invalid date', 'Please use DD/MM/YYYY format for plan start date.');
      return;
    }

    const ordered = editTrackingSelected;
    if (ordered.length === 0) {
      Alert.alert('Tracking', 'Select at least one thing to track.');
      return;
    }

    if (ordered.includes('steps')) {
      const n = Number(editStepsGoal);
      if (!Number.isFinite(n) || n <= 0) {
        Alert.alert('Invalid steps goal', 'Please enter a positive daily steps goal.');
        return;
      }
    }
    if (ordered.includes('water')) {
      const w = Number(editWaterGoal);
      if (!Number.isFinite(w) || w <= 0) {
        Alert.alert('Invalid water goal', 'Please enter a positive number of cups per day.');
        return;
      }
    }

    if (ordered.includes('meals') && editMeals.some((m) => !m.title.trim())) {
      Alert.alert('Meals', 'Choose a meal type for every meal slot.');
      return;
    }

    const pairs: [string, string][] = [
      ['target_days', String(Math.floor(parsedTarget))],
      ['plan_start_date', isoStartDate],
      [TRACKING_CONFIG_KEY, JSON.stringify(ordered)],
    ];

    if (ordered.includes('meals')) {
      pairs.push([MEAL_PLAN_STORAGE_KEY, JSON.stringify(editMeals)]);
    } else {
      pairs.push([MEAL_PLAN_STORAGE_KEY, JSON.stringify([])]);
    }

    if (ordered.includes('steps')) {
      pairs.push([STEPS_GOAL_KEY, String(Math.floor(Number(editStepsGoal)))]);
    }
    if (ordered.includes('workout')) {
      pairs.push([WORKOUT_LABEL_KEY, editWorkoutLabel.trim()]);
    }
    if (ordered.includes('water')) {
      pairs.push([WATER_GOAL_KEY, String(Math.floor(Number(editWaterGoal)))]);
    }
    if (ordered.includes('supplements')) {
      pairs.push([SUPPLEMENT_LIST_KEY, JSON.stringify([])]);
    }
    if (ordered.includes('custom')) {
      const items = editCustomItems
        .filter((c) => c.label.trim())
        .map((c) => ({ label: c.label.trim(), emoji: c.emoji }));
      pairs.push([CUSTOM_ITEMS_KEY, JSON.stringify(items)]);
    }

    const removeKeys: string[] = [];
    if (!ordered.includes('steps')) removeKeys.push(STEPS_GOAL_KEY);
    if (!ordered.includes('workout')) removeKeys.push(WORKOUT_LABEL_KEY);
    if (!ordered.includes('water')) removeKeys.push(WATER_GOAL_KEY);
    if (!ordered.includes('supplements')) removeKeys.push(SUPPLEMENT_LIST_KEY);
    if (!ordered.includes('custom')) removeKeys.push(CUSTOM_ITEMS_KEY);

    await AsyncStorage.multiSet(pairs);
    if (removeKeys.length > 0) {
      await AsyncStorage.multiRemove(removeKeys);
    }

    setTargetDays(Math.floor(parsedTarget));
    setPlanStartDate(isoStartDate);
    setMealPlan(ordered.includes('meals') ? editMeals : []);
    setDashboardTracking(ordered);
    setShowEditPlanModal(false);
  };

  const dayProgress = useMemo(() => {
    const percent = Math.min(100, Math.max(0, Math.round((dayCounter / Math.max(1, targetDays)) * 100)));
    return percent;
  }, [dayCounter, targetDays]);

  const openRewardModal = () => {
    setRewardNameDraft(rewardName);
    setShowRewardModal(true);
  };

  const pickRewardPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Photo access needed', 'Please enable Photos permission in Settings to add reward photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) return;
    const uri = result.assets[0]?.uri;
    if (!uri) return;
    setRewardPhoto(uri);
  };

  const saveReward = async () => {
    const nextName = rewardNameDraft.trim();
    setRewardName(nextName);
    await AsyncStorage.multiSet([
      [REWARD_NAME_STORAGE_KEY, nextName],
      [REWARD_PHOTO_STORAGE_KEY, rewardPhoto],
    ]);
    setShowRewardModal(false);
  };

  const openPlanFnRef = useRef(openEditPlanModal);
  openPlanFnRef.current = openEditPlanModal;

  useEffect(() => {
    openEditPlanRef.current = () => {
      void openPlanFnRef.current();
    };
  }, [openEditPlanRef]);

  return (
    <View style={styles.screen}>
      <View style={styles.mainFill}>
      <View style={styles.headerSection}>
        <Text style={styles.greeting}>Hey {userName}! 👋</Text>
        <View style={styles.goalRow}>
        {editingGoal ? (
          <TextInput
            value={goalDraft}
            onChangeText={setGoalDraft}
            placeholder="Update your goal"
            placeholderTextColor="#9CA3AF"
            style={styles.goalInput}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void saveGoal()}
          />
        ) : (
          <Text style={styles.goalHeadlineWrap}>
            <Text style={styles.goalLabel}>Goal: </Text>
            <Text style={styles.goalHeadline}>{goalText}</Text>
          </Text>
        )}
        {editingGoal ? (
          <Pressable style={styles.editButton} onPress={() => void saveGoal()}>
            <Text style={styles.editButtonText}>Done</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.editButton}
            onPress={() => {
              setGoalDraft(goalText);
              setEditingGoal(true);
            }}
          >
            <Text style={styles.editIcon}>✏️</Text>
          </Pressable>
        )}
        </View>
      </View>

      <View style={styles.visionWrap}>
        <Pressable
          style={[styles.editButton, styles.visionEditButtonOverlay]}
          onPress={() => void openVisionBoardModal()}
        >
          <Text style={styles.editIcon}>✏️</Text>
        </Pressable>
        {visionPhotos.length > 0 ? (
          <View>
            <ScrollView
              ref={visionScrollRef}
              horizontal
              decelerationRate="fast"
              snapToInterval={visionCardWidth + visionCardGap}
              snapToAlignment="start"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.visionScrollContent}
              onMomentumScrollEnd={(e) => {
                const next = Math.round(
                  e.nativeEvent.contentOffset.x / (visionCardWidth + visionCardGap)
                );
                setVisionIndex(next);
              }}
            >
            {visionPhotos.map((uri, index) => (
                <View
                  key={`vision-${index}`}
                  style={[
                    styles.visionCard,
                    { width: visionCardWidth, marginRight: visionCardGap },
                  ]}
                >
                  <Image source={{ uri }} style={styles.visionPhoto} />
                </View>
            ))}
            </ScrollView>

            <Pressable
              style={[styles.chevronButton, styles.chevronLeft]}
              onPress={() => scrollToVisionIndex(visionIndex - 1)}
            >
              <Text style={styles.chevronText}>‹</Text>
            </Pressable>
            <Pressable
              style={[styles.chevronButton, styles.chevronRight]}
              onPress={() => scrollToVisionIndex(visionIndex + 1)}
            >
              <Text style={styles.chevronText}>›</Text>
            </Pressable>

            <View style={styles.dotsRow}>
              {visionPhotos.map((_, index) => (
                <View
                  key={`dot-${index}`}
                  style={[styles.dot, index === visionIndex && styles.dotActive]}
                />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderEmoji}>📷</Text>
            <Text style={styles.placeholderText}>Tap ✏️ to add your vision board photos</Text>
          </View>
        )}
      </View>

      <Pressable style={styles.rewardSection} onPress={openRewardModal}>
        <Text style={styles.rewardTitle}>🎯 Your Reward</Text>
        <Text
          style={rewardName ? styles.rewardNameText : styles.rewardNamePlaceholder}
        >
          {rewardName ? rewardName : 'Tap to set your reward →'}
        </Text>
        <View style={styles.rewardProgressWrap}>
          <View style={styles.rewardTrack}>
            <View style={[styles.rewardFill, { width: `${dayProgress}%` }]} />
          </View>
          <View style={styles.rewardEndMarker}>
            {rewardPhoto ? (
              <Image source={{ uri: rewardPhoto }} style={styles.rewardImage} />
            ) : (
              <Text style={styles.rewardEmoji}>🎁</Text>
            )}
          </View>
        </View>
        <Text style={styles.rewardMeta}>
          {dayCounter} of {targetDays} days · {dayProgress}% there
        </Text>
      </Pressable>
      </View>

      <View style={styles.dashboardFooter}>
        <View style={styles.dayCounterRow}>
          <Text style={styles.dayCounter}>Day {dayCounter} of {targetDays}</Text>
        </View>

        <Text style={styles.sectionTitle}>Today at a glance</Text>
        <View style={styles.footerStatsWrap}>
          {dashboardTracking.includes('meals') ? (
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>🍽️</Text>
              <Text style={styles.statValue}>
                {glanceMealsDone}/{glanceMealsTotal}
              </Text>
            </View>
          ) : null}
          {dashboardTracking.includes('steps') ? (
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>👟</Text>
              <Text style={styles.statValue}>{glanceStepsYes === true ? '✅' : '❌'}</Text>
            </View>
          ) : null}
          {dashboardTracking.includes('workout') ? (
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>💪</Text>
              <Text style={styles.statValue}>{glanceWorkoutYes === true ? '✅' : '❌'}</Text>
            </View>
          ) : null}
          {dashboardTracking.includes('water') ? (
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>💧</Text>
              <Text style={styles.statValue}>
                {glanceWaterCups}/{glanceWaterGoal}
              </Text>
            </View>
          ) : null}
          {dashboardTracking.includes('supplements') ? (
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>💊</Text>
              <Text style={styles.statValue}>
                {glanceSupplementsOk === null
                  ? '—'
                  : glanceSupplementsOk
                    ? '✅'
                    : '❌'}
              </Text>
            </View>
          ) : null}
          {dashboardTracking.includes('custom')
            ? glanceCustomLabels.map((c, i) => (
                <View key={`glance-custom-${i}`} style={styles.statCard}>
                  <Text style={styles.statLabel}>{c.emoji}</Text>
                  <Text style={styles.statValue} numberOfLines={1}>
                    {glanceCustomOk[i] ? '✅' : '❌'}
                  </Text>
                </View>
              ))
            : null}
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>🔥</Text>
            <Text style={styles.statValue}>{streakDays}d</Text>
          </View>
        </View>

        <Pressable style={styles.footerStartButton} onPress={onStartToday}>
          <Text style={styles.startButtonText}>Update Today {'\u2192'}</Text>
        </Pressable>
      </View>

      <Modal
        visible={showVisionBoardModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowVisionBoardModal(false)}
      >
        <View style={styles.visionBoardModalRoot}>
          <Text style={styles.visionBoardModalTitle}>Your Vision Board</Text>
          <ScrollView
            style={styles.visionBoardModalScroll}
            contentContainerStyle={styles.visionBoardModalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.visionBoardRow}>
              {[0, 1].map((i) => (
                <VisionBoardSlot
                  key={`vslot-${i}`}
                  uri={visionEditSlots[i]}
                  size={visionModalSlotSide}
                  onPick={() => void pickVisionSlot(i)}
                  onDelete={() => deleteVisionSlot(i)}
                />
              ))}
            </View>
            <View style={styles.visionBoardRow}>
              {[2, 3].map((i) => (
                <VisionBoardSlot
                  key={`vslot-${i}`}
                  uri={visionEditSlots[i]}
                  size={visionModalSlotSide}
                  onPick={() => void pickVisionSlot(i)}
                  onDelete={() => deleteVisionSlot(i)}
                />
              ))}
            </View>
            <View style={styles.visionBoardRowSingle}>
              <VisionBoardSlot
                uri={visionEditSlots[4]}
                size={visionModalSlotSide}
                onPick={() => void pickVisionSlot(4)}
                onDelete={() => deleteVisionSlot(4)}
              />
            </View>
          </ScrollView>
          <Pressable
            style={styles.visionBoardDoneButton}
            onPress={() => setShowVisionBoardModal(false)}
          >
            <Text style={styles.visionBoardDoneButtonText}>Done</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal
        visible={showRewardModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowRewardModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set your reward</Text>
            <TextInput
              value={rewardNameDraft}
              onChangeText={setRewardNameDraft}
              placeholder="Reward name"
              placeholderTextColor="#9CA3AF"
              style={styles.modalInput}
            />
            <Pressable style={styles.rewardPickButton} onPress={() => void pickRewardPhoto()}>
              <Text style={styles.rewardPickButtonText}>
                {rewardPhoto ? 'Change reward photo' : 'Pick reward photo'}
              </Text>
            </Pressable>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setShowRewardModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveButton} onPress={() => void saveReward()}>
                <Text style={styles.saveButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEditPlanModal}
        animationType="slide"
        transparent
        onRequestClose={closeEditPlanModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.planEditorModalCard]}>
            <Text style={styles.planEditorTitle}>Edit Plan</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.planEditorScrollContent}
            >
              <View style={styles.planEditorSection}>
                <Text style={styles.planEditorSectionTitle}>Plan length</Text>
                <Text style={styles.planEditorLabel}>Target days</Text>
                <TextInput
                  value={editTargetDays}
                  onChangeText={setEditTargetDays}
                  keyboardType="number-pad"
                  style={styles.planEditorInput}
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.planEditorLabel}>Plan start date (DD/MM/YYYY)</Text>
                <TextInput
                  value={editStartDate}
                  onChangeText={setEditStartDate}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor="#9CA3AF"
                  style={styles.planEditorInput}
                />
              </View>

              <Text style={styles.planEditorSectionHeading}>Tracking</Text>
              <Text style={styles.planEditorHint}>Tap cards to add or remove what you track</Text>
              <View style={styles.planTrackingGrid}>
                {TRACKING_GRID_ITEMS.map((item) => {
                  const selected = editTrackingSelected.includes(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      style={[styles.planTrackingCard, selected && styles.planTrackingCardSelected]}
                      onPress={() => toggleEditTracking(item.id)}
                    >
                      <Text style={styles.planTrackingEmoji}>{item.emoji}</Text>
                      <Text style={styles.planTrackingLabel}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {TRACKING_ORDER.filter(
                (id) => editTrackingSelected.includes(id) && id !== 'supplements'
              ).map((tid) => {
                if (tid === 'meals') {
                  return (
                    <View key="cfg-meals" style={styles.planEditorSection}>
                      <Text style={styles.planEditorSectionTitle}>🍽️ Meals</Text>
                      {editMeals.map((meal, index) => (
                        <View key={meal.id} style={styles.planMealEditCard}>
                          <View style={styles.planMealEditTop}>
                            <Pressable
                              style={styles.planMealTypeDropdown}
                              onPress={() => openMealTypePicker(index)}
                            >
                              <Text style={styles.planMealTypeDropdownText}>
                                {mealTypeDropdownLabel(meal)}
                              </Text>
                              <Text style={styles.planMealTypeDropdownChevron}>▼</Text>
                            </Pressable>
                            <Pressable
                              style={styles.planRemoveMealBtn}
                              onPress={() =>
                                setEditMeals((prev) => prev.filter((_, i) => i !== index))
                              }
                            >
                              <Text style={styles.planRemoveMealBtnText}>✕</Text>
                            </Pressable>
                          </View>
                          <TextInput
                            value={meal.time}
                            onChangeText={(v) => updateMealField(index, 'time', v)}
                            style={styles.planEditorInput}
                            placeholder="Time — e.g. 9:15am (optional)"
                            placeholderTextColor="#9CA3AF"
                          />
                          <TextInput
                            value={meal.intention}
                            onChangeText={(v) => updateMealField(index, 'intention', v)}
                            style={[styles.planEditorInput, styles.planEditorTextarea]}
                            multiline
                            placeholder="Nutritional intention — e.g. High protein, light and veg-led (optional)"
                            placeholderTextColor="#9CA3AF"
                          />
                        </View>
                      ))}
                      <Pressable
                        style={styles.planAddRowButton}
                        onPress={() => {
                          const id = `meal-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                          setEditMeals((prev) => [
                            ...prev,
                            { id, emoji: '', title: '', time: '', intention: '' },
                          ]);
                        }}
                      >
                        <Text style={styles.planAddRowButtonText}>+ Add meal</Text>
                      </Pressable>
                    </View>
                  );
                }
                if (tid === 'steps') {
                  return (
                    <View key="cfg-steps" style={styles.planEditorSection}>
                      <Text style={styles.planEditorSectionTitle}>👟 Steps</Text>
                      <Text style={styles.planEditorLabel}>Daily steps goal</Text>
                      <TextInput
                        value={editStepsGoal}
                        onChangeText={setEditStepsGoal}
                        keyboardType="number-pad"
                        style={styles.planEditorInput}
                        placeholder="10000"
                        placeholderTextColor="#9CA3AF"
                      />
                    </View>
                  );
                }
                if (tid === 'workout') {
                  return (
                    <View key="cfg-workout" style={styles.planEditorSection}>
                      <Text style={styles.planEditorSectionTitle}>💪 Workout</Text>
                      <Text style={styles.planEditorLabel}>Workout type e.g. Gym, Run, Yoga</Text>
                      <TextInput
                        value={editWorkoutLabel}
                        onChangeText={setEditWorkoutLabel}
                        style={styles.planEditorInput}
                        placeholder="Gym, Run, Yoga..."
                        placeholderTextColor="#9CA3AF"
                      />
                    </View>
                  );
                }
                if (tid === 'water') {
                  return (
                    <View key="cfg-water" style={styles.planEditorSection}>
                      <Text style={styles.planEditorSectionTitle}>💧 Water</Text>
                      <Text style={styles.planEditorLabel}>Daily cups goal</Text>
                      <TextInput
                        value={editWaterGoal}
                        onChangeText={setEditWaterGoal}
                        keyboardType="number-pad"
                        style={styles.planEditorInput}
                        placeholder="8"
                        placeholderTextColor="#9CA3AF"
                      />
                    </View>
                  );
                }
                if (tid === 'custom') {
                  return (
                    <View key="cfg-custom" style={styles.planEditorSection}>
                      <Text style={styles.planEditorSectionTitle}>⭐ Custom</Text>
                      {editCustomItems.map((row, idx) => (
                        <View key={`cust-row-${idx}`} style={styles.planSubRowCard}>
                          <View style={styles.planCustomRow}>
                            <Pressable
                              style={styles.planEmojiPill}
                              onPress={() => cycleEditCustomEmoji(idx)}
                            >
                              <Text style={styles.planEmojiPillText}>{row.emoji}</Text>
                            </Pressable>
                            <TextInput
                              value={row.label}
                              onChangeText={(v) =>
                                setEditCustomItems((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, label: v } : r))
                                )
                              }
                              style={[styles.planEditorInput, styles.planMealNameFlex]}
                              placeholder="Label"
                              placeholderTextColor="#9CA3AF"
                            />
                            {editCustomItems.length > 1 ? (
                              <Pressable
                                style={styles.planRemoveMealBtn}
                                onPress={() =>
                                  setEditCustomItems((prev) => prev.filter((_, i) => i !== idx))
                                }
                              >
                                <Text style={styles.planRemoveMealBtnText}>✕</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                      ))}
                      <Pressable
                        style={styles.planAddRowButton}
                        onPress={() =>
                          setEditCustomItems((prev) => [
                            ...prev,
                            { label: '', emoji: '⭐' },
                          ])
                        }
                      >
                        <Text style={styles.planAddRowButtonText}>+ Add custom item</Text>
                      </Pressable>
                    </View>
                  );
                }
                return null;
              })}
            </ScrollView>

            <View style={styles.planEditorActions}>
              <Pressable style={styles.planEditorCancelButton} onPress={closeEditPlanModal}>
                <Text style={styles.planEditorCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.planEditorSaveButton} onPress={() => void savePlanEdits()}>
                <Text style={styles.planEditorSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Platform.OS !== 'ios' && mealTypePickerIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={closeMealTypePicker}
      >
        <View style={styles.planMealTypeModalRoot}>
          <Pressable style={styles.planMealTypeModalDismiss} onPress={closeMealTypePicker} />
          <View style={styles.planMealTypeModalCard}>
            <Text style={styles.planMealTypeModalTitle}>Meal type</Text>
            {!mealTypePickerCustom ? (
              <ScrollView
                style={styles.planMealTypeModalScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {MEAL_TYPE_PRESETS.map((p) => (
                  <Pressable
                    key={`${p.emoji}-${p.title}`}
                    style={styles.planMealTypeModalOption}
                    onPress={() => applyMealPresetDashboard(p.emoji, p.title)}
                  >
                    <Text style={styles.planMealTypeModalOptionText}>
                      {p.emoji} {p.title}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  style={styles.planMealTypeModalOption}
                  onPress={() => {
                    setMealTypePickerCustom(true);
                    setMealTypeCustomDraft('');
                  }}
                >
                  <Text style={styles.planMealTypeModalOptionText}>⭐ Custom</Text>
                </Pressable>
              </ScrollView>
            ) : (
              <View style={styles.planMealTypeCustomWrap}>
                <Text style={styles.planMealTypeCustomHint}>Enter your meal name</Text>
                <TextInput
                  value={mealTypeCustomDraft}
                  onChangeText={setMealTypeCustomDraft}
                  placeholder="e.g. Brunch, Post-workout shake"
                  placeholderTextColor="#9CA3AF"
                  style={styles.planEditorInput}
                />
                <View style={styles.planMealTypeCustomActions}>
                  <Pressable
                    style={styles.planMealTypeModalSecondaryBtn}
                    onPress={() => {
                      setMealTypePickerCustom(false);
                      setMealTypeCustomDraft('');
                    }}
                  >
                    <Text style={styles.planMealTypeModalSecondaryBtnText}>Back</Text>
                  </Pressable>
                  <Pressable
                    style={styles.planMealTypeModalPrimaryBtn}
                    onPress={applyMealCustomDashboard}
                  >
                    <Text style={styles.planMealTypeModalPrimaryBtnText}>Done</Text>
                  </Pressable>
                </View>
              </View>
            )}
            <Pressable style={styles.planMealTypeModalCancel} onPress={closeMealTypePicker}>
              <Text style={styles.planMealTypeModalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    paddingTop: 64,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  mainFill: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'space-between',
  },
  headerSection: {
    marginBottom: 8,
  },
  dashboardFooter: {
    backgroundColor: '#1A1A1A',
    borderTopWidth: 0.5,
    borderTopColor: '#2E2E2E',
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 24,
    flexShrink: 0,
  },
  footerStartButton: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  footerStatsWrap: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
    gap: 4,
    marginTop: 0,
    marginBottom: 10,
  },
  greeting: {
    fontSize: 28,
    fontFamily: FONT_EXTRA,
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  goalHeadlineWrap: {
    flex: 1,
  },
  goalLabel: {
    fontSize: 16,
    fontFamily: FONT_BOLD,
    color: ACCENT,
  },
  goalHeadline: {
    fontSize: 16,
    fontFamily: FONT_BOLD,
    color: TEXT_PRIMARY,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
    gap: 8,
  },
  goalInput: {
    flex: 1,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: TEXT_PRIMARY,
    fontFamily: FONT_BODY,
    fontSize: 16,
  },
  editButton: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  editButtonText: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONT_BOLD,
  },
  editIcon: {
    fontSize: 14,
  },
  visionWrap: {
    borderRadius: 16,
    overflow: 'visible',
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    minHeight: 150,
    marginBottom: 8,
    position: 'relative',
  },
  visionEditButtonOverlay: {
    position: 'absolute',
    zIndex: 10,
    bottom: 12,
    right: 12,
  },
  visionPhoto: {
    width: '100%',
    height: 170,
    borderRadius: 16,
  },
  visionCard: {
    borderRadius: 16,
    backgroundColor: SURFACE,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  visionScrollContent: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 12,
  },
  placeholder: {
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: SURFACE,
    borderRadius: 16,
    margin: 10,
  },
  placeholderEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  placeholderText: {
    color: TEXT_SECONDARY,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: FONT_BODY,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#4B5563',
  },
  dotActive: {
    width: 18,
    backgroundColor: ACCENT,
  },
  chevronButton: {
    position: 'absolute',
    top: 72,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronLeft: {
    left: 12,
  },
  chevronRight: {
    right: 12,
  },
  chevronText: {
    fontSize: 18,
    color: TEXT_PRIMARY,
    lineHeight: 20,
    fontFamily: FONT_BODY,
  },
  dayCounter: {
    fontSize: 21,
    color: TEXT_PRIMARY,
    fontFamily: FONT_BOLD,
    marginBottom: 0,
  },
  dayCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_BOLD,
    color: TEXT_PRIMARY,
    marginBottom: 6,
  },
  rewardSection: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  rewardTitle: {
    color: ACCENT,
    fontSize: 21,
    fontFamily: FONT_EXTRA,
    marginBottom: 6,
  },
  rewardNameText: {
    color: '#FAFAFA',
    fontSize: 19,
    fontFamily: FONT_SEMIBOLD,
    marginBottom: 10,
  },
  rewardNamePlaceholder: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 10,
    fontFamily: FONT_BODY,
  },
  rewardProgressWrap: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: 8,
  },
  rewardTrack: {
    height: 14,
    borderRadius: 999,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    overflow: 'hidden',
    paddingRight: 56,
  },
  rewardFill: {
    height: '100%',
    backgroundColor: ACCENT,
  },
  rewardEndMarker: {
    position: 'absolute',
    right: 0,
    top: -34,
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rewardImage: {
    width: '100%',
    height: '100%',
  },
  rewardEmoji: {
    fontSize: 22,
  },
  rewardMeta: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontFamily: FONT_BOLD,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    height: 64,
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    paddingVertical: 4,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 4,
    fontFamily: FONT_BODY,
  },
  statValue: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    color: TEXT_PRIMARY,
    textAlign: 'center',
  },
  startButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontFamily: FONT_EXTRA,
  },
  visionBoardModalRoot: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  visionBoardModalTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONT_EXTRA,
    marginBottom: 20,
    textAlign: 'center',
  },
  visionBoardModalScroll: {
    flex: 1,
  },
  visionBoardModalScrollContent: {
    paddingBottom: 16,
  },
  visionBoardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  visionBoardRowSingle: {
    alignItems: 'center',
    marginBottom: 16,
  },
  visionBoardSlotFrame: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    overflow: 'hidden',
    backgroundColor: SURFACE,
  },
  visionBoardSlotEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE,
  },
  visionBoardSlotImage: {
    width: '100%',
    height: '100%',
  },
  visionBoardPlus: {
    fontSize: 32,
    color: '#9CA3AF',
    fontFamily: FONT_BODY,
    lineHeight: 34,
  },
  visionBoardDeleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visionBoardDeleteEmoji: {
    fontSize: 11,
  },
  visionBoardDoneButton: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: ACCENT,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visionBoardDoneButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 17,
    fontFamily: FONT_EXTRA,
  },
  rewardPickButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 10,
  },
  rewardPickButtonText: {
    color: TEXT_SECONDARY,
    fontFamily: FONT_BOLD,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: BG,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    maxHeight: '86%',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: FONT_BOLD,
    color: TEXT_PRIMARY,
    marginBottom: 10,
  },
  modalLabel: {
    color: TEXT_SECONDARY,
    fontFamily: FONT_SEMIBOLD,
    fontSize: 13,
    marginBottom: 6,
    marginTop: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#3F3F3F',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: TEXT_PRIMARY,
    marginBottom: 10,
    backgroundColor: SURFACE,
    fontFamily: FONT_BODY,
    fontSize: 16,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontFamily: FONT_BOLD,
    color: TEXT_PRIMARY,
    marginTop: 6,
    marginBottom: 8,
  },
  modalTextarea: {
    minHeight: 64,
    textAlignVertical: 'top',
    fontFamily: FONT_BODY,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 6,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: SURFACE,
  },
  cancelButtonText: {
    color: TEXT_SECONDARY,
    fontFamily: FONT_BOLD,
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  saveButtonText: {
    color: TEXT_PRIMARY,
    fontFamily: FONT_EXTRA,
  },
  planEditorModalCard: {
    backgroundColor: BG,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '92%',
    paddingBottom: 12,
  },
  planEditorTitle: {
    fontSize: 22,
    fontFamily: FONT_EXTRA,
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },
  planEditorScrollContent: {
    paddingBottom: 24,
  },
  planEditorSection: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    padding: 14,
    marginBottom: 14,
  },
  planEditorSectionHeading: {
    fontSize: 17,
    fontFamily: FONT_EXTRA,
    color: ACCENT,
    marginBottom: 4,
  },
  planEditorSectionTitle: {
    fontSize: 16,
    fontFamily: FONT_EXTRA,
    color: TEXT_PRIMARY,
    marginBottom: 10,
  },
  planEditorHint: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    marginBottom: 10,
    fontFamily: FONT_SEMIBOLD,
  },
  planEditorLabel: {
    color: TEXT_SECONDARY,
    fontFamily: FONT_SEMIBOLD,
    fontSize: 13,
    marginBottom: 6,
  },
  planEditorInput: {
    borderWidth: 1,
    borderColor: '#3F3F3F',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: TEXT_PRIMARY,
    marginBottom: 10,
    backgroundColor: '#252525',
    fontFamily: FONT_BODY,
    fontSize: 16,
  },
  planEditorTextarea: {
    minHeight: 72,
    textAlignVertical: 'top',
    fontFamily: FONT_BODY,
    fontSize: 16,
  },
  planTrackingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  planTrackingCard: {
    width: '31%',
    minWidth: '28%',
    flexGrow: 1,
    maxWidth: '32%',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3F3F3F',
    backgroundColor: SURFACE,
    marginBottom: 6,
  },
  planTrackingCardSelected: {
    borderColor: ACCENT,
    backgroundColor: '#363636',
  },
  planTrackingEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  planTrackingLabel: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontFamily: FONT_BOLD,
    textAlign: 'center',
  },
  planMealEditCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    backgroundColor: '#252525',
    padding: 10,
    marginBottom: 10,
  },
  planMealEditTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  planMealTypeDropdown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    backgroundColor: '#1F1F1F',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  planMealTypeDropdownText: {
    flex: 1,
    fontSize: 15,
    color: TEXT_PRIMARY,
    fontFamily: FONT_SEMIBOLD,
  },
  planMealTypeDropdownChevron: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 8,
  },
  planMealTypeModalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  planMealTypeModalDismiss: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  planMealTypeModalCard: {
    backgroundColor: '#252525',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    padding: 16,
    maxHeight: '78%',
    zIndex: 1,
  },
  planMealTypeModalTitle: {
    fontSize: 18,
    fontFamily: FONT_BOLD,
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },
  planMealTypeModalScroll: {
    maxHeight: 320,
  },
  planMealTypeModalOption: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3F3F3F',
  },
  planMealTypeModalOptionText: {
    fontSize: 16,
    color: TEXT_PRIMARY,
    fontFamily: FONT_SEMIBOLD,
  },
  planMealTypeCustomWrap: {
    gap: 12,
  },
  planMealTypeCustomHint: {
    fontSize: 14,
    color: '#D1D5DB',
    marginBottom: 4,
    fontFamily: FONT_BODY,
  },
  planMealTypeCustomActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  planMealTypeModalSecondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4B5563',
    alignItems: 'center',
  },
  planMealTypeModalSecondaryBtnText: {
    color: '#D1D5DB',
    fontFamily: FONT_BOLD,
  },
  planMealTypeModalPrimaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  planMealTypeModalPrimaryBtnText: {
    color: '#FFFFFF',
    fontFamily: FONT_BOLD,
  },
  planMealTypeModalCancel: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  planMealTypeModalCancelText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontFamily: FONT_BODY,
  },
  planEmojiPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ACCENT,
    backgroundColor: '#1F1F1F',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  planEmojiPillText: {
    fontSize: 18,
  },
  planMealNameFlex: {
    flex: 1,
    marginBottom: 0,
  },
  planRemoveMealBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#4B5563',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F1F1F',
  },
  planRemoveMealBtnText: {
    color: '#F87171',
    fontSize: 16,
    fontFamily: FONT_BOLD,
  },
  planAddRowButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ACCENT,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#2A1810',
  },
  planAddRowButtonText: {
    color: ACCENT,
    fontFamily: FONT_EXTRA,
    fontSize: 14,
  },
  planSubRowCard: {
    marginBottom: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#3F3F3F',
  },
  planRemoveLink: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  planRemoveLinkText: {
    color: '#F87171',
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },
  planCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planEditorActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#3F3F3F',
  },
  planEditorCancelButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    backgroundColor: SURFACE,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planEditorCancelText: {
    color: TEXT_SECONDARY,
    fontFamily: FONT_EXTRA,
    fontSize: 16,
  },
  planEditorSaveButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planEditorSaveText: {
    color: TEXT_PRIMARY,
    fontFamily: FONT_EXTRA,
    fontSize: 16,
  },
});

