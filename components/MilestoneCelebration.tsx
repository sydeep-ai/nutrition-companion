import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { FONT_BODY, FONT_BOLD, FONT_EXTRA } from '../constants/fonts';

const OBSIDIAN = '#1A1A1A';
const TEXT = '#FAFAFA';
const EMBER = '#D85A30';
const TEAL = '#1D9E75';
const CHARCOAL = '#2E2E2E';
const CARD = '#2E2E2E';

export type MilestoneDay = 7 | 14 | 30;

export type MilestoneCelebrationPayload = {
  milestone: MilestoneDay;
  currentDay: number;
  targetDays: number;
  percent: number;
  userName: string;
  userGoal: string;
  userWhy: string;
  rewardName: string;
  rewardPhotoUri: string | null;
};

/**
 * Production milestone gates (plan day from App.tsx, inclusive).
 * Day-7 screen only when day >= 7; day-14 when day >= 14; day-30 when day >= 30.
 * Do not use test thresholds (1 / 2 / 3) here.
 */
export const MILESTONE_TRIGGER_DAY_FOR_7 = 7 as const;
export const MILESTONE_TRIGGER_DAY_FOR_14 = 14 as const;
export const MILESTONE_TRIGGER_DAY_FOR_30 = 30 as const;

type Props = {
  visible: boolean;
  payload: MilestoneCelebrationPayload | null;
  onDismiss: () => void | Promise<void>;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function headlineFor(milestone: MilestoneDay, name: string): string {
  const n = name.trim() || 'friend';
  switch (milestone) {
    case 7:
      return `One week in, ${n}!`;
    case 14:
      return 'Two weeks of showing up.';
    case 30:
      return '30 days. You did it.';
    default:
      return '';
  }
}

function subtextFor(milestone: MilestoneDay): string {
  switch (milestone) {
    case 7:
      return "Most people quit before Day 7. You didn't. That says something.";
    case 14:
      return "Science says 21 days builds a habit. You're two thirds there.";
    case 30:
      return 'A full month of choosing yourself every single day. This is who you are now.';
    default:
      return '';
  }
}

function badgeEmoji(milestone: MilestoneDay): string {
  switch (milestone) {
    case 7:
      return '🔥';
    case 14:
      return '💪';
    case 30:
      return '🏆';
    default:
      return '⭐';
  }
}

function buildPersonalMessage(
  milestone: MilestoneDay,
  name: string,
  goal: string,
  why: string,
  reward: string
): string {
  const n = name.trim() || 'friend';
  const g = goal.trim() || 'your goal';
  const w = why.trim();
  const r = reward.trim() || 'what you promised yourself';

  if (milestone === 7) {
    if (w) {
      return `${n}, you're going after "${g}" — and you started because ${w}. That still matters. Keep ${r} in sight.`;
    }
    return `${n}, a full week leaning into "${g}". ${r} is still the prize — and you're on your way.`;
  }
  if (milestone === 14) {
    if (w) {
      return `Two weeks strong, ${n}. "${g}" and your why — ${w} — with ${r} still ahead. You're stacking proof.`;
    }
    return `Two weeks strong, ${n}. "${g}" is adding up, and ${r} is closer than on Day 1.`;
  }
  if (w) {
    return `${n}: 30 days living "${g}", driven by ${w}. ${r} isn't hypothetical anymore — you earned this chapter.`;
  }
  return `${n}: 30 days of "${g}". You showed up for yourself; ${r} belongs in the story you're writing.`;
}

const CONFETTI_COUNT = 32;

function ConfettiLayer() {
  const particles = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        id: i,
        color: i % 2 === 0 ? EMBER : TEAL,
        left: Math.random() * Math.max(1, SCREEN_WIDTH - 12),
        size: 4 + Math.random() * 5,
        delay: Math.random() * 900,
        duration: 1800 + Math.random() * 1400,
      })),
    []
  );

  return (
    <View style={styles.confettiHost} pointerEvents="none">
      {particles.map((p) => (
        <ConfettiDot key={p.id} {...p} />
      ))}
    </View>
  );
}

function ConfettiDot({
  left,
  size,
  color,
  delay,
  duration,
}: {
  left: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = () => {
      progress.setValue(0);
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
      ]).start(() => run());
    };
    run();
  }, [delay, duration, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-24, 200],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.08, 0.82, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      style={[
        styles.confettiDot,
        {
          left,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    />
  );
}

export default function MilestoneCelebration({ visible, payload, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (!payload || sharing) return;
    setSharing(true);
    try {
      await new Promise((r) => setTimeout(r, 80));
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
      });
      const label =
        payload.milestone === 7
          ? 'Day 7'
          : payload.milestone === 14
            ? 'Day 14'
            : 'Day 30';
      await Share.share({
        message: `${label} with my nutrition journey — ${headlineFor(payload.milestone, payload.userName)}`,
        url: uri,
      });
    } catch {
      /* ignore share errors */
    } finally {
      setSharing(false);
    }
  }, [payload, sharing]);

  if (!payload) {
    return null;
  }

  const { milestone, currentDay, targetDays, percent, userName, userGoal, userWhy, rewardName, rewardPhotoUri } =
    payload;
  const headline = headlineFor(milestone, userName);
  const sub = subtextFor(milestone);
  const personal = buildPersonalMessage(milestone, userName, userGoal, userWhy, rewardName);
  const showPhoto = Boolean(rewardPhotoUri?.trim());
  const rewardFallback = rewardName.trim() || 'Your reward';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => void onDismiss()}
    >
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ConfettiLayer />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View ref={cardRef} collapsable={false} style={styles.shareCard}>
            <View style={styles.badgeBlock}>
              <Text style={styles.badgeEmoji}>{badgeEmoji(milestone)}</Text>
              <Text style={styles.badgeDay}>Day {milestone}</Text>
            </View>

            <Text style={styles.headline}>{headline}</Text>
            <Text style={styles.subtext}>{sub}</Text>

            {showPhoto ? (
              <Image source={{ uri: rewardPhotoUri! }} style={styles.rewardImage} resizeMode="cover" />
            ) : (
              <View style={styles.rewardNameWrap}>
                <Text style={styles.rewardNameLarge}>{rewardFallback}</Text>
              </View>
            )}

            <Text style={styles.progressStat}>
              Day {currentDay} of {targetDays} · {percent}% there
            </Text>

            <Text style={styles.personal}>{personal}</Text>
          </View>

          <Pressable
            style={[styles.shareBtn, sharing && styles.shareBtnDisabled]}
            onPress={() => void handleShare()}
            disabled={sharing}
          >
            {sharing ? (
              <ActivityIndicator color={TEXT} />
            ) : (
              <Text style={styles.shareBtnText}>Share this moment 🎉</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.keepBtn}
            onPress={() => void onDismiss()}
            accessibilityRole="button"
            accessibilityLabel="Keep going"
          >
            <Text style={styles.keepBtnText}>Keep going →</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: OBSIDIAN,
  },
  confettiHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    zIndex: 1,
    overflow: 'hidden',
  },
  confettiDot: {
    position: 'absolute',
    top: 0,
  },
  scroll: {
    flex: 1,
    zIndex: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  shareCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 22,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#3F3F3F',
  },
  badgeBlock: {
    alignItems: 'center',
    marginBottom: 16,
  },
  badgeEmoji: {
    fontSize: 52,
    marginBottom: 4,
  },
  badgeDay: {
    color: TEAL,
    fontSize: 28,
    fontFamily: FONT_EXTRA,
  },
  headline: {
    color: TEXT,
    fontSize: 24,
    fontFamily: FONT_EXTRA,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 30,
  },
  subtext: {
    color: TEXT,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    opacity: 0.92,
    marginBottom: 20,
    fontFamily: FONT_BODY,
  },
  rewardImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    marginBottom: 18,
    backgroundColor: '#3F3F3F',
  },
  rewardNameWrap: {
    minHeight: 120,
    borderRadius: 16,
    backgroundColor: '#3A3A3A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginBottom: 18,
  },
  rewardNameLarge: {
    color: TEXT,
    fontSize: 26,
    fontFamily: FONT_EXTRA,
    textAlign: 'center',
    lineHeight: 34,
  },
  progressStat: {
    color: EMBER,
    fontSize: 17,
    fontFamily: FONT_BOLD,
    textAlign: 'center',
    marginBottom: 16,
  },
  personal: {
    color: TEXT,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    opacity: 0.95,
    fontFamily: FONT_BODY,
  },
  shareBtn: {
    marginTop: 20,
    backgroundColor: EMBER,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  shareBtnDisabled: {
    opacity: 0.7,
  },
  shareBtnText: {
    color: TEXT,
    fontSize: 17,
    fontFamily: FONT_BOLD,
  },
  keepBtn: {
    marginTop: 12,
    backgroundColor: CHARCOAL,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3F3F3F',
  },
  keepBtnText: {
    color: TEXT,
    fontSize: 17,
    fontFamily: FONT_BOLD,
  },
});
