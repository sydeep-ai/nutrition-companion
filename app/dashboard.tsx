import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Meal, plan1 } from '../data/plan1';

const ACCENT = '#1D9E75';
const TICK_STORAGE_KEY = 'today_tick_state_v1';
const MEAL_PLAN_STORAGE_KEY = 'meal_plan';

type Props = {
  onStartToday: () => void;
  refreshKey?: number;
};

type TickState = {
  date: string;
  checkedIds: string[];
};

const getTodayKey = () => new Date().toISOString().slice(0, 10);

export default function DashboardScreen({ onStartToday, refreshKey = 0 }: Props) {
  const screenWidth = Dimensions.get('window').width;
  const visionCardWidth = Math.floor(screenWidth * 0.85);
  const visionCardGap = 10;
  const visionScrollRef = useRef<ScrollView>(null);
  const [userName, setUserName] = useState('');
  const [goalText, setGoalText] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [visionPhotos, setVisionPhotos] = useState<string[]>([]);
  const [targetDays, setTargetDays] = useState(30);
  const [planStartDate, setPlanStartDate] = useState<string>('');
  const [mealsDoneToday, setMealsDoneToday] = useState(0);
  const [visionIndex, setVisionIndex] = useState(0);
  const [mealPlan, setMealPlan] = useState<Meal[]>(plan1);
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [editTargetDays, setEditTargetDays] = useState('30');
  const [editStartDate, setEditStartDate] = useState('');
  const [editMeals, setEditMeals] = useState<Meal[]>(plan1);

  useEffect(() => {
    const loadDashboardData = async () => {
      const [
        userNameRaw,
        userGoal,
        visionRaw,
        targetRaw,
        startRaw,
        todayTickRaw,
        mealPlanRaw,
      ] = await Promise.all([
        AsyncStorage.getItem('user_name'),
        AsyncStorage.getItem('user_goal'),
        AsyncStorage.getItem('vision_photos'),
        AsyncStorage.getItem('target_days'),
        AsyncStorage.getItem('plan_start_date'),
        AsyncStorage.getItem(TICK_STORAGE_KEY),
        AsyncStorage.getItem(MEAL_PLAN_STORAGE_KEY),
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

      try {
        const parsedMeals = mealPlanRaw ? (JSON.parse(mealPlanRaw) as Meal[]) : plan1;
        if (Array.isArray(parsedMeals) && parsedMeals.length > 0) {
          setMealPlan(parsedMeals);
          setEditMeals(parsedMeals);
        } else {
          setMealPlan(plan1);
          setEditMeals(plan1);
        }
      } catch {
        setMealPlan(plan1);
        setEditMeals(plan1);
      }

      try {
        const tick = todayTickRaw ? (JSON.parse(todayTickRaw) as TickState) : null;
        if (tick?.date === getTodayKey() && Array.isArray(tick.checkedIds)) {
          setMealsDoneToday(tick.checkedIds.length);
        } else {
          setMealsDoneToday(0);
        }
      } catch {
        setMealsDoneToday(0);
      }
    };

    void loadDashboardData();
  }, [refreshKey]);

  const dayCounter = useMemo(() => {
    if (!planStartDate) {
      return 1;
    }
    const start = new Date(planStartDate);
    if (Number.isNaN(start.getTime())) {
      return 1;
    }
    const diffMs = Date.now() - start.getTime();
    const day = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, day);
  }, [planStartDate]);

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

  const editVisionPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(
        'Photo access needed',
        'Please enable Photos permission in Settings to update your vision board.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const selectedUris = result.assets.map((asset) => asset.uri).filter(Boolean);
    if (!selectedUris.length) {
      return;
    }

    // Replace the current set with selected photos.
    setVisionPhotos(selectedUris);
    setVisionIndex(0);
    await AsyncStorage.setItem('vision_photos', JSON.stringify(selectedUris));
  };

  const scrollToVisionIndex = (index: number) => {
    const bounded = Math.max(0, Math.min(index, Math.max(visionPhotos.length - 1, 0)));
    setVisionIndex(bounded);
    visionScrollRef.current?.scrollTo({
      x: bounded * (visionCardWidth + visionCardGap),
      animated: true,
    });
  };

  const openEditPlanModal = () => {
    setEditTargetDays(String(targetDays));
    setEditStartDate(formatDateForInput(planStartDate));
    setEditMeals(mealPlan);
    setShowEditPlanModal(true);
  };

  const updateMealField = (idx: number, field: keyof Meal, value: string) => {
    setEditMeals((prev) =>
      prev.map((meal, mealIdx) =>
        mealIdx === idx ? { ...meal, [field]: value } : meal
      )
    );
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

    await AsyncStorage.multiSet([
      ['target_days', String(Math.floor(parsedTarget))],
      ['plan_start_date', isoStartDate],
      [MEAL_PLAN_STORAGE_KEY, JSON.stringify(editMeals)],
    ]);

    setTargetDays(Math.floor(parsedTarget));
    setPlanStartDate(isoStartDate);
    setMealPlan(editMeals);
    setShowEditPlanModal(false);
  };

  return (
    <View style={styles.screen}>
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
          <Text style={styles.goalHeadline}>{goalText}</Text>
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

      <View style={styles.visionWrap}>
        <Pressable style={styles.visionEditButton} onPress={() => void editVisionPhotos()}>
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

      <View style={styles.dayCounterRow}>
        <Text style={styles.dayCounter}>Day {dayCounter} of {targetDays}</Text>
        <Pressable style={styles.editButton} onPress={openEditPlanModal}>
          <Text style={styles.editIcon}>✏️</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Today at a glance</Text>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>🍽️</Text>
          <Text style={styles.statValue}>{mealsDoneToday}/6</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>💧</Text>
          <Text style={styles.statValue}>0/8</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>💊</Text>
          <Text style={styles.statValue}>not yet</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>🔥</Text>
          <Text style={styles.statValue}>🔥 Day 1</Text>
        </View>
      </View>

      <View style={styles.bottomArea}>
        <Pressable style={styles.startButton} onPress={onStartToday}>
          <Text style={styles.startButtonText}>Update Today {'\u2192'}</Text>
        </Pressable>
      </View>

      <Modal
        visible={showEditPlanModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditPlanModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Plan</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalLabel}>Target days</Text>
              <TextInput
                value={editTargetDays}
                onChangeText={setEditTargetDays}
                keyboardType="number-pad"
                style={styles.modalInput}
              />

              <Text style={styles.modalLabel}>Plan start date (DD/MM/YYYY)</Text>
              <TextInput
                value={editStartDate}
                onChangeText={setEditStartDate}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="#9CA3AF"
                style={styles.modalInput}
              />

              <Text style={styles.modalSectionTitle}>Meal plan editor</Text>
              {editMeals.map((meal, index) => (
                <View key={`edit-meal-${meal.id}`} style={styles.editMealCard}>
                  <TextInput
                    value={meal.title}
                    onChangeText={(v) => updateMealField(index, 'title', v)}
                    style={styles.modalInput}
                    placeholder="Meal title"
                    placeholderTextColor="#9CA3AF"
                  />
                  <TextInput
                    value={meal.time}
                    onChangeText={(v) => updateMealField(index, 'time', v)}
                    style={styles.modalInput}
                    placeholder="Meal time"
                    placeholderTextColor="#9CA3AF"
                  />
                  <TextInput
                    value={meal.details}
                    onChangeText={(v) => updateMealField(index, 'details', v)}
                    style={[styles.modalInput, styles.modalTextarea]}
                    multiline
                    placeholder="Meal details"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setShowEditPlanModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveButton} onPress={() => void savePlanEdits()}>
                <Text style={styles.saveButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5FBF8',
    paddingTop: 64,
    paddingHorizontal: 16,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  goalHeadline: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#14532D',
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  goalInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#111827',
    fontWeight: '600',
    fontSize: 16,
  },
  editButton: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  editButtonText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },
  editIcon: {
    fontSize: 14,
  },
  visionWrap: {
    borderRadius: 16,
    overflow: 'visible',
    backgroundColor: '#E7F6F1',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    minHeight: 150,
    marginBottom: 14,
  },
  visionEditButton: {
    position: 'absolute',
    zIndex: 10,
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visionPhoto: {
    width: '100%',
    height: 170,
    borderRadius: 16,
  },
  visionCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
    margin: 10,
  },
  placeholderEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  placeholderText: {
    color: '#4B5563',
    textAlign: 'center',
    fontSize: 14,
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
    backgroundColor: '#D1D5DB',
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
    backgroundColor: 'rgba(255,255,255,0.88)',
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
    color: '#4B5563',
    lineHeight: 20,
  },
  dayCounter: {
    fontSize: 18,
    color: '#065F46',
    fontWeight: '700',
    marginBottom: 14,
  },
  dayCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  bottomArea: {
    marginTop: 'auto',
    paddingBottom: 26,
  },
  startButton: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: ACCENT,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    maxHeight: '86%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  modalLabel: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
    marginBottom: 6,
    marginTop: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#111827',
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 6,
    marginBottom: 8,
  },
  editMealCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
  },
  modalTextarea: {
    minHeight: 64,
    textAlignVertical: 'top',
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
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: {
    color: '#4B5563',
    fontWeight: '700',
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
    color: '#FFFFFF',
    fontWeight: '800',
  },
});

