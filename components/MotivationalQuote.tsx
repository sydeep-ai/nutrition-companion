import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const ACCENT = '#1D9E75';

export const motivationalQuotes = [
  'Fat loss happens between meals. Every time you skip the snack, your body gets to work.',
  'Consistency over 30 days beats perfection over 7. Just show up.',
  'Protein at breakfast reduces cravings all day. You already did the hardest part.',
  "Your body adapts to what you do repeatedly. Today's habit is next month's default.",
  'Sleep is when fat is burned and muscle is built. Tonight matters as much as today.',
  'You do not need a new plan. You need one more consistent day.',
  'Hunger is not an emergency. Pause, breathe, then choose with intention.',
  'Small meals done right, daily, quietly transform your body.',
  'Your goal body is built in ordinary moments, not dramatic ones.',
  'What you repeat gets results. Repeat the basics.',
  'Discipline is just remembering what you want most.',
  'A missed meal is a moment, not a failure. Reset at the next bite.',
  'The scale is data, not judgment. Keep stacking your wins.',
  'You are one habit away from a different month.',
  'Confidence grows when you keep promises to yourself.',
  'Eat with purpose now, thank yourself later.',
  'Momentum is created by finishing today well.',
  'The boring days are the ones that change your life.',
  'You do not need to feel motivated to act. Action creates motivation.',
  'This is not punishment. This is self-respect in practice.',
];

type Props = {
  visible: boolean;
  quote: string;
  onDismiss: () => void;
};

export default function MotivationalQuote({ visible, quote, onDismiss }: Props) {
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <LinearGradient colors={[ACCENT, '#168264', '#0F6A52']} style={styles.overlay}>
        <View style={styles.decorCircleTop} />
        <View style={styles.decorCircleBottom} />

        <View style={styles.content}>
          <Text style={styles.kicker}>Daily reminder</Text>
          <Text style={styles.quoteText}>{quote}</Text>
        </View>

        <Pressable style={styles.button} onPress={onDismiss}>
          <Text style={styles.buttonText}>Let&apos;s go {'\u2192'}</Text>
        </Pressable>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 48,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  quoteText: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 43,
    textAlign: 'center',
    fontWeight: '700',
  },
  button: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#0F6A52',
    fontSize: 17,
    fontWeight: '800',
  },
  decorCircleTop: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 190,
    height: 190,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  decorCircleBottom: {
    position: 'absolute',
    bottom: -50,
    left: -30,
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});

