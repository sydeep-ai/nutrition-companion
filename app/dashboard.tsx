import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  DevSettings,
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

const ACCENT = '#D85A30';
const SURFACE = '#2E2E2E';
const BG = '#1A1A1A';
const TEXT_PRIMARY = '#FAFAFA';
const TEXT_SECONDARY = '#F0997B';
const COMPLETION = '#1D9E75';
const TICK_STORAGE_KEY = 'today_tick_state_v1';
const MEAL_PLAN_STORAGE_KEY = 'meal_plan';
const REWARD_NAME_STORAGE_KEY = 'reward_name';
const REWARD_PHOTO_STORAGE_KEY = 'reward_photo';
const VISION_PHOTOS_KEY = 'vision_photos';
const VISION_SLOTS = 5;

type Props = {
  onStartToday: () => void;
  refreshKey?: number;
};

type TickState = {
  date: string;
  checkedIds: string[];
};

const getTodayKey = () => new Date().toISOString().slice(0, 10);

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

export default function DashboardScreen({ onStartToday, refreshKey = 0 }: Props) {
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
  const [mealsDoneToday, setMealsDoneToday] = useState(0);
  const [visionIndex, setVisionIndex] = useState(0);
  const [mealPlan, setMealPlan] = useState<Meal[]>(plan1);
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [editTargetDays, setEditTargetDays] = useState('30');
  const [editStartDate, setEditStartDate] = useState('');
  const [editMeals, setEditMeals] = useState<Meal[]>(plan1);
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
        todayTickRaw,
        mealPlanRaw,
        rewardNameRaw,
        rewardPhotoRaw,
      ] = await Promise.all([
        AsyncStorage.getItem('user_name'),
        AsyncStorage.getItem('user_goal'),
        AsyncStorage.getItem(VISION_PHOTOS_KEY),
        AsyncStorage.getItem('target_days'),
        AsyncStorage.getItem('plan_start_date'),
        AsyncStorage.getItem(TICK_STORAGE_KEY),
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

  const resetOnboarding = async () => {
    await AsyncStorage.removeItem('onboarding_complete');
    try {
      DevSettings.reload();
    } catch {
      Alert.alert('Reset complete', 'Onboarding has been reset. Please restart the app.');
    }
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
        <Text style={styles.rewardNameText}>
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

      <ScrollView
        style={styles.bottomScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.bottomScrollContent}
      >
        <View style={[styles.dayCounterRow, styles.dayCounterAboveTiles]}>
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
          <Pressable style={styles.resetLinkWrap} onPress={() => void resetOnboarding()}>
            <Text style={styles.resetLinkText}>Reset Onboarding</Text>
          </Pressable>
        </View>
      </ScrollView>

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
    backgroundColor: BG,
    paddingTop: 64,
    paddingHorizontal: 16,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  goalHeadline: {
    flex: 1,
    fontSize: 21,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
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
    fontWeight: '600',
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
    fontWeight: '700',
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
    marginBottom: 28,
  },
  visionEditButtonOverlay: {
    position: 'absolute',
    zIndex: 10,
    top: 8,
    right: 8,
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
  },
  dayCounter: {
    fontSize: 21,
    color: TEXT_PRIMARY,
    fontWeight: '700',
    marginBottom: 0,
  },
  dayCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dayCounterAboveTiles: {
    marginTop: 16,
    marginBottom: 0,
  },
  bottomScroll: {
    flex: 1,
  },
  bottomScrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 0,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
  },
  rewardSection: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 0,
  },
  rewardTitle: {
    color: ACCENT,
    fontSize: 21,
    fontWeight: '700',
    marginBottom: 6,
  },
  rewardNameText: {
    color: '#FAFAFA',
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 10,
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
    fontWeight: '700',
  },
  statCard: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    textAlign: 'center',
  },
  bottomArea: {
    marginTop: 0,
    paddingBottom: 0,
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
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '800',
  },
  resetLinkWrap: {
    marginTop: 12,
    alignSelf: 'center',
    marginBottom: 0,
  },
  resetLinkText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
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
    fontWeight: '700',
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
    fontWeight: '300',
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
    fontWeight: '800',
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
    fontWeight: '700',
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
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 10,
  },
  modalLabel: {
    color: TEXT_SECONDARY,
    fontWeight: '600',
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
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginTop: 6,
    marginBottom: 8,
  },
  editMealCard: {
    borderWidth: 1,
    borderColor: '#3F3F3F',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: SURFACE,
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
    borderColor: '#3F3F3F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: SURFACE,
  },
  cancelButtonText: {
    color: TEXT_SECONDARY,
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
    color: TEXT_PRIMARY,
    fontWeight: '800',
  },
});

