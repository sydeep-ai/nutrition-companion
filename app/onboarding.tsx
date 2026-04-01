import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { plan1 } from '../data/plan1';

const ACCENT = '#1D9E75';
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
  const [selectedTargetDays, setSelectedTargetDays] = useState<number | null>(null);
  const [customTargetDays, setCustomTargetDays] = useState('');
  const [saving, setSaving] = useState(false);

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

  const goNext = () => setStep((s) => Math.min(s + 1, 6));
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
        ['target_days', String(resolvedTargetDays)],
        ['plan_start_date', new Date().toISOString()],
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
          <Pressable style={styles.primaryButton} onPress={goNext}>
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
        <Text style={styles.heading}>Meal plan preview</Text>
        <Text style={styles.previewSubtext}>
          You can customise this anytime from Settings
        </Text>

        <View style={styles.previewCard}>
          {plan1.map((meal) => (
            <View key={meal.id} style={styles.previewRow}>
              <Text style={styles.previewTime}>{meal.time}</Text>
              <Text style={styles.previewMeal}>{meal.title}</Text>
            </View>
          ))}
        </View>

        <Pressable style={styles.primaryButton} onPress={() => void finishOnboarding()}>
          <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : "Let's go"}</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step > 0 ? (
          <View style={styles.topBar}>
            <Pressable onPress={goBack}>
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <Text style={styles.stepText}>
              {step + 1}/7
            </Text>
          </View>
        ) : null}
        {renderStep()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5FBF8',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backText: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '600',
  },
  stepText: {
    color: '#6B7280',
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
    color: '#0F5132',
    textAlign: 'center',
  },
  tagline: {
    marginTop: 10,
    marginBottom: 32,
    fontSize: 18,
    color: '#374151',
    textAlign: 'center',
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
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
    color: '#6B7280',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipSelected: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  chipText: {
    color: '#065F46',
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
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
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
    color: '#047857',
    lineHeight: 28,
  },
  targetCardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  targetCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 18,
  },
  targetCardSelected: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  targetCardText: {
    color: '#065F46',
    fontWeight: '700',
  },
  targetCardTextSelected: {
    color: '#FFFFFF',
  },
  previewSubtext: {
    color: '#6B7280',
    marginBottom: 14,
  },
  previewCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginBottom: 16,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingVertical: 8,
  },
  previewTime: {
    color: '#065F46',
    fontWeight: '700',
  },
  previewMeal: {
    color: '#111827',
    fontWeight: '600',
  },
});
