import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FONT_BODY, FONT_SEMIBOLD, FONT_EXTRA } from '../constants/fonts';
import {
  collectHistoryDates,
  formatHistoryHeading,
  parseMealTicks,
  readJournalFull,
  readJournalPreview,
  readMovementSteps,
  readMovementWorkout,
} from '../services/storage';

const BG = '#1A1A1A';
const SURFACE = '#2E2E2E';
const TEXT_PRIMARY = '#FAFAFA';

type HistoryListItem = {
  ymd: string;
  heading: string;
  ticks: ReturnType<typeof parseMealTicks>;
  preview: string;
  full: string;
  steps: boolean;
  workout: boolean;
};

type Props = {
  onBack: () => void;
};

export default function HistoryScreen({ onBack }: Props) {
  const [historyItems, setHistoryItems] = useState<HistoryListItem[]>([]);
  const [expandedYmd, setExpandedYmd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const dates = await collectHistoryDates();
    const items: HistoryListItem[] = await Promise.all(
      dates.map(async (ymd) => {
        const mealRaw = await AsyncStorage.getItem(`meal_ticks_${ymd}`);
        const ticks = parseMealTicks(mealRaw);
        const [preview, full, steps, workout] = await Promise.all([
          readJournalPreview(ymd, 60),
          readJournalFull(ymd),
          readMovementSteps(ymd),
          readMovementWorkout(ymd),
        ]);
        return {
          ymd,
          heading: formatHistoryHeading(ymd),
          ticks,
          preview,
          full,
          steps,
          workout,
        };
      })
    );
    setHistoryItems(items);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.backPressable}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>📖 Track Record</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!loading && historyItems.length === 0 ? (
          <Text style={styles.empty}>
            Your history will appear here after your first day
          </Text>
        ) : null}

        {historyItems.map((row) => {
          const expanded = expandedYmd === row.ymd;
          const mealLine = row.ticks
            ? `${row.ticks.done}/${row.ticks.total} meals ${
                row.ticks.total > 0 && row.ticks.done >= row.ticks.total ? '✅' : '❌'
              }`
            : '—/— meals ❌';
          return (
            <Pressable
              key={row.ymd}
              style={styles.card}
              onPress={() =>
                setExpandedYmd((prev) => (prev === row.ymd ? null : row.ymd))
              }
            >
              <Text style={styles.cardDate}>{row.heading}</Text>
              <Text style={styles.cardMeals}>{mealLine}</Text>
              <Text style={styles.cardMovement}>
                👣 steps {row.steps ? '✅' : '❌'} · 💪 workout {row.workout ? '✅' : '❌'}
              </Text>
              <Text style={expanded ? styles.journalFull : styles.journalPreview}>
                {expanded ? row.full || '—' : row.preview || '—'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
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
  topBar: {
    marginBottom: 8,
  },
  backPressable: {
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 16,
    fontFamily: FONT_SEMIBOLD,
    color: '#D1D5DB',
  },
  title: {
    fontSize: 21,
    fontFamily: FONT_EXTRA,
    color: TEXT_PRIMARY,
    marginBottom: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  empty: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginBottom: 16,
    fontFamily: FONT_BODY,
  },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardDate: {
    fontSize: 16,
    fontFamily: FONT_SEMIBOLD,
    color: TEXT_PRIMARY,
  },
  cardMeals: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: FONT_SEMIBOLD,
    color: '#D1D5DB',
  },
  cardMovement: {
    marginTop: 6,
    fontSize: 14,
    color: '#D1D5DB',
    fontFamily: FONT_BODY,
  },
  journalPreview: {
    marginTop: 10,
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
    fontFamily: FONT_BODY,
  },
  journalFull: {
    marginTop: 10,
    fontSize: 14,
    color: '#E5E7EB',
    fontStyle: 'normal',
    lineHeight: 20,
    fontFamily: FONT_BODY,
  },
});
