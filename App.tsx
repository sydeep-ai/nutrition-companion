import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import TodayScreen from './app/index';
import OnboardingScreen from './app/onboarding';
import MotivationalQuote, { motivationalQuotes } from './components/MotivationalQuote';
import DashboardScreen from './app/dashboard';
import HistoryScreen from './app/history';
import { scheduleAllNotifications } from './services/notifications';

export default function App() {
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'today' | 'history'>(
    'dashboard'
  );
  const [showDailyQuote, setShowDailyQuote] = useState(false);
  const [dailyQuote, setDailyQuote] = useState('');

  useEffect(() => {
    const bootstrap = async () => {
      const onboardingFlag = await AsyncStorage.getItem('onboarding_complete');
      const complete = onboardingFlag === 'true';
      setOnboardingComplete(complete);

      if (!complete) {
        return;
      }

      // Debug mode: show quote on every app launch (no date checks).
      const quoteIndex = Math.floor(Math.random() * motivationalQuotes.length);
      setDailyQuote(motivationalQuotes[quoteIndex] ?? motivationalQuotes[0]);
      setShowDailyQuote(true);
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!onboardingComplete) {
      return;
    }
    // Fire-and-forget scheduling on startup after onboarding
    scheduleAllNotifications().catch(() => {
      // Silently ignore scheduling errors in the UI layer
    });
  }, [onboardingComplete]);

  if (onboardingComplete === null) {
    return null;
  }

  if (showDailyQuote) {
    return (
      <>
        <MotivationalQuote
          visible={showDailyQuote}
          quote={dailyQuote}
          onDismiss={() => setShowDailyQuote(false)}
        />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <>
      {onboardingComplete ? (
        <>
          {activeScreen === 'dashboard' ? (
            <DashboardScreen
              onStartToday={() => setActiveScreen('today')}
              onOpenHistory={() => setActiveScreen('history')}
            />
          ) : activeScreen === 'history' ? (
            <HistoryScreen onBack={() => setActiveScreen('dashboard')} />
          ) : (
            <TodayScreen onPressHome={() => setActiveScreen('dashboard')} />
          )}
        </>
      ) : (
        <OnboardingScreen onComplete={() => setOnboardingComplete(true)} />
      )}
      <StatusBar style="dark" />
    </>
  );
}
