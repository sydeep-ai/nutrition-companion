import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications are handled when received while app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function requestNotificationPermissions(): Promise<boolean> {
  // iOS & Android 13+ permission request
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') {
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

type DailyReminder = {
  hour: number;
  minute: number;
  title: string;
  body: string;
};

const FIXED_REMINDERS: DailyReminder[] = [
  {
    hour: 7,
    minute: 0,
    title: 'Morning ritual',
    body: 'Warm water + soaked almonds',
  },
  {
    hour: 9,
    minute: 15,
    title: 'Breakfast time',
    body: 'Time for your breakfast.',
  },
  {
    hour: 9,
    minute: 45,
    title: 'Supplements',
    body: 'Vitamin D + Fish Oil with breakfast.',
  },
  {
    hour: 12,
    minute: 30,
    title: 'Lunch time',
    body: 'Fuel up with your planned lunch.',
  },
  {
    hour: 15,
    minute: 0,
    title: 'Afternoon snack',
    body: 'Tea + fresh fruit or veggie sticks.',
  },
  {
    hour: 18,
    minute: 30,
    title: 'Dinner',
    body: 'Family meal time.',
  },
  {
    hour: 22,
    minute: 0,
    title: 'Iron supplement',
    body: 'Take your iron supplement.',
  },
];

function buildWaterReminders(): DailyReminder[] {
  const reminders: DailyReminder[] = [];
  // 8am–8pm inclusive: 8,9,10,11,12,13,14,15,16,17,18,19,20
  for (let hour = 8; hour <= 20; hour += 1) {
    reminders.push({
      hour,
      minute: 0,
      title: 'Hydration reminder',
      body: 'Drink a glass of water.',
    });
  }
  return reminders;
}

/**
 * Schedule all daily repeating notifications for the nutrition plan.
 *
 * - Requests notification permission the first time.
 * - Clears any previously scheduled notifications from this app.
 * - Schedules:
 *   - All fixed meal/supplement reminders.
 *   - Hourly water reminders from 8:00am to 8:00pm.
 */
export async function scheduleAllNotifications(): Promise<void> {
  const granted = await requestNotificationPermissions();
  if (!granted) {
    return;
  }

  // Reset previous schedules so we don't duplicate on each app launch
  await Notifications.cancelAllScheduledNotificationsAsync();

  const allReminders: DailyReminder[] = [
    ...FIXED_REMINDERS,
    ...buildWaterReminders(),
  ];

  const schedulePromises = allReminders.map((reminder) =>
    Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body: reminder.body,
        sound: Platform.OS === 'android' ? undefined : 'default',
      },
      // Calendar-based daily trigger at a specific hour/minute
      trigger: {
        hour: reminder.hour,
        minute: reminder.minute,
        repeats: true,
      } as Notifications.CalendarTriggerInput,
    })
  );

  await Promise.all(schedulePromises);
}

