import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FONT_BODY, FONT_SEMIBOLD, FONT_BOLD, FONT_EXTRA } from '../constants/fonts';
import { PlanMeal } from '../data/defaultMealPlan';

const ACCENT = '#D85A30';
const SURFACE = '#2E2E2E';
const VISION_SLOTS = 5;

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

const TRACKING_ORDER = [
  'meals',
  'steps',
  'workout',
  'water',
  'supplements',
  'custom',
] as const;

type TrackingId = (typeof TRACKING_ORDER)[number];

const TRACKING_TYPES: {
  id: TrackingId;
  emoji: string;
  title: string;
  subtitle: string;
}[] = [
  { id: 'meals', emoji: '🍽️', title: 'Meals', subtitle: 'Your daily meal plan' },
  { id: 'steps', emoji: '👟', title: 'Steps', subtitle: 'Daily step goal' },
  { id: 'workout', emoji: '💪', title: 'Workout', subtitle: 'Gym, run, yoga...' },
  { id: 'water', emoji: '💧', title: 'Water', subtitle: 'Daily hydration' },
  { id: 'supplements', emoji: '💊', title: 'Supplements', subtitle: 'Vitamins and pills' },
  { id: 'custom', emoji: '⭐', title: 'Custom', subtitle: 'Track anything else' },
];

const CUSTOM_EMOJI_CYCLE = ['⭐', '🧘', '🚴', '📚', '🎯', '🌿'] as const;

type CustomItemRow = { label: string; emoji: string };

type Props = {
  onComplete: () => void;
};

const goalChips = [
  'Upcoming Holiday Hotness',
  'Drop a size',
  'Bulk up',
  'See my abs',
  'Feel strong and confident',
  'Look amazing at a special event',
];

const INTENTION_PLACEHOLDER = 'e.g. Eat more protein at every meal';
const INTENTION_CHIPS = [
  'Eat more protein',
  'Drink 2L water daily',
  'Move every day',
  'No snacking after 8pm',
  'Meal prep Sundays',
] as const;
const MAX_INTENTIONS = 5;

const MEAL_KEYWORDS = [
  'eat',
  'food',
  'protein',
  'meal',
  'diet',
  'nutrition',
  'calories',
  'breakfast',
  'lunch',
  'dinner',
] as const;
const STEPS_KEYWORDS = ['move', 'steps', 'walk', 'active', '10000', '10k'] as const;
const WORKOUT_KEYWORDS = [
  'gym',
  'workout',
  'train',
  'exercise',
  'lift',
  'run',
  'yoga',
] as const;
const WATER_KEYWORDS = ['water', 'hydration', 'drink', '2l', '2 litre', 'liters', 'litres'] as const;
const SUPP_KEYWORDS = ['supplement', 'vitamin', 'iron', 'b12'] as const;

/** Suggested tracking ids (meals/steps/workout/water/supplements only), TRACKING_ORDER order, deduped. */
function inferTrackingFromIntentionText(blob: string): TrackingId[] {
  const t = blob.toLowerCase();
  const found = new Set<TrackingId>();
  for (const w of MEAL_KEYWORDS) {
    if (t.includes(w)) found.add('meals');
  }
  for (const w of STEPS_KEYWORDS) {
    if (t.includes(w)) found.add('steps');
  }
  for (const w of WORKOUT_KEYWORDS) {
    if (t.includes(w)) found.add('workout');
  }
  for (const w of WATER_KEYWORDS) {
    if (t.includes(w)) found.add('water');
  }
  for (const w of SUPP_KEYWORDS) {
    if (t.includes(w)) found.add('supplements');
  }
  return TRACKING_ORDER.filter((id) => found.has(id));
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState('');
  const [chipGoal, setChipGoal] = useState('');
  const [customGoal, setCustomGoal] = useState('');
  const [userWhy, setUserWhy] = useState('');
  const [visionPhotos, setVisionPhotos] = useState<string[]>([]);
  const [rewardName, setRewardName] = useState('');
  const [rewardPhoto, setRewardPhoto] = useState<string>('');
  const [selectedTargetDays, setSelectedTargetDays] = useState<number | null>(null);
  const [customTargetDays, setCustomTargetDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [planMeals, setPlanMeals] = useState<PlanMeal[]>([
    { id: `meal-${Date.now()}`, emoji: '', title: '', time: '', intention: '' },
  ]);
  const [showMealPlanError, setShowMealPlanError] = useState(false);
  const [selectedTrackingIds, setSelectedTrackingIds] = useState<Set<TrackingId>>(() => new Set());
  const [trackingSelectionError, setTrackingSelectionError] = useState(false);
  const [trackingOrder, setTrackingOrder] = useState<TrackingId[]>([]);
  const [stepsGoalStr, setStepsGoalStr] = useState('10000');
  const [workoutLabel, setWorkoutLabel] = useState('');
  const [waterGoalStr, setWaterGoalStr] = useState('8');
  const [customItemRows, setCustomItemRows] = useState<CustomItemRow[]>([
    { label: '', emoji: '⭐' },
  ]);
  const [intentionRows, setIntentionRows] = useState<string[]>(['', '']);

  const [mealTypeModalIndex, setMealTypeModalIndex] = useState<number | null>(null);
  const [mealTypeModalCustom, setMealTypeModalCustom] = useState(false);
  const [mealTypeCustomDraft, setMealTypeCustomDraft] = useState('');

  const configFlowOrder = useMemo(
    () => TRACKING_ORDER.filter((id) => trackingOrder.includes(id) && id !== 'supplements'),
    [trackingOrder]
  );

  const closeMealTypeModal = () => {
    setMealTypeModalIndex(null);
    setMealTypeModalCustom(false);
    setMealTypeCustomDraft('');
  };

  const showIosMealTypeActionSheet = (idx: number) => {
    const m = planMeals[idx];
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
              setPlanMeals((prev) =>
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
        setPlanMeals((prev) =>
          prev.map((meal, i) =>
            i === idx ? { ...meal, emoji: preset.emoji, title: preset.title } : meal
          )
        );
      }
    );
  };

  const openMealTypeModal = (idx: number) => {
    const m = planMeals[idx];
    if (!m) return;
    if (Platform.OS === 'ios') {
      showIosMealTypeActionSheet(idx);
      return;
    }
    const matchesPreset = mealMatchesPreset(m.emoji, m.title);
    const isCustom = m.title.trim() !== '' && !matchesPreset;
    setMealTypeModalIndex(idx);
    setMealTypeModalCustom(isCustom);
    setMealTypeCustomDraft(isCustom ? m.title : '');
  };

  const applyMealPresetOnboarding = (emoji: string, title: string) => {
    const idx = mealTypeModalIndex;
    if (idx === null) return;
    setPlanMeals((prev) =>
      prev.map((meal, i) => (i === idx ? { ...meal, emoji, title } : meal))
    );
    closeMealTypeModal();
  };

  const applyMealCustomOnboarding = () => {
    const t = mealTypeCustomDraft.trim();
    if (!t) {
      Alert.alert('Custom name', 'Please enter a meal name.');
      return;
    }
    const idx = mealTypeModalIndex;
    if (idx === null) return;
    setPlanMeals((prev) =>
      prev.map((meal, i) =>
        i === idx ? { ...meal, emoji: CUSTOM_MEAL_EMOJI, title: t } : meal
      )
    );
    closeMealTypeModal();
  };

  const normalizeMealsForSave = (meals: PlanMeal[]) =>
    meals.map((m) => ({
      ...m,
      emoji: (m.emoji || '🍽️').trim(),
      title: m.title.trim(),
      time: m.time.trim(),
      intention: m.intention.trim(),
    }));

  const resolvedGoal = useMemo(() => {
    return customGoal.trim() || chipGoal;
  }, [chipGoal, customGoal]);

  const resolvedTargetDays = useMemo(() => {
    const custom = Number(customTargetDays);
    if (Number.isFinite(custom) && custom > 0) {
      return Math.floor(custom);
    }
    return selectedTargetDays;
  }, [customTargetDays, selectedTargetDays]);

  const pickVisionPhoto = async (slotIndex: number) => {
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
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const uri = result.assets[0]?.uri;
    if (!uri) {
      return;
    }

    setVisionPhotos((prev) => {
      const next = [...prev];
      next[slotIndex] = uri;
      return next;
    });
  };

  const pickRewardPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(
        'Photo access needed',
        'Please enable Photos permission in Settings to add a reward photo.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const uri = result.assets[0]?.uri;
    if (!uri) {
      return;
    }

    setRewardPhoto(uri);
  };

  const goNext = () => setStep((s) => s + 1);
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const toggleTrackingId = (id: TrackingId) => {
    setTrackingSelectionError(false);
    setSelectedTrackingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const continueFromBuildPlan = () => {
    const ordered = TRACKING_ORDER.filter((id) => selectedTrackingIds.has(id));
    if (ordered.length === 0) {
      setTrackingSelectionError(true);
      return;
    }
    void AsyncStorage.setItem('tracking_config', JSON.stringify(ordered));
    setTrackingOrder(ordered);
    setTrackingSelectionError(false);
    setStep(7);
  };

  const finishOnboarding = async () => {
    if (saving) {
      return;
    }
    if (!resolvedTargetDays) {
      Alert.alert('Pick a target', 'Please choose 30/60/90 days or enter a custom number.');
      return;
    }

    setSaving(true);
    try {
      const pairs: [string, string][] = [
        ['user_name', userName.trim()],
        ['user_goal', resolvedGoal.trim()],
        ['user_why', userWhy.trim()],
        ['vision_photos', JSON.stringify(visionPhotos.filter(Boolean))],
        ['reward_name', rewardName.trim()],
        ['reward_photo', rewardPhoto || ''],
        ['target_days', String(resolvedTargetDays)],
        ['plan_start_date', new Date().toISOString()],
        ['onboarding_complete', 'true'],
        ['tracking_config', JSON.stringify(trackingOrder)],
      ];

      if (trackingOrder.includes('meals')) {
        pairs.push(['meal_plan', JSON.stringify(planMeals)]);
      } else {
        pairs.push(['meal_plan', JSON.stringify([])]);
      }

      if (trackingOrder.includes('steps')) {
        const n = Number(stepsGoalStr);
        if (!Number.isFinite(n) || n <= 0) {
          setSaving(false);
          Alert.alert('Invalid steps goal', 'Please enter a positive number.');
          return;
        }
        pairs.push(['steps_goal', String(Math.floor(n))]);
      }

      if (trackingOrder.includes('workout')) {
        pairs.push(['workout_label', workoutLabel.trim()]);
      }

      if (trackingOrder.includes('water')) {
        const w = Number(waterGoalStr);
        if (!Number.isFinite(w) || w <= 0) {
          setSaving(false);
          Alert.alert('Invalid water goal', 'Please enter a positive number of cups.');
          return;
        }
        pairs.push(['water_goal', String(Math.floor(w))]);
      }

      if (trackingOrder.includes('supplements')) {
        pairs.push(['supplement_list', JSON.stringify([])]);
      }

      if (trackingOrder.includes('custom')) {
        const items = customItemRows
          .filter((c) => c.label.trim())
          .map((c) => ({ label: c.label.trim(), emoji: c.emoji }));
        pairs.push(['custom_items', JSON.stringify(items)]);
      }

      await AsyncStorage.multiSet(pairs);
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const advanceAfterConfig = (isLast: boolean) => {
    if (isLast) {
      setStep(8 + configFlowOrder.length);
    } else {
      setStep((s) => s + 1);
    }
  };

  const cycleCustomEmojiAt = (index: number) => {
    setCustomItemRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const ci = CUSTOM_EMOJI_CYCLE.findIndex((e) => e === r.emoji);
        const nextIndex = ci >= 0 ? (ci + 1) % CUSTOM_EMOJI_CYCLE.length : 0;
        return { ...r, emoji: CUSTOM_EMOJI_CYCLE[nextIndex] };
      })
    );
  };

  const renderStep = () => {
    if (step === 0) {
      return (
        <View style={styles.centerStep}>
          <Text style={styles.appName}>My Health Coach</Text>
          <Text style={styles.tagline}>Show up. Track it. Earn it.</Text>
          <Pressable style={styles.letsGetStartedButton} onPress={goNext}>
            <Text style={styles.primaryButtonText}>Let&apos;s get started</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 1) {
      return (
        <View style={styles.stepBody}>
          <Text style={styles.heading}>What should we call you?</Text>
          <TextInput
            value={userName}
            onChangeText={setUserName}
            placeholder="Your name"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              if (!userName.trim()) {
                Alert.alert('Add your name', 'Please enter your name to continue.');
                return;
              }
              goNext();
            }}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 2) {
      return (
        <View style={styles.stepBody}>
          <Text style={styles.heading}>What are you working towards?</Text>
          <View style={styles.chipsWrap}>
            {goalChips.map((chip) => {
              const selected = chipGoal === chip;
              return (
                <Pressable
                  key={chip}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setChipGoal(chip)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {chip}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={customGoal}
            onChangeText={setCustomGoal}
            placeholder="Or write your own goal"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              if (!resolvedGoal.trim()) {
                Alert.alert('Add a goal', 'Choose a goal chip or enter a custom goal.');
                return;
              }
              goNext();
            }}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 3) {
      return (
        <View style={styles.stepBody}>
          <Text style={styles.heading}>Why does this matter to you?</Text>
          <TextInput
            value={userWhy}
            onChangeText={setUserWhy}
            placeholder="Write your why..."
            placeholderTextColor="#9CA3AF"
            style={[styles.input, styles.tallInput]}
            multiline
          />
          <Pressable style={styles.primaryButton} onPress={goNext}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
          <Pressable onPress={goNext}>
            <Text style={styles.skipText}>Add Later</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 4) {
      return (
        <View style={styles.stepBody}>
          <Text style={styles.heading}>Add photos that represent your goal</Text>
          <Text style={styles.visionBoardDescription}>
            This is your vision board — photos that represent what you&apos;re working towards. You
            can add or update these anytime from your dashboard.
          </Text>
          <View style={styles.visionGrid}>
            {Array.from({ length: VISION_SLOTS }).map((_, index) => {
              const uri = visionPhotos[index];
              return (
                <Pressable
                  key={`vision-${index}`}
                  style={styles.visionSlot}
                  onPress={() => void pickVisionPhoto(index)}
                >
                  {uri ? (
                    <Image source={{ uri }} style={styles.visionImage} />
                  ) : (
                    <Text style={styles.visionPlus}>+</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.primaryButton} onPress={goNext}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
          <Pressable onPress={goNext}>
            <Text style={styles.skipText}>Add Later</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 5) {
      const saveIntentionsAndContinue = async () => {
        const arr = intentionRows.map((s) => s.trim()).filter(Boolean);
        await AsyncStorage.setItem('user_intentions', JSON.stringify(arr));
        const inferred = inferTrackingFromIntentionText(arr.join(' '));
        setSelectedTrackingIds(new Set(inferred));
        setTrackingSelectionError(false);
        setStep(6);
      };

      const skipIntentions = async () => {
        await AsyncStorage.setItem('user_intentions', JSON.stringify([]));
        setSelectedTrackingIds(new Set());
        setTrackingSelectionError(false);
        setStep(6);
      };

      const fillNextEmptyIntention = (text: string) => {
        setIntentionRows((prev) => {
          const next = [...prev];
          const idx = next.findIndex((s) => !s.trim());
          if (idx === -1) {
            return prev;
          }
          next[idx] = text;
          return next;
        });
      };

      return (
        <View style={styles.stepBody}>
          <Text style={styles.heading}>What are you committing to change?</Text>
          <Text style={styles.subtext}>
            These 2-3 principles become your daily standard. Every evening, your AI check-in will
            measure your day against them — not generic advice, just honest feedback on what you
            said you&apos;d do.
          </Text>
          {intentionRows.map((value, idx) => (
            <View key={`intention-${idx}`} style={styles.intentionRow}>
              <TextInput
                value={value}
                onChangeText={(v) =>
                  setIntentionRows((prev) => prev.map((s, i) => (i === idx ? v : s)))
                }
                placeholder={INTENTION_PLACEHOLDER}
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.intentionInput]}
              />
              {intentionRows.length > 1 ? (
                <Pressable
                  style={styles.intentionDeleteBtn}
                  onPress={() =>
                    setIntentionRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
                  }
                >
                  <Text style={styles.intentionDeleteEmoji}>🗑️</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          {intentionRows.length < MAX_INTENTIONS ? (
            <Pressable
              style={styles.addAnotherLink}
              onPress={() =>
                setIntentionRows((prev) => (prev.length >= MAX_INTENTIONS ? prev : [...prev, '']))
              }
            >
              <Text style={styles.addAnotherLinkText}>+ Add another</Text>
            </Pressable>
          ) : null}
          <View style={styles.intentionChipsRow}>
            {INTENTION_CHIPS.map((chip, i) => (
              <React.Fragment key={chip}>
                {i > 0 ? <Text style={styles.intentionChipSep}> · </Text> : null}
                <Pressable onPress={() => fillNextEmptyIntention(chip)}>
                  <Text style={styles.intentionChipText}>{chip}</Text>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
          <Pressable style={styles.intentionsContinueButton} onPress={() => void saveIntentionsAndContinue()}>
            <Text style={styles.primaryButtonText}>Let&apos;s make a plan!</Text>
          </Pressable>
          <Pressable onPress={() => void skipIntentions()}>
            <Text style={styles.skipText}>Add Later</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 6) {
      return (
        <View style={styles.stepBody}>
          <Text style={styles.heading}>Build your plan</Text>
          <Text style={styles.subtext}>
            Here&apos;s what we suggest based on your intentions. Add anything else you want to
            track:
          </Text>
          {trackingSelectionError ? (
            <Text style={styles.trackingWarning}>
              Please select at least one area to track before continuing.
            </Text>
          ) : null}
          <View style={styles.trackingGrid}>
            {TRACKING_TYPES.map((t) => {
              const selected = selectedTrackingIds.has(t.id);
              return (
                <Pressable
                  key={t.id}
                  style={[styles.trackingCard, selected && styles.trackingCardSelected]}
                  onPress={() => toggleTrackingId(t.id)}
                >
                  <Text style={styles.trackingCardEmoji}>{t.emoji}</Text>
                  <Text style={styles.trackingCardTitle}>{t.title}</Text>
                  <Text style={styles.trackingCardSubtitle}>{t.subtitle}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.primaryButton} onPress={continueFromBuildPlan}>
            <Text style={styles.primaryButtonText}>Let&apos;s go!</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 7) {
      return (
        <View style={styles.stepBody}>
          <Text style={styles.heading}>How many days are you committing to?</Text>
          <View style={styles.targetCardsRow}>
            {[30, 60, 90].map((days) => {
              const selected = selectedTargetDays === days;
              return (
                <Pressable
                  key={`target-${days}`}
                  style={[styles.targetCard, selected && styles.targetCardSelected]}
                  onPress={() => {
                    setSelectedTargetDays(days);
                    setCustomTargetDays('');
                  }}
                >
                  <Text style={[styles.targetCardText, selected && styles.targetCardTextSelected]}>
                    {days} days
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={customTargetDays}
            onChangeText={setCustomTargetDays}
            placeholder="Or enter custom number of days"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            keyboardType="number-pad"
          />
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              if (!resolvedTargetDays) {
                Alert.alert(
                  'Pick your target',
                  'Please choose 30, 60, 90, or enter a custom number.'
                );
                return;
              }
              setStep(8);
            }}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 8 + configFlowOrder.length && trackingOrder.length > 0) {
      const rewardIntro =
        resolvedTargetDays != null && resolvedTargetDays > 0
          ? `You've committed to ${resolvedTargetDays} days of showing up for yourself. When you get there, you're going to celebrate. What's the one thing that would make hitting this goal feel truly worth it?`
          : `You've committed to your goal. When you get there, you're going to celebrate. What's the one thing that would make hitting this goal feel truly worth it?`;

      return (
        <View style={styles.stepBody}>
          <Text style={styles.heading}>What will you reward yourself with?</Text>
          <Text style={styles.rewardSubtext}>{rewardIntro}</Text>

          <TextInput
            value={rewardName}
            onChangeText={setRewardName}
            placeholder='Reward name (e.g. "Dyson Airwrap")'
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />

          <Pressable style={styles.rewardCard} onPress={() => void pickRewardPhoto()}>
            {rewardPhoto ? (
              <Image source={{ uri: rewardPhoto }} style={styles.rewardImage} />
            ) : (
              <View style={styles.rewardPlaceholder}>
                <Text style={styles.rewardEmoji}>🎁</Text>
                <Text style={styles.rewardPlaceholderText}>Tap to add a reward photo</Text>
              </View>
            )}
          </Pressable>

          <Pressable style={styles.primaryButton} onPress={() => void finishOnboarding()}>
            <Text style={styles.primaryButtonText}>
              {saving ? 'Saving...' : 'Lock it in 🔒'}
            </Text>
          </Pressable>
          <Pressable onPress={() => void finishOnboarding()} disabled={saving}>
            <Text style={styles.skipText}>Add Later</Text>
          </Pressable>
        </View>
      );
    }

    if (step >= 8 && step < 8 + configFlowOrder.length) {
      const configIndex = step - 8;
      const kind = configFlowOrder[configIndex];
      const isLast = configIndex === configFlowOrder.length - 1;
      if (!kind) {
        return null;
      }

      if (kind === 'steps') {
        return (
          <View style={styles.stepBody}>
            <Text style={styles.heading}>What&apos;s your daily steps goal?</Text>
            <TextInput
              value={stepsGoalStr}
              onChangeText={setStepsGoalStr}
              keyboardType="number-pad"
              placeholder="10000"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                const n = Number(stepsGoalStr);
                if (!Number.isFinite(n) || n <= 0) {
                  Alert.alert('Invalid steps goal', 'Please enter a positive number.');
                  return;
                }
                advanceAfterConfig(isLast);
              }}
            >
              <Text style={styles.primaryButtonText}>
                {saving ? 'Saving...' : 'Continue'}
              </Text>
            </Pressable>
          </View>
        );
      }

      if (kind === 'workout') {
        return (
          <View style={styles.stepBody}>
            <Text style={styles.heading}>What kind of workout?</Text>
            <Text style={styles.subtext}>Optional — e.g. Gym, Run, Yoga</Text>
            <TextInput
              value={workoutLabel}
              onChangeText={setWorkoutLabel}
              placeholder="What kind of workout? e.g. Gym, Run, Yoga"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />
            <Pressable style={styles.primaryButton} onPress={() => advanceAfterConfig(isLast)}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Continue'}</Text>
            </Pressable>
          </View>
        );
      }

      if (kind === 'water') {
        return (
          <View style={styles.stepBody}>
            <Text style={styles.heading}>How many cups per day?</Text>
            <TextInput
              value={waterGoalStr}
              onChangeText={setWaterGoalStr}
              keyboardType="number-pad"
              placeholder="8"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                const w = Number(waterGoalStr);
                if (!Number.isFinite(w) || w <= 0) {
                  Alert.alert('Invalid water goal', 'Please enter a positive number of cups.');
                  return;
                }
                advanceAfterConfig(isLast);
              }}
            >
              <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Continue'}</Text>
            </Pressable>
          </View>
        );
      }

      if (kind === 'custom') {
        return (
          <View style={styles.stepBody}>
            <Text style={styles.heading}>Custom trackers</Text>
            <Text style={styles.subtext}>Tap the emoji to cycle options</Text>
            {customItemRows.map((row, idx) => (
              <View key={`cust-${idx}`} style={styles.customRowCard}>
                <View style={styles.customRowTop}>
                  <Pressable style={styles.emojiPill} onPress={() => cycleCustomEmojiAt(idx)}>
                    <Text style={styles.emojiText}>{row.emoji}</Text>
                  </Pressable>
                  <TextInput
                    value={row.label}
                    onChangeText={(v) =>
                      setCustomItemRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, label: v } : r))
                      )
                    }
                    placeholder="What are you tracking?"
                    placeholderTextColor="#9CA3AF"
                    style={[styles.input, styles.customLabelInput]}
                  />
                </View>
                {customItemRows.length > 1 ? (
                  <Pressable
                    style={styles.removeRowBtn}
                    onPress={() =>
                      setCustomItemRows((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    <Text style={styles.removeRowBtnText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            <Pressable
              style={styles.addMealButton}
              onPress={() =>
                setCustomItemRows((prev) => [...prev, { label: '', emoji: '⭐' }])
              }
            >
              <Text style={styles.addMealButtonText}>+ Add custom tracker</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => advanceAfterConfig(isLast)}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Continue'}</Text>
            </Pressable>
          </View>
        );
      }

      if (kind === 'meals') {
        return (
          <>
            <View style={styles.stepBody}>
              <Text style={styles.heading}>Build your daily meal plan</Text>
              <Text style={styles.previewSubtext}>You can customise this anytime from Settings</Text>

              {showMealPlanError ? (
                <Text style={styles.errorText}>
                  Please choose a meal type for every meal slot before continuing.
                </Text>
              ) : null}

              {planMeals.map((meal, idx) => {
                const missingTitle = showMealPlanError && !meal.title.trim();

                return (
                  <View key={meal.id} style={styles.builderCard}>
                    <Pressable
                      style={styles.trashBtn}
                      onPress={() =>
                        setPlanMeals((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <Text style={styles.trashText}>🗑️</Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.mealTypeDropdownBtn,
                        missingTitle && styles.inputError,
                      ]}
                      onPress={() => openMealTypeModal(idx)}
                    >
                      <Text style={styles.mealTypeDropdownBtnText}>
                        {mealTypeDropdownLabel(meal)}
                      </Text>
                      <Text style={styles.mealTypeDropdownChevron}>▼</Text>
                    </Pressable>

                    <TextInput
                      value={meal.time}
                      onChangeText={(v) =>
                        setPlanMeals((prev) =>
                          prev.map((m, i) => (i === idx ? { ...m, time: v } : m))
                        )
                      }
                      placeholder="Time — e.g. 9:15am (optional)"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                    />

                    <TextInput
                      value={meal.intention}
                      onChangeText={(v) =>
                        setPlanMeals((prev) =>
                          prev.map((m, i) => (i === idx ? { ...m, intention: v } : m))
                        )
                      }
                      placeholder="Nutritional intention — e.g. High protein, light and veg-led (optional)"
                      placeholderTextColor="#9CA3AF"
                      style={[styles.input, styles.detailsInput]}
                      multiline
                    />
                  </View>
                );
              })}

              <Pressable
                style={styles.addMealButton}
                onPress={() => {
                  const id = `meal-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                  setPlanMeals((prev) => [
                    ...prev,
                    { id, emoji: '', title: '', time: '', intention: '' },
                  ]);
                }}
              >
                <Text style={styles.addMealButtonText}>+ Add meal</Text>
              </Pressable>

              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  const normalized = normalizeMealsForSave(planMeals);
                  const hasMissing = normalized.some((m) => !m.title.trim());
                  if (hasMissing) {
                    setShowMealPlanError(true);
                    return;
                  }
                  setShowMealPlanError(false);
                  setPlanMeals(normalized);
                  advanceAfterConfig(isLast);
                }}
              >
                <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Continue'}</Text>
              </Pressable>
            </View>

            <Modal
              visible={Platform.OS !== 'ios' && mealTypeModalIndex !== null}
              transparent
              animationType="fade"
              onRequestClose={closeMealTypeModal}
            >
              <View style={styles.mealTypeModalRoot}>
                <Pressable style={styles.mealTypeModalDismiss} onPress={closeMealTypeModal} />
                <View style={styles.mealTypeModalCard}>
                  <Text style={styles.mealTypeModalTitle}>Meal type</Text>
                  {!mealTypeModalCustom ? (
                    <ScrollView
                      style={styles.mealTypeModalScroll}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    >
                      {MEAL_TYPE_PRESETS.map((p) => (
                        <Pressable
                          key={`${p.emoji}-${p.title}`}
                          style={styles.mealTypeModalOption}
                          onPress={() => applyMealPresetOnboarding(p.emoji, p.title)}
                        >
                          <Text style={styles.mealTypeModalOptionText}>
                            {p.emoji} {p.title}
                          </Text>
                        </Pressable>
                      ))}
                      <Pressable
                        style={styles.mealTypeModalOption}
                        onPress={() => {
                          setMealTypeModalCustom(true);
                          setMealTypeCustomDraft('');
                        }}
                      >
                        <Text style={styles.mealTypeModalOptionText}>⭐ Custom</Text>
                      </Pressable>
                    </ScrollView>
                  ) : (
                    <View style={styles.mealTypeCustomWrap}>
                      <Text style={styles.mealTypeCustomHint}>Enter your meal name</Text>
                      <TextInput
                        value={mealTypeCustomDraft}
                        onChangeText={setMealTypeCustomDraft}
                        placeholder="e.g. Brunch, Post-workout shake"
                        placeholderTextColor="#9CA3AF"
                        style={styles.input}
                      />
                      <View style={styles.mealTypeCustomActions}>
                        <Pressable
                          style={styles.mealTypeModalSecondaryBtn}
                          onPress={() => {
                            setMealTypeModalCustom(false);
                            setMealTypeCustomDraft('');
                          }}
                        >
                          <Text style={styles.mealTypeModalSecondaryBtnText}>Back</Text>
                        </Pressable>
                        <Pressable
                          style={styles.mealTypeModalPrimaryBtn}
                          onPress={applyMealCustomOnboarding}
                        >
                          <Text style={styles.mealTypeModalPrimaryBtnText}>Done</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                  <Pressable style={styles.mealTypeModalCancel} onPress={closeMealTypeModal}>
                    <Text style={styles.mealTypeModalCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            </Modal>
          </>
        );
      }

      return null;
    }

    return null;
  };

  const stepTotalDenominator = configFlowOrder.length > 0 ? 9 + configFlowOrder.length : 10;

  const topBar =
    step > 0 ? (
      <View style={styles.topBar}>
        <Pressable onPress={goBack}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.stepText}>
          {step + 1}/{stepTotalDenominator}
        </Text>
      </View>
    ) : null;

  const scrollBody = (
    <>
      {topBar}
      {renderStep()}
    </>
  );

  return (
    <SafeAreaView style={styles.screen}>
      {step >= 8 && step < 8 + configFlowOrder.length ? (
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingFill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.scrollFill}
            contentContainerStyle={[styles.content, styles.mealPlanScrollBottom]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {scrollBody}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {scrollBody}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  mealPlanScrollBottom: {
    paddingBottom: 300,
  },
  keyboardAvoidingFill: {
    flex: 1,
  },
  scrollFill: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backText: {
    color: '#D1D5DB',
    fontSize: 14,
    fontFamily: FONT_SEMIBOLD,
  },
  stepText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontFamily: FONT_BODY,
  },
  centerStep: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
  },
  stepBody: {
    flex: 1,
  },
  appName: {
    fontSize: 34,
    fontFamily: FONT_EXTRA,
    color: '#FAFAFA',
    textAlign: 'center',
  },
  tagline: {
    marginTop: 10,
    marginBottom: 32,
    fontSize: 18,
    color: '#D1D5DB',
    textAlign: 'center',
    fontFamily: FONT_BODY,
  },
  heading: {
    fontSize: 28,
    fontFamily: FONT_EXTRA,
    color: '#FAFAFA',
    marginBottom: 14,
  },
  subtext: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    fontFamily: FONT_BODY,
  },
  rewardSubtext: {
    fontSize: 15,
    color: '#FAFAFA',
    lineHeight: 22,
    textAlign: 'center',
    fontStyle: 'italic',
    fontFamily: FONT_BODY,
  },
  input: {
    backgroundColor: '#2E2E2E',
    borderWidth: 1,
    borderColor: '#3F3F3F',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: FONT_BODY,
    color: '#FAFAFA',
    marginBottom: 18,
  },
  tallInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  primaryButton: {
    marginTop: 6,
    backgroundColor: ACCENT,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  letsGetStartedButton: {
    marginTop: 6,
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: ACCENT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 48,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: FONT_BOLD,
  },
  visionBoardDescription: {
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: FONT_BODY,
  },
  skipText: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: FONT_SEMIBOLD,
    color: '#9CA3AF',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    backgroundColor: '#2E2E2E',
    borderWidth: 1,
    borderColor: '#3F3F3F',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipSelected: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  chipText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontFamily: FONT_SEMIBOLD,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  visionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  visionSlot: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    backgroundColor: '#2E2E2E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  visionImage: {
    width: '100%',
    height: '100%',
  },
  visionPlus: {
    fontSize: 28,
    color: ACCENT,
    lineHeight: 28,
  },
  targetCardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  targetCard: {
    flex: 1,
    backgroundColor: '#2E2E2E',
    borderWidth: 1,
    borderColor: '#3F3F3F',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 18,
  },
  targetCardSelected: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  targetCardText: {
    color: '#D1D5DB',
    fontFamily: FONT_SEMIBOLD,
  },
  targetCardTextSelected: {
    color: '#FFFFFF',
  },
  previewSubtext: {
    color: '#D1D5DB',
    marginBottom: 14,
    fontFamily: FONT_BODY,
    fontSize: 14,
  },
  builderCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    backgroundColor: '#2E2E2E',
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 44,
    marginBottom: 12,
  },
  mealTypeDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2E2E2E',
    borderWidth: 1,
    borderColor: '#3F3F3F',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 18,
  },
  mealTypeDropdownBtnText: {
    flex: 1,
    fontSize: 15,
    color: '#FAFAFA',
    fontFamily: FONT_SEMIBOLD,
  },
  mealTypeDropdownChevron: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 8,
  },
  mealTypeModalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  mealTypeModalDismiss: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  mealTypeModalCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    padding: 16,
    maxHeight: '78%',
    zIndex: 1,
  },
  mealTypeModalTitle: {
    fontSize: 18,
    fontFamily: FONT_BOLD,
    color: '#FAFAFA',
    marginBottom: 12,
  },
  mealTypeModalScroll: {
    maxHeight: 320,
  },
  mealTypeModalOption: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3F3F3F',
  },
  mealTypeModalOptionText: {
    fontSize: 16,
    color: '#FAFAFA',
    fontFamily: FONT_SEMIBOLD,
  },
  mealTypeCustomWrap: {
    gap: 12,
  },
  mealTypeCustomHint: {
    fontSize: 14,
    color: '#D1D5DB',
    marginBottom: 4,
    fontFamily: FONT_BODY,
  },
  mealTypeCustomActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  mealTypeModalSecondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4B5563',
    alignItems: 'center',
  },
  mealTypeModalSecondaryBtnText: {
    color: '#D1D5DB',
    fontFamily: FONT_BOLD,
  },
  mealTypeModalPrimaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  mealTypeModalPrimaryBtnText: {
    color: '#FFFFFF',
    fontFamily: FONT_BOLD,
  },
  mealTypeModalCancel: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  mealTypeModalCancelText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontFamily: FONT_BODY,
  },
  emojiPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: '#1F1F1F',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  emojiText: {
    fontSize: 16,
  },
  row1: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  emojiBlock: {
    width: 78,
    alignItems: 'center',
  },
  timeInput: {
    flex: 1,
    marginBottom: 0,
  },
  detailsInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  trashBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: '#1F1F1F',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  trashText: {
    fontSize: 16,
  },
  addMealButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: '#2E2E2E',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  addMealButtonText: {
    color: '#D1D5DB',
    fontFamily: FONT_EXTRA,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontFamily: FONT_SEMIBOLD,
    marginBottom: 12,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  rewardCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    backgroundColor: '#2E2E2E',
    overflow: 'hidden',
    marginBottom: 16,
  },
  rewardImage: {
    width: '100%',
    height: 170,
  },
  rewardPlaceholder: {
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  rewardEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  rewardPlaceholderText: {
    color: '#D1D5DB',
    fontSize: 14,
    textAlign: 'center',
    fontFamily: FONT_SEMIBOLD,
  },
  trackingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
    justifyContent: 'space-between',
  },
  trackingCard: {
    width: '31%',
    minWidth: '28%',
    flexGrow: 1,
    maxWidth: '32%',
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3F3F3F',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  trackingCardSelected: {
    borderColor: ACCENT,
    backgroundColor: '#363636',
  },
  trackingCardEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  trackingCardTitle: {
    color: '#FAFAFA',
    fontSize: 13,
    fontFamily: FONT_SEMIBOLD,
    marginBottom: 4,
  },
  trackingCardSubtitle: {
    color: '#9CA3AF',
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FONT_SEMIBOLD,
  },
  trackingWarning: {
    color: '#EF4444',
    fontSize: 14,
    fontFamily: FONT_BOLD,
    marginBottom: 12,
  },
  removeRowBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  removeRowBtnText: {
    color: '#F87171',
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },
  customRowCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    backgroundColor: SURFACE,
    padding: 12,
    marginBottom: 12,
  },
  customRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customLabelInput: {
    flex: 1,
    marginBottom: 0,
  },
  intentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  intentionInput: {
    flex: 1,
    marginBottom: 0,
  },
  intentionDeleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: '#1F1F1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  intentionDeleteEmoji: {
    fontSize: 16,
  },
  addAnotherLink: {
    alignSelf: 'flex-start',
    marginBottom: 16,
    marginTop: -4,
  },
  addAnotherLinkText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontFamily: FONT_SEMIBOLD,
  },
  intentionChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 20,
  },
  intentionChipSep: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  intentionChipText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontFamily: FONT_SEMIBOLD,
    textDecorationLine: 'underline',
  },
  intentionsContinueButton: {
    marginTop: 6,
    backgroundColor: '#D85A30',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    width: '100%',
    alignSelf: 'stretch',
  },
});
