import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import TodayScreen from './app/index';
import { scheduleAllNotifications } from './services/notifications';

export default function App() {
  useEffect(() => {
    // Fire-and-forget scheduling on startup
    scheduleAllNotifications().catch(() => {
      // Silently ignore scheduling errors in the UI layer
    });
  }, []);

  return (
    <>
      <TodayScreen />
      <StatusBar style="dark" />
    </>
  );
}
