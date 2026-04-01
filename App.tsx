import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import TodayScreen from './app/index';
import OnboardingScreen from './app/onboarding';
import MotivationalQuote from './components/MotivationalQuote';
import { scheduleAllNotifications } from './services/notifications';

export default function App() {
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    const bootstrap = async () => {
      const onboardingFlag = await AsyncStorage.getItem('onboarding_complete');
      const complete = onboardingFlag === 'true';
      setOnboardingComplete(complete);
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

  return (
    <>
      {onboardingComplete ? (
        <>
          <TodayScreen />
          <MotivationalQuote enabled={onboardingComplete} />
        </>
      ) : (
        <OnboardingScreen onComplete={() => setOnboardingComplete(true)} />
      )}
      <StatusBar style="dark" />
    </>
  );
}
