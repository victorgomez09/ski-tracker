import { Slot } from 'expo-router';
import 'i18n';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SQLite from 'expo-sqlite';
import { useEffect } from 'react';

import { initDB } from 'tracking/database';

import { AuthProvider } from 'context/auth.context';
import { AxiosInterceptor } from 'interceptor/axios.interceptor';

export default function RootLayout() {
    useEffect(() => {
        const initDatabase = async () => {
          const database = await SQLite.openDatabaseAsync('ski_tracker.db', {useNewConnection: true});
    
          await initDB(database);
        };
    
        initDatabase();
      }, []);

    return (
        <SafeAreaProvider>
            <AuthProvider>
                <AxiosInterceptor>
                    <Slot />
                </AxiosInterceptor>
            </AuthProvider>
        </SafeAreaProvider>
    );
}