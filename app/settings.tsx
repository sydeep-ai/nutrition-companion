import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  DevSettings,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FONT_BODY, FONT_SEMIBOLD, FONT_BOLD, FONT_EXTRA } from '../constants/fonts';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DEFAULT_MEAL_PLAN,
  parseMealPlanFromStorage,
  PlanMeal,
} from '../data/defaultMealPlan';

const ACCENT = '#D85A30';
const BG = '#1A1A1A';
const ROW_BG = '#2E2E2E';
const TEXT = '#FAFAFA';
const GREY = '#888888';

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

type CustomItemRow = { label: string; emoji: string };

const CUSTOM_ITEM_EMOJI_CYCLE = ['⭐', '🧘', '🚴', '📚', '🎯', '🌿'] as const;

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

function newMealId(): string {
  return `meal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type Props = {
  openEditPlanRef: React.MutableRefObject<(() => void) | null>;
  onResetToOnboarding?: () => void;
};

type EditField = null | 'goal' | 'why' | 'intentions';

const MAX_INTENTIONS = 5;

export default function SettingsScreen({ openEditPlanRef: _openEditPlanRef, onResetToOnboarding }: Props) {
  const navigation = useNavigation();
  const [goalDraft, setGoalDraft] = useState('');
  const [whyDraft, setWhyDraft] = useState('');
  const [intentionsDraft, setIntentionsDraft] = useState('');
  const [editing, setEditing] = useState<EditField>(null);

  const [editPlanVisible, setEditPlanVisible] = useState(false);
  const [editTrackingSelected, setEditTrackingSelected] = useState<TrackingId[]>(['meals']);
  const [editMeals, setEditMeals] = useState<PlanMeal[]>(DEFAULT_MEAL_PLAN);
  const [editStepsGoal, setEditStepsGoal] = useState('10000');
  const [editWorkoutLabel, setEditWorkoutLabel] = useState('');
  const [editWaterGoal, setEditWaterGoal] = useState('8');
  const [editCustomItems, setEditCustomItems] = useState<CustomItemRow[]>([
    { label: '', emoji: '⭐' },
  ]);

  const loadProfile = useCallback(async () => {
    const [g, w, i] = await Promise.all([
      AsyncStorage.getItem('user_goal'),
      AsyncStorage.getItem('user_why'),
      AsyncStorage.getItem('user_intentions'),
    ]);
    setGoalDraft(g?.trim() ?? '');
    setWhyDraft(w?.trim() ?? '');
    try {
      const arr = i ? (JSON.parse(i) as unknown) : [];
      if (Array.isArray(arr) && arr.length > 0) {
        setIntentionsDraft(arr.map((x) => String(x)).join('\n'));
      } else {
        setIntentionsDraft('');
      }
    } catch {
      setIntentionsDraft('');
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const loadEditPlanState = useCallback(async () => {
    const [mealRaw, tcRaw, stepsRaw, workoutRaw, waterRaw, customRaw] = await Promise.all([
      AsyncStorage.getItem(MEAL_PLAN_STORAGE_KEY),
      AsyncStorage.getItem(TRACKING_CONFIG_KEY),
      AsyncStorage.getItem(STEPS_GOAL_KEY),
      AsyncStorage.getItem(WORKOUT_LABEL_KEY),
      AsyncStorage.getItem(WATER_GOAL_KEY),
      AsyncStorage.getItem(CUSTOM_ITEMS_KEY),
    ]);

    setEditTrackingSelected(parseTrackingConfigForEdit(tcRaw));
    setEditMeals(parseMealPlanFromStorage(mealRaw));
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
  }, []);

  const openEditPlanModal = useCallback(() => {
    void (async () => {
      try {
        await loadEditPlanState();
        setEditPlanVisible(true);
      } catch (e) {
        Alert.alert(
          'Could not open plan editor',
          e instanceof Error ? e.message : 'Please try again.'
        );
      }
    })();
  }, [loadEditPlanState]);

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

  const addMealSlot = () => {
    setEditMeals((prev) => [
      ...prev,
      {
        id: newMealId(),
        emoji: '🍽️',
        title: '',
        time: '',
        intention: '',
      },
    ]);
  };

  const removeMealSlot = (idx: number) => {
    setEditMeals((prev) => prev.filter((_, i) => i !== idx));
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

  const addCustomRow = () => {
    setEditCustomItems((prev) => [...prev, { label: '', emoji: '⭐' }]);
  };

  const removeCustomRow = (idx: number) => {
    setEditCustomItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const dismissEditPlan = () => {
    setEditPlanVisible(false);
  };

  const saveEditPlan = async () => {
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

    if (ordered.includes('meals')) {
      if (editMeals.length === 0) {
        Alert.alert('Meals', 'Add at least one meal slot or turn off Meals tracking.');
        return;
      }
      if (editMeals.some((m) => !m.title.trim())) {
        Alert.alert('Meals', 'Enter a title for every meal slot.');
        return;
      }
    }

    const pairs: [string, string][] = [[TRACKING_CONFIG_KEY, JSON.stringify(ordered)]];

    if (ordered.includes('meals')) {
      const normalized = editMeals.map((m) => ({
        ...m,
        emoji: (m.emoji || '🍽️').trim(),
        title: m.title.trim(),
        time: m.time.trim(),
        intention: m.intention.trim(),
      }));
      pairs.push([MEAL_PLAN_STORAGE_KEY, JSON.stringify(normalized)]);
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

    try {
      await AsyncStorage.multiSet(pairs);
      if (removeKeys.length > 0) {
        await AsyncStorage.multiRemove(removeKeys);
      }
      setEditPlanVisible(false);
    } catch (e) {
      Alert.alert(
        'Save failed',
        e instanceof Error ? e.message : 'Could not save your plan.'
      );
    }
  };

  const saveGoal = async () => {
    const v = goalDraft.trim() || 'Your best self';
    await AsyncStorage.setItem('user_goal', v);
    setEditing(null);
  };

  const saveWhy = async () => {
    await AsyncStorage.setItem('user_why', whyDraft.trim());
    setEditing(null);
  };

  const saveIntentions = async () => {
    const lines = intentionsDraft
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_INTENTIONS);
    await AsyncStorage.setItem('user_intentions', JSON.stringify(lines));
    setEditing(null);
  };

  const confirmReset = () => {
    Alert.alert(
      'Reset everything?',
      'This will delete all your data and restart onboarding.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              try {
                const allKeys = await AsyncStorage.getAllKeys();
                await AsyncStorage.multiRemove(allKeys);
              } catch (e) {
                Alert.alert(
                  'Reset failed',
                  e instanceof Error ? e.message : 'Could not clear storage.'
                );
                return;
              }
              if (onResetToOnboarding) {
                onResetToOnboarding();
                return;
              }
              try {
                DevSettings.reload();
              } catch {
                Alert.alert(
                  'Reset complete',
                  'All data has been cleared. Please force-quit and reopen the app to see onboarding.'
                );
              }
            })(),
        },
      ]
    );
  };

  const clearToday = () => {
    Alert.alert(
      "Clear today's data?",
      "This will reset all of today's tracking. Your plan and goals are not affected.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              try {
                const today = new Date().toISOString().split('T')[0];
                const allKeys = await AsyncStorage.getAllKeys();
                const todayKeys = allKeys.filter((k) => k.includes(today));
                await AsyncStorage.multiRemove(todayKeys);
                Alert.alert('Done', "Today's data has been cleared.");
              } catch (e) {
                Alert.alert(
                  'Could not clear',
                  e instanceof Error ? e.message : 'Something went wrong.'
                );
              }
            })(),
        },
      ]
    );
  };

  const openTrackRecord = () => {
    navigation.dispatch(CommonActions.navigate({ name: 'History' }));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.screenTitle}>Settings</Text>

        <Text style={styles.sectionTitle}>My Plan</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={openEditPlanModal}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Edit plan"
        >
          <Text style={styles.rowLabel}>Edit Plan</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        <Pressable style={styles.row} onPress={openTrackRecord}>
          <Text style={styles.rowLabel}>Track Record</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <TouchableOpacity
          style={styles.row}
          onPress={confirmReset}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Reset all data"
        >
          <Text style={[styles.rowLabel, styles.rowDanger]}>Reset</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>My Profile</Text>
        <Pressable style={styles.row} onPress={() => setEditing('goal')}>
          <Text style={styles.rowLabel}>Edit Goal</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        {editing === 'goal' ? (
          <View style={styles.inlineBlock}>
            <TextInput
              value={goalDraft}
              onChangeText={setGoalDraft}
              placeholder="Your goal"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />
            <Pressable style={styles.saveChip} onPress={() => void saveGoal()}>
              <Text style={styles.saveChipText}>Save</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable style={styles.row} onPress={() => setEditing('why')}>
          <Text style={styles.rowLabel}>Edit Why</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        {editing === 'why' ? (
          <View style={styles.inlineBlock}>
            <TextInput
              value={whyDraft}
              onChangeText={setWhyDraft}
              placeholder="Your why"
              placeholderTextColor="#9CA3AF"
              style={[styles.input, styles.inputTall]}
              multiline
            />
            <Pressable style={styles.saveChip} onPress={() => void saveWhy()}>
              <Text style={styles.saveChipText}>Save</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable style={styles.row} onPress={() => setEditing('intentions')}>
          <Text style={styles.rowLabel}>Edit Intentions</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        {editing === 'intentions' ? (
          <View style={styles.inlineBlock}>
            <Text style={styles.hint}>One intention per line (max {MAX_INTENTIONS})</Text>
            <TextInput
              value={intentionsDraft}
              onChangeText={setIntentionsDraft}
              placeholder="One intention per line"
              placeholderTextColor="#9CA3AF"
              style={[styles.input, styles.inputTall]}
              multiline
            />
            <Pressable style={styles.saveChip} onPress={() => void saveIntentions()}>
              <Text style={styles.saveChipText}>Save</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>App</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={clearToday}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Clear today data"
        >
          <Text style={styles.rowLabel}>Clear today&apos;s data</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        <Text style={styles.version}>Version 1.0.0</Text>
      </ScrollView>

      <Modal visible={editPlanVisible} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={styles.modalSafe} edges={['top']}>
          <KeyboardAvoidingView
            style={styles.modalKavRoot}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            <View style={styles.modalKavInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit plan</Text>
              </View>

              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
              >
            <Text style={styles.modalSectionLabel}>Tracking</Text>
            <View style={styles.trackingGrid}>
              {TRACKING_GRID_ITEMS.map((item) => {
                const on = editTrackingSelected.includes(item.id);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => toggleEditTracking(item.id)}
                    style={[styles.trackingCard, on && styles.trackingCardOn]}
                  >
                    <Text style={styles.trackingEmoji}>{item.emoji}</Text>
                    <Text style={[styles.trackingLabel, on && styles.trackingLabelOn]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {editTrackingSelected.includes('meals') ? (
              <View style={styles.configBlock}>
                <Text style={styles.modalSectionLabel}>Meals</Text>
                {editMeals.map((meal, idx) => (
                  <View key={meal.id} style={styles.mealCard}>
                    <View style={styles.mealCardHeader}>
                      <Text style={styles.mealCardTitle}>Slot {idx + 1}</Text>
                      <Pressable onPress={() => removeMealSlot(idx)} hitSlop={8}>
                        <Text style={styles.deleteText}>Delete</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      value={meal.title}
                      onChangeText={(t) => updateMealField(idx, 'title', t)}
                      placeholder="Title"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                    />
                    <TextInput
                      value={meal.time}
                      onChangeText={(t) => updateMealField(idx, 'time', t)}
                      placeholder="Time"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                    />
                    <TextInput
                      value={meal.intention}
                      onChangeText={(t) => updateMealField(idx, 'intention', t)}
                      placeholder="Intention"
                      placeholderTextColor="#9CA3AF"
                      style={[styles.input, styles.inputShortMultiline]}
                      multiline
                    />
                  </View>
                ))}
                <Pressable style={styles.addSlotBtn} onPress={addMealSlot}>
                  <Text style={styles.addSlotBtnText}>+ Add meal slot</Text>
                </Pressable>
              </View>
            ) : null}

            {editTrackingSelected.includes('steps') ? (
              <View style={styles.configBlock}>
                <Text style={styles.modalSectionLabel}>Steps goal</Text>
                <TextInput
                  value={editStepsGoal}
                  onChangeText={setEditStepsGoal}
                  placeholder="Daily steps"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </View>
            ) : null}

            {editTrackingSelected.includes('workout') ? (
              <View style={styles.configBlock}>
                <Text style={styles.modalSectionLabel}>Workout label</Text>
                <TextInput
                  value={editWorkoutLabel}
                  onChangeText={setEditWorkoutLabel}
                  placeholder="e.g. Strength training"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                />
              </View>
            ) : null}

            {editTrackingSelected.includes('water') ? (
              <View style={styles.configBlock}>
                <Text style={styles.modalSectionLabel}>Water (cups per day)</Text>
                <TextInput
                  value={editWaterGoal}
                  onChangeText={setEditWaterGoal}
                  placeholder="Cups"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </View>
            ) : null}

            {editTrackingSelected.includes('custom') ? (
              <View style={styles.configBlock}>
                <Text style={styles.modalSectionLabel}>Custom items</Text>
                {editCustomItems.map((row, idx) => (
                  <View key={`custom-${idx}`} style={styles.customRow}>
                    <Pressable
                      style={styles.customEmojiBtn}
                      onPress={() => cycleEditCustomEmoji(idx)}
                    >
                      <Text style={styles.customEmojiText}>{row.emoji}</Text>
                    </Pressable>
                    <TextInput
                      value={row.label}
                      onChangeText={(t) =>
                        setEditCustomItems((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, label: t } : r))
                        )
                      }
                      placeholder="Label"
                      placeholderTextColor="#9CA3AF"
                      style={[styles.input, styles.customLabelInput]}
                    />
                    <Pressable onPress={() => removeCustomRow(idx)} hitSlop={8}>
                      <Text style={styles.deleteText}>×</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable style={styles.addSlotBtn} onPress={addCustomRow}>
                  <Text style={styles.addSlotBtnText}>+ Add custom item</Text>
                </Pressable>
              </View>
            ) : null}
              </ScrollView>

              <View style={styles.editPlanBottomBar}>
                <TouchableOpacity
                  style={styles.editPlanSaveBtn}
                  onPress={() => void saveEditPlan()}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Save plan"
                >
                  <Text style={styles.editPlanSaveBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editPlanCancelBtn}
                  onPress={dismissEditPlan}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing plan"
                >
                  <Text style={styles.editPlanCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  screenTitle: {
    fontSize: 28,
    fontFamily: FONT_EXTRA,
    color: TEXT,
    marginBottom: 8,
    marginTop: 8,
  },
  sectionTitle: {
    color: ACCENT,
    fontSize: 13,
    fontFamily: FONT_BOLD,
    marginBottom: 8,
    marginTop: 16,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ROW_BG,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  rowLabel: {
    color: TEXT,
    fontSize: 16,
    fontFamily: FONT_SEMIBOLD,
    flex: 1,
  },
  rowDanger: {
    color: '#EF4444',
  },
  chevron: {
    color: TEXT,
    fontSize: 22,
    fontFamily: FONT_BODY,
    marginLeft: 8,
  },
  inlineBlock: {
    marginBottom: 12,
    marginTop: -4,
  },
  input: {
    backgroundColor: ROW_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: TEXT,
    fontSize: 16,
    fontFamily: FONT_BODY,
    marginBottom: 8,
  },
  inputTall: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputShortMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  hint: {
    color: GREY,
    fontSize: 12,
    marginBottom: 6,
    fontFamily: FONT_BODY,
  },
  saveChip: {
    alignSelf: 'flex-start',
    backgroundColor: ACCENT,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  saveChipText: {
    color: '#FFFFFF',
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },
  version: {
    color: GREY,
    fontSize: 13,
    marginTop: 12,
    marginBottom: 8,
    fontFamily: FONT_BODY,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: BG,
  },
  modalKavRoot: {
    flex: 1,
  },
  modalKavInner: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3F3F3F',
  },
  modalTitle: {
    color: TEXT,
    fontSize: 17,
    fontFamily: FONT_BOLD,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  editPlanBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A1A',
    padding: 16,
    paddingBottom: 32,
  },
  editPlanSaveBtn: {
    width: '100%',
    backgroundColor: '#D85A30',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPlanSaveBtnText: {
    color: '#FFFFFF',
    fontFamily: FONT_BOLD,
    fontSize: 16,
  },
  editPlanCancelBtn: {
    width: '100%',
    backgroundColor: '#2E2E2E',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPlanCancelBtnText: {
    color: '#FFFFFF',
    fontFamily: FONT_BOLD,
    fontSize: 16,
  },
  modalSectionLabel: {
    color: ACCENT,
    fontFamily: FONT_BOLD,
    fontSize: 13,
    marginBottom: 10,
    marginTop: 8,
  },
  trackingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  trackingCard: {
    width: '31%',
    minWidth: '30%',
    flexGrow: 1,
    backgroundColor: ROW_BG,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  trackingCardOn: {
    borderColor: ACCENT,
    backgroundColor: '#3A2A24',
  },
  trackingEmoji: {
    fontSize: 26,
    marginBottom: 6,
  },
  trackingLabel: {
    color: GREY,
    fontSize: 12,
    fontFamily: FONT_SEMIBOLD,
    textAlign: 'center',
  },
  trackingLabelOn: {
    color: TEXT,
  },
  configBlock: {
    marginBottom: 16,
  },
  mealCard: {
    backgroundColor: ROW_BG,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  mealCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mealCardTitle: {
    color: TEXT,
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },
  deleteText: {
    color: '#EF4444',
    fontFamily: FONT_SEMIBOLD,
    fontSize: 14,
  },
  addSlotBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  addSlotBtnText: {
    color: ACCENT,
    fontFamily: FONT_BOLD,
    fontSize: 15,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  customEmojiBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: ROW_BG,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3F3F3F',
  },
  customEmojiText: {
    fontSize: 24,
  },
  customLabelInput: {
    flex: 1,
    marginBottom: 0,
  },
});
