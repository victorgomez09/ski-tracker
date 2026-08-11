import * as SQLite from 'expo-sqlite';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initDB } from 'tracking/database';

import '../../styles/global.css';

let MapComponent: React.ComponentType<any>;
if (Platform.OS === 'web') {
  console.log("is web")
    MapComponent = require('../../components/map/map.web').default;
    // MapComponent = require('../../components/map/map.native').default;
} else {
    MapComponent = require('../../components/map/map.native').default;
}


export default function MapView(props: any) {
  useEffect(() => {
    const initDatabase = async () => {
      const database = await SQLite.openDatabaseAsync('ski_tracker.db');

      await initDB(database);
    };

    initDatabase();
  }, []);

  return (
    <SafeAreaProvider>
        <MapComponent {...props} />
    </SafeAreaProvider>
  );
}
