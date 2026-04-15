import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FONT_SEMIBOLD } from './constants/fonts';
import TodayScreen from './app/index';
import OnboardingScreen from './app/onboarding';
import MilestoneCelebration, {
  MilestoneCelebrationPayload,
  MilestoneDay,
  MILESTONE_TRIGGER_DAY_FOR_7,
  MILESTONE_TRIGGER_DAY_FOR_14,
  MILESTONE_TRIGGER_DAY_FOR_30,
} from './components/MilestoneCelebration';
import MotivationalQuote, { motivationalQuotes } from './components/MotivationalQuote';
import DashboardScreen from './app/dashboard';
import HistoryScreen from './app/history';
import SettingsScreen from './app/settings';
import { scheduleAllNotifications } from './services/notifications';

const LAST_QUOTE_DATE_KEY = 'last_quote_date';
const MILESTONE_7_KEY = 'milestone_shown_7';
const MILESTONE_14_KEY = 'milestone_shown_14';
const MILESTONE_30_KEY = 'milestone_shown_30';

function computeCurrentPlanDay(planStartRaw: string | null): number {
  if (!planStartRaw?.trim()) {
    return 1;
  }
  const start = new Date(planStartRaw);
  if (Number.isNaN(start.getTime())) {
    return 1;
  }
  const diffMs = Date.now() - start.getTime();
  const day = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, day);
}

function pickMilestoneToShow(
  day: number,
  shown7: boolean,
  shown14: boolean,
  shown30: boolean
): MilestoneDay | null {
  if (day >= MILESTONE_TRIGGER_DAY_FOR_30 && !shown30) {
    return 30;
  }
  if (day >= MILESTONE_TRIGGER_DAY_FOR_14 && !shown14) {
    return 14;
  }
  if (day >= MILESTONE_TRIGGER_DAY_FOR_7 && !shown7) {
    return 7;
  }
  return null;
}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HistoryRoute() {
  const navigation = useNavigation();
  return <HistoryScreen onBack={() => navigation.goBack()} />;
}

function MainTabs() {
  const openEditPlanRef = useRef<(() => void) | null>(null);

  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        lazy: false,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1A1A1A',
          borderTopWidth: 0.5,
          borderTopColor: '#2E2E2E',
          height: 75,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#D85A30',
        tabBarInactiveTintColor: '#888888',
        tabBarLabelStyle: { fontSize: 12, fontFamily: FONT_SEMIBOLD },
        tabBarIconStyle: { marginBottom: 4 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: () => <Text style={{ fontSize: 26 }}>🏆</Text>,
        }}
      >
        {(props) => (
          <DashboardScreen
            openEditPlanRef={openEditPlanRef}
            onStartToday={() => props.navigation.navigate('Today')}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Today"
        options={{
          tabBarLabel: 'Today',
          tabBarIcon: () => <Text style={{ fontSize: 26 }}>🏠</Text>,
        }}
      >
        {(props) => (
          <TodayScreen
            onPressHome={() => props.navigation.navigate('Dashboard')}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Settings"
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: () => <Text style={{ fontSize: 26 }}>⚙️</Text>,
        }}
      >
        {() => <SettingsScreen openEditPlanRef={openEditPlanRef} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="History" component={HistoryRoute} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  const [hydrating, setHydrating] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [showDailyQuote, setShowDailyQuote] = useState(false);
  const [dailyQuote, setDailyQuote] = useState('');
  const [milestonePayload, setMilestonePayload] = useState<MilestoneCelebrationPayload | null>(null);
  const [showMilestone, setShowMilestone] = useState(false);
  const [deferDailyQuoteAfterMilestone, setDeferDailyQuoteAfterMilestone] = useState(false);

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
        const needsDailyQuote = lastQuote !== today;

        const [
          planStartRaw,
          targetDaysRaw,
          m7Raw,
          m14Raw,
          m30Raw,
          userNameRaw,
          userGoalRaw,
          userWhyRaw,
          rewardNameRaw,
          rewardPhotoRaw,
        ] = await AsyncStorage.multiGet([
          'plan_start_date',
          'target_days',
          MILESTONE_7_KEY,
          MILESTONE_14_KEY,
          MILESTONE_30_KEY,
          'user_name',
          'user_goal',
          'user_why',
          'reward_name',
          'reward_photo',
        ]);

        const currentDay = computeCurrentPlanDay(planStartRaw[1] ?? null);
        const targetParsed = parseInt(targetDaysRaw[1] ?? '', 10);
        const targetDays =
          Number.isFinite(targetParsed) && targetParsed > 0 ? Math.floor(targetParsed) : 30;

        const shown7 = m7Raw[1] === 'true';
        const shown14 = m14Raw[1] === 'true';
        const shown30 = m30Raw[1] === 'true';

        const milestoneKind = pickMilestoneToShow(currentDay, shown7, shown14, shown30);

        if (milestoneKind) {
          const percent = Math.min(
            100,
            Math.max(0, Math.round((currentDay / Math.max(1, targetDays)) * 100))
          );
          setMilestonePayload({
            milestone: milestoneKind,
            currentDay,
            targetDays,
            percent,
            userName: userNameRaw[1]?.trim() || 'friend',
            userGoal: userGoalRaw[1]?.trim() || '',
            userWhy: userWhyRaw[1]?.trim() || '',
            rewardName: rewardNameRaw[1]?.trim() || '',
            rewardPhotoUri: rewardPhotoRaw[1]?.trim() || null,
          });
          setShowMilestone(true);
          setShowDailyQuote(false);
          setDeferDailyQuoteAfterMilestone(needsDailyQuote);
          if (needsDailyQuote) {
            const quoteIndex = Math.floor(Math.random() * motivationalQuotes.length);
            setDailyQuote(motivationalQuotes[quoteIndex] ?? motivationalQuotes[0]);
          }
        } else if (needsDailyQuote) {
          const quoteIndex = Math.floor(Math.random() * motivationalQuotes.length);
          setDailyQuote(motivationalQuotes[quoteIndex] ?? motivationalQuotes[0]);
          setShowDailyQuote(true);
          setDeferDailyQuoteAfterMilestone(false);
        } else {
          setShowDailyQuote(false);
          setDeferDailyQuoteAfterMilestone(false);
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
      const needsDailyQuote = lastQuote !== today;

      const [
        planStartRaw,
        targetDaysRaw,
        m7Raw,
        m14Raw,
        m30Raw,
        userNameRaw,
        userGoalRaw,
        userWhyRaw,
        rewardNameRaw,
        rewardPhotoRaw,
      ] = await AsyncStorage.multiGet([
        'plan_start_date',
        'target_days',
        MILESTONE_7_KEY,
        MILESTONE_14_KEY,
        MILESTONE_30_KEY,
        'user_name',
        'user_goal',
        'user_why',
        'reward_name',
        'reward_photo',
      ]);

      const currentDay = computeCurrentPlanDay(planStartRaw[1] ?? null);
      const targetParsed = parseInt(targetDaysRaw[1] ?? '', 10);
      const targetDays =
        Number.isFinite(targetParsed) && targetParsed > 0 ? Math.floor(targetParsed) : 30;

      const shown7 = m7Raw[1] === 'true';
      const shown14 = m14Raw[1] === 'true';
      const shown30 = m30Raw[1] === 'true';

      const milestoneKind = pickMilestoneToShow(currentDay, shown7, shown14, shown30);

      if (milestoneKind) {
        const percent = Math.min(
          100,
          Math.max(0, Math.round((currentDay / Math.max(1, targetDays)) * 100))
        );
        setMilestonePayload({
          milestone: milestoneKind,
          currentDay,
          targetDays,
          percent,
          userName: userNameRaw[1]?.trim() || 'friend',
          userGoal: userGoalRaw[1]?.trim() || '',
          userWhy: userWhyRaw[1]?.trim() || '',
          rewardName: rewardNameRaw[1]?.trim() || '',
          rewardPhotoUri: rewardPhotoRaw[1]?.trim() || null,
        });
        setShowMilestone(true);
        setShowDailyQuote(false);
        setDeferDailyQuoteAfterMilestone(needsDailyQuote);
        if (needsDailyQuote) {
          const quoteIndex = Math.floor(Math.random() * motivationalQuotes.length);
          setDailyQuote(motivationalQuotes[quoteIndex] ?? motivationalQuotes[0]);
        }
      } else if (needsDailyQuote) {
        const quoteIndex = Math.floor(Math.random() * motivationalQuotes.length);
        setDailyQuote(motivationalQuotes[quoteIndex] ?? motivationalQuotes[0]);
        setShowDailyQuote(true);
        setDeferDailyQuoteAfterMilestone(false);
      }
    })();
  }, []);

  const handleMilestoneDismiss = useCallback(async () => {
    const p = milestonePayload;
    if (p) {
      const key =
        p.milestone === 7 ? MILESTONE_7_KEY : p.milestone === 14 ? MILESTONE_14_KEY : MILESTONE_30_KEY;
      await AsyncStorage.setItem(key, 'true');
    }
    setShowMilestone(false);
    setMilestonePayload(null);
    if (deferDailyQuoteAfterMilestone) {
      setShowDailyQuote(true);
      setDeferDailyQuoteAfterMilestone(false);
    }
  }, [milestonePayload, deferDailyQuoteAfterMilestone]);

  useEffect(() => {
    if (!onboardingComplete) {
      return;
    }
    scheduleAllNotifications().catch(() => {
      /* ignore */
    });
  }, [onboardingComplete]);

  if (!fontsLoaded || hydrating) {
    return null;
  }

  if (!onboardingComplete) {
    return (
      <SafeAreaProvider>
        <OnboardingScreen onComplete={handleOnboardingComplete} />
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  const statusLight = showDailyQuote || showMilestone;

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
      {showDailyQuote ? (
        <MotivationalQuote visible={showDailyQuote} quote={dailyQuote} onLetsGo={handleLetsGo} />
      ) : null}
      <MilestoneCelebration
        visible={showMilestone}
        payload={milestonePayload}
        onDismiss={handleMilestoneDismiss}
      />
      <StatusBar style={statusLight ? 'light' : 'dark'} />
    </SafeAreaProvider>
  );
}
