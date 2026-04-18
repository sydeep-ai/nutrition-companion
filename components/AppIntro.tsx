import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FONT_BODY, FONT_BOLD, FONT_EXTRA, FONT_SEMIBOLD } from '../constants/fonts';

const OBSIDIAN = '#1A1A1A';
const CHARCOAL = '#2E2E2E';
const EMBER = '#D85A30';
const TEXT = '#FFFFFF';
const TEXT_MUTED = '#B0B0B0';

type Props = {
  onComplete: () => void | Promise<void>;
};

export default function AppIntro({ onComplete }: Props) {
  const [step, setStep] = useState(0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {step === 0 ? (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.heroEmoji}>🏆</Text>
            <Text style={styles.title}>Welcome to My Health Coach</Text>

            <View style={styles.card}>
              <Text style={styles.rowEmoji}>🎯</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Set your goal</Text>
                <Text style={styles.rowDesc}>
                  Tell us what you&apos;re working towards and why it matters
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.rowEmoji}>📋</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Track daily habits</Text>
                <Text style={styles.rowDesc}>
                  Log your meals, movement and water as you go
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.rowEmoji}>🤖</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Get honest feedback</Text>
                <Text style={styles.rowDesc}>
                  Tap Review my Day each evening for your AI check-in
                </Text>
              </View>
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <Pressable style={styles.primaryBtn} onPress={() => setStep(1)}>
              <Text style={styles.primaryBtnText}>Next →</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.heroEmoji}>📅</Text>
            <Text style={styles.title}>Your daily routine</Text>

            <View style={styles.card}>
              <Text style={styles.rowEmoji}>1️⃣</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Morning</Text>
                <Text style={styles.rowDesc}>Open the app and see your vision board</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.rowEmoji}>2️⃣</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>During the day</Text>
                <Text style={styles.rowDesc}>Tick off meals and habits as you go</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.rowEmoji}>3️⃣</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Evening</Text>
                <Text style={styles.rowDesc}>
                  Tap &quot;Review my Day&quot; for your honest AI check-in
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.rowEmoji}>4️⃣</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Watch</Text>
                <Text style={styles.rowDesc}>Your progress bar move toward your reward</Text>
              </View>
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <Pressable style={styles.primaryBtn} onPress={() => void onComplete()}>
              <Text style={styles.primaryBtnText}>Let&apos;s go! 🔥</Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: OBSIDIAN,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  heroEmoji: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: 16,
  },
  title: {
    color: TEXT,
    fontSize: 26,
    fontFamily: FONT_EXTRA,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 32,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: CHARCOAL,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  rowEmoji: {
    fontSize: 28,
    marginRight: 14,
    lineHeight: 32,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: TEXT,
    fontSize: 17,
    fontFamily: FONT_BOLD,
    marginBottom: 4,
  },
  rowDesc: {
    color: TEXT_MUTED,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONT_BODY,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
    backgroundColor: OBSIDIAN,
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: EMBER,
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: TEXT,
    fontSize: 17,
    fontFamily: FONT_SEMIBOLD,
  },
});
