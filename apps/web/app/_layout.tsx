import '../styles/global.css';

import { Slot } from 'expo-router';
import 'i18n';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SQLite from 'expo-sqlite';
import { useEffect } from 'react';

import { initDB } from 'tracking/database';

import { UpdateModal } from 'components/updates/update-modal';
import { AuthProvider } from 'context/auth.context';
import { OtaProvider, useOta } from 'context/ota.context';
import { AxiosInterceptor } from 'interceptor/axios.interceptor';

function OtaGate({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation();
    const {
        phase,
        isBlocking,
        isDownloading,
        updateInfo,
        optionalModalVisible,
        hasOptionalUpdate,
        applyUpdate,
        dismissOptionalModal,
    } = useOta();

    if (isBlocking) {
        return (
            <View className="flex-1 justify-center items-center bg-slate-900">
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text className="mt-3 text-slate-300">
                    {isDownloading ? t('downloading_update') : t('checking_version')}
                </Text>
            </View>
        );
    }

    if (phase === 'mandatory' && updateInfo) {
        return (
            <UpdateModal
                forceUpdate
                latestVersion={updateInfo.latestVersion}
                changelog={updateInfo.changelog}
                onUpdate={applyUpdate}
                onDismiss={() => {}}
            />
        );
    }

    return (
        <>
            {children}
            {hasOptionalUpdate && optionalModalVisible && updateInfo && (
                <UpdateModal
                    forceUpdate={false}
                    latestVersion={updateInfo.latestVersion}
                    changelog={updateInfo.changelog}
                    onUpdate={applyUpdate}
                    onDismiss={dismissOptionalModal}
                />
            )}
        </>
    );
}

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
            <OtaProvider>
                <AuthProvider>
                    <AxiosInterceptor>
                        <OtaGate>
                            <Slot />
                        </OtaGate>
                    </AxiosInterceptor>
                </AuthProvider>
            </OtaProvider>
        </SafeAreaProvider>
    );
}