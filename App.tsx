import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useState } from 'react';
import TodayScreen from './app/index';
import OnboardingScreen from './app/onboarding';
import MotivationalQuote, { motivationalQuotes } from './components/MotivationalQuote';
import DashboardScreen from './app/dashboard';
import HistoryScreen from './app/history';
import { scheduleAllNotifications } from './services/notifications';

const LAST_QUOTE_DATE_KEY = 'last_quote_date';

export default function App() {
  const [hydrating, setHydrating] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'today' | 'history'>(
    'dashboard'
  );
  const [showDailyQuote, setShowDailyQuote] = useState(false);
  const [dailyQuote, setDailyQuote] = useState('');

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const onboardingFlag = await AsyncStorage.getItem('onboarding_complete');
        const complete = onboardingFlag === 'true';
        setOnboardingComplete(complete);

        if (!complete) {
          return;
        }

        const today = new Date().toISOString().split('T')[0];
        const lastQuote = await AsyncStorage.getItem(LAST_QUOTE_DATE_KEY);
        if (lastQuote === today) {
          setShowDailyQuote(false);
        } else {
          const quoteIndex = Math.floor(Math.random() * motivationalQuotes.length);
          setDailyQuote(motivationalQuotes[quoteIndex] ?? motivationalQuotes[0]);
          setShowDailyQuote(true);
        }
      } finally {
        setHydrating(false);
      }
    };

    void bootstrap();
  }, []);

  const handleLetsGo = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    await AsyncStorage.setItem(LAST_QUOTE_DATE_KEY, today);
    setShowDailyQuote(false);
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    void (async () => {
      setOnboardingComplete(true);
      const today = new Date().toISOString().split('T')[0];
      const lastQuote = await AsyncStorage.getItem(LAST_QUOTE_DATE_KEY);
      if (lastQuote !== today) {
        const quoteIndex = Math.floor(Math.random() * motivationalQuotes.length);
        setDailyQuote(motivationalQuotes[quoteIndex] ?? motivationalQuotes[0]);
        setShowDailyQuote(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!onboardingComplete) {
      return;
    }
    scheduleAllNotifications().catch(() => {
      /* ignore */
    });
  }, [onboardingComplete]);

  if (hydrating) {
    return null;
  }

  if (showDailyQuote) {
    return (
      <>
        <MotivationalQuote
          visible={showDailyQuote}
          quote={dailyQuote}
          onLetsGo={handleLetsGo}
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
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      )}
      <StatusBar style="dark" />
    </>
  );
}
