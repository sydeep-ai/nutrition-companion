import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PlanMeal } from '../data/defaultMealPlan';

const ACCENT = '#D85A30';
const VISION_SLOTS = 5;

type Props = {
  onComplete: () => void;
};

const goalChips = [
  'Holiday in Bali',
  'Fit into my size 10 jeans',
  'See my abs',
  'Feel strong and confident',
  'Look amazing at a special event',
];

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
    { id: `meal-${Date.now()}`, emoji: '', name: '', time: '', details: '' },
  ]);
  const [showMealPlanError, setShowMealPlanError] = useState(false);

  const emojiCycle = ['🌅', '🍳', '🥗', '🍎', '🍽️', '💊', '🥛', '🌙', '⚡', '🫖'];

  const normalizeMealsForSave = (meals: PlanMeal[]) =>
    meals.map((m) => ({
      ...m,
      emoji: (m.emoji || '🍽️').trim(),
      name: m.name.trim(),
      time: m.time.trim(),
      details: m.details.trim(),
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

  const goNext = () => setStep((s) => Math.min(s + 1, 7));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

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
      await AsyncStorage.multiSet([
        ['user_name', userName.trim()],
        ['user_goal', resolvedGoal.trim()],
        ['user_why', userWhy.trim()],
        ['vision_photos', JSON.stringify(visionPhotos.filter(Boolean))],
        ['reward_name', rewardName.trim()],
        ['reward_photo', rewardPhoto || ''],
        ['target_days', String(resolvedTargetDays)],
        ['plan_start_date', new Date().toISOString()],
        ['meal_plan', JSON.stringify(planMeals)],
        ['onboarding_complete', 'true'],
      ]);
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    if (step === 0) {
      return (
        <View style={styles.centerStep}>
          <Text style={styles.appName}>Nutrition Companion</Text>
          <Text style={styles.tagline}>Built around your why.</Text>
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
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 4) {
      return (
        <View style={styles.stepBody}>
          <Text style={styles.heading}>Add photos that represent your goal</Text>
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
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 5) {
      return (
        <View style={styles.stepBody}>
          <Text style={styles.heading}>What will you reward yourself with?</Text>
          <Text style={styles.subtext}>
            Make it something you really want. A trip, an item, an experience — something that
            makes showing up worth it.
          </Text>

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

          <Pressable style={styles.primaryButton} onPress={goNext}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
          <Pressable onPress={goNext}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 6) {
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
              goNext();
            }}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.stepBody}>
        <Text style={styles.heading}>Build your daily meal plan</Text>
        <Text style={styles.previewSubtext}>You can customise this anytime from Settings</Text>

        {showMealPlanError ? (
          <Text style={styles.errorText}>
            Please fill in a time and meal name for every meal before continuing.
          </Text>
        ) : null}

        {planMeals.map((meal, idx) => {
          const missingTime = showMealPlanError && !meal.time.trim();
          const missingName = showMealPlanError && !meal.name.trim();
          const effectiveEmoji = (meal.emoji || '🍽️').trim();

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

              <View style={styles.row1}>
                <View style={styles.emojiBlock}>
                  <Pressable
                    style={styles.emojiPill}
                    onPress={() => {
                      setPlanMeals((prev) =>
                        prev.map((m, i) => {
                          if (i !== idx) return m;
                          const current = (m.emoji || '🍽️').trim();
                          const currentIndex = emojiCycle.indexOf(current);
                          const nextIndex =
                            currentIndex >= 0
                              ? (currentIndex + 1) % emojiCycle.length
                              : 0;
                          return { ...m, emoji: emojiCycle[nextIndex] };
                        })
                      );
                    }}
                  >
                    <Text style={styles.emojiText}>{effectiveEmoji}</Text>
                  </Pressable>
                </View>

                <TextInput
                  value={meal.time}
                  onChangeText={(v) =>
                    setPlanMeals((prev) =>
                      prev.map((m, i) => (i === idx ? { ...m, time: v } : m))
                    )
                  }
                  placeholder="Time — e.g. 9:15am"
                  placeholderTextColor="#9CA3AF"
                  style={[styles.input, styles.timeInput, missingTime && styles.inputError]}
                />
              </View>

              <TextInput
                value={meal.name}
                onChangeText={(v) =>
                  setPlanMeals((prev) =>
                    prev.map((m, i) => (i === idx ? { ...m, name: v } : m))
                  )
                }
                placeholder="Meal Name — e.g. Breakfast"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, missingName && styles.inputError]}
              />

              <TextInput
                value={meal.details}
                onChangeText={(v) =>
                  setPlanMeals((prev) =>
                    prev.map((m, i) => (i === idx ? { ...m, details: v } : m))
                  )
                }
                placeholder="Details — e.g. 2 eggs, toast... (optional)"
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
              { id, emoji: '', name: '', time: '', details: '' },
            ]);
          }}
        >
          <Text style={styles.addMealButtonText}>+ Add meal</Text>
        </Pressable>

        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            const normalized = normalizeMealsForSave(planMeals);
            const hasMissing = normalized.some((m) => !m.time || !m.name);
            if (hasMissing) {
              setShowMealPlanError(true);
              return;
            }
            setShowMealPlanError(false);
            setPlanMeals(normalized);
            void finishOnboarding();
          }}
        >
          <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : "Let's go"}</Text>
        </Pressable>
      </View>
    );
  };

  const topBar =
    step > 0 ? (
      <View style={styles.topBar}>
        <Pressable onPress={goBack}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.stepText}>
          {step + 1}/8
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
      {step === 7 ? (
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
    fontWeight: '600',
  },
  stepText: {
    color: '#9CA3AF',
    fontSize: 13,
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
    fontWeight: '800',
    color: '#FAFAFA',
    textAlign: 'center',
  },
  tagline: {
    marginTop: 10,
    marginBottom: 32,
    fontSize: 18,
    color: '#D1D5DB',
    textAlign: 'center',
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FAFAFA',
    marginBottom: 14,
  },
  subtext: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#2E2E2E',
    borderWidth: 1,
    borderColor: '#3F3F3F',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
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
    fontWeight: '700',
  },
  skipText: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '700',
  },
  targetCardTextSelected: {
    color: '#FFFFFF',
  },
  previewSubtext: {
    color: '#D1D5DB',
    marginBottom: 14,
  },
  builderCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    backgroundColor: '#2E2E2E',
    padding: 12,
    marginBottom: 12,
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
    fontWeight: '800',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '700',
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
    fontWeight: '600',
  },
});
