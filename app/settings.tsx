import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  DevSettings,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ACCENT = '#D85A30';
const BG = '#1A1A1A';
const ROW_BG = '#2E2E2E';
const TEXT = '#FAFAFA';
const GREY = '#888888';

const STEPS_GOAL_KEY = 'steps_goal';
const WORKOUT_LABEL_KEY = 'workout_label';
const CUSTOM_ITEMS_KEY = 'custom_items';

const RESET_STATIC_KEYS: string[] = [
  'onboarding_complete',
  'user_name',
  'user_goal',
  'user_why',
  'user_intentions',
  'vision_photos',
  'reward_name',
  'reward_photo',
  'target_days',
  'plan_start_date',
  'tracking_config',
  'meal_plan',
  STEPS_GOAL_KEY,
  'water_goal',
  WORKOUT_LABEL_KEY,
  'supplement_list',
  CUSTOM_ITEMS_KEY,
  'last_quote_date',
];

function storageKeyMatchesDailyDataPattern(key: string): boolean {
  if (key.startsWith('meal_ticks_')) return true;
  if (key.startsWith('journal_')) return true;
  if (key.startsWith('checkin_')) return true;
  if (key.startsWith('water_cups_')) return true;
  if (key.startsWith('supplements_')) return true;
  if (key.startsWith('movement_')) return true;
  if (key.startsWith('steps_') && key !== STEPS_GOAL_KEY) return true;
  if (key.startsWith('workout_') && key !== WORKOUT_LABEL_KEY) return true;
  if (key.startsWith('custom_') && key !== CUSTOM_ITEMS_KEY) return true;
  return false;
}

const TODAY_TICK_KEY = 'today_tick_state_v1';

function todayKeysToRemove(): string[] {
  const today = new Date().toISOString().split('T')[0];
  const keys: string[] = [
    TODAY_TICK_KEY,
    `meal_ticks_${today}`,
    `steps_${today}`,
    `workout_${today}`,
    `water_cups_${today}`,
    `supplements_${today}`,
    `journal_${today}`,
    `checkin_${today}`,
    `movement_steps_${today}`,
    `movement_workout_${today}`,
  ];
  for (let i = 0; i < 20; i += 1) {
    keys.push(`custom_${i}_${today}`);
  }
  return keys;
}

type Props = {
  openEditPlanRef: React.MutableRefObject<(() => void) | null>;
};

type EditField = null | 'goal' | 'why' | 'intentions';

const MAX_INTENTIONS = 5;

export default function SettingsScreen({ openEditPlanRef }: Props) {
  const navigation = useNavigation();
  const [goalDraft, setGoalDraft] = useState('');
  const [whyDraft, setWhyDraft] = useState('');
  const [intentionsDraft, setIntentionsDraft] = useState('');
  const [editing, setEditing] = useState<EditField>(null);

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

  const runFullReset = async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const patternKeys = allKeys.filter(storageKeyMatchesDailyDataPattern);
      const toRemove = [...new Set([...RESET_STATIC_KEYS, ...patternKeys, ...allKeys])];
      if (toRemove.length > 0) {
        await AsyncStorage.multiRemove(toRemove);
      }
    } catch (e) {
      Alert.alert(
        'Reset failed',
        e instanceof Error ? e.message : 'Could not clear storage.'
      );
      return;
    }
    try {
      DevSettings.reload();
    } catch {
      Alert.alert(
        'Reset complete',
        'All data has been cleared. Please restart the app to open onboarding.'
      );
    }
  };

  const confirmReset = () => {
    Alert.alert(
      'Are you sure?',
      'This will erase all saved app data and return you to onboarding after the app reloads.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => void runFullReset(),
        },
      ]
    );
  };

  const clearToday = () => {
    Alert.alert(
      "Clear today's data?",
      'This removes today’s check-ins, journal, water, steps, workout answers, and related entries. Meal photo notes in storage are not removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => void doClearToday(),
        },
      ]
    );
  };

  const doClearToday = async () => {
    try {
      await AsyncStorage.multiRemove(todayKeysToRemove());
    } catch (e) {
      Alert.alert(
        'Could not clear',
        e instanceof Error ? e.message : 'Something went wrong.'
      );
    }
  };

  const openPlan = () => {
    openEditPlanRef.current?.();
  };

  const openTrackRecord = () => {
    navigation.getParent()?.navigate('History' as never);
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
        <Pressable style={styles.row} onPress={openPlan}>
          <Text style={styles.rowLabel}>Edit Plan</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={openTrackRecord}>
          <Text style={styles.rowLabel}>Track Record</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={confirmReset}>
          <Text style={[styles.rowLabel, styles.rowDanger]}>Reset</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

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
        <Pressable style={styles.row} onPress={clearToday}>
          <Text style={styles.rowLabel}>Clear today&apos;s data</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Text style={styles.version}>Version 1.0.0</Text>
      </ScrollView>
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
    fontWeight: '700',
    color: TEXT,
    marginBottom: 8,
    marginTop: 8,
  },
  sectionTitle: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '700',
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
    fontWeight: '600',
    flex: 1,
  },
  rowDanger: {
    color: '#EF4444',
  },
  chevron: {
    color: TEXT,
    fontSize: 22,
    fontWeight: '300',
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
    marginBottom: 8,
  },
  inputTall: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  hint: {
    color: GREY,
    fontSize: 12,
    marginBottom: 6,
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
    fontWeight: '700',
    fontSize: 14,
  },
  version: {
    color: GREY,
    fontSize: 13,
    marginTop: 12,
    marginBottom: 8,
  },
});
