import { StatusBar } from 'expo-status-bar';
import TodayScreen from './app/index';

export default function App() {
  return (
    <>
      <TodayScreen />
      <StatusBar style="dark" />
    </>
  );
}
