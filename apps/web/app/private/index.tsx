import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import * as SQLite from 'expo-sqlite';

import { initDB } from 'tracking/database';

import '../../styles/global.css';
import InteractiveSkiMap from 'components/map/map';

export default function App() {
  useEffect(() => {
    const initDatabase = async () => {
      const database = await SQLite.openDatabaseAsync('ski_tracker.db');

      await initDB(database);
    };

    initDatabase();
  }, []);

  return (
    <SafeAreaProvider>
        <InteractiveSkiMap />
    </SafeAreaProvider>
  );
}
