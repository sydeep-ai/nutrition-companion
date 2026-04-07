import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TodayScreen from './app/index';
import OnboardingScreen from './app/onboarding';
import MotivationalQuote, { motivationalQuotes } from './components/MotivationalQuote';
import DashboardScreen from './app/dashboard';
import HistoryScreen from './app/history';
import SettingsScreen from './app/settings';
import { scheduleAllNotifications } from './services/notifications';

const LAST_QUOTE_DATE_KEY = 'last_quote_date';

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
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
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
  const [hydrating, setHydrating] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
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
    <SafeAreaProvider>
      <NavigationContainer>
        {onboardingComplete ? (
          <RootNavigator />
        ) : (
          <OnboardingScreen onComplete={handleOnboardingComplete} />
        )}
      </NavigationContainer>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
