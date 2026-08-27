import * as Location from "expo-location";
import { Slot } from 'expo-router';
import 'i18n';
import '../styles/global.css';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SQLite from 'expo-sqlite';
import { useEffect, useState, useMemo } from 'react';

import { initDB } from 'tracking/database';

import { UpdateModal } from 'components/updates/update-modal';
import { AuthProvider } from 'context/auth.context';
import { FavoritesProvider } from 'context/favorites.context';
import { OtaProvider, useOta } from 'context/ota.context';
import { ToastProvider } from 'context/toast.context';
import { AxiosInterceptor } from 'interceptor/axios.interceptor';
import { useThemeColors, ThemeProvider, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from 'constants/theme';

function OtaGate({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const {
        phase,
        downloadProgress,
        isBlocking,
        isDownloading,
        updateInfo,
        optionalModalVisible,
        hasOptionalUpdate,
        applyUpdate,
        dismissOptionalModal,
    } = useOta();

    if (isBlocking && !updateInfo) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.message}>
                    {isDownloading ? t('downloading_update') : t('checking_version')}
                </Text>
            </View>
        );
    }

    if ((phase === 'mandatory' || (isDownloading && updateInfo?.isNative)) && updateInfo) {
        return (
            <UpdateModal
                forceUpdate
                latestVersion={updateInfo.latestVersion}
                changelog={updateInfo.changelog}
                isDownloading={isDownloading}
                downloadProgress={downloadProgress}
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
                    isDownloading={isDownloading}
                    downloadProgress={downloadProgress}
                    onUpdate={applyUpdate}
                    onDismiss={dismissOptionalModal}
                />
            )}
        </>
    );
}

export default function RootLayout() {
    return (
        <ThemeProvider>
            <AppContent />
        </ThemeProvider>
    );
}

function AppContent() {
    const { t } = useTranslation();
    const [isDbReady, setIsDbReady] = useState(false);
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);



    useEffect(() => {
        const initDatabase = async () => {
            try {
                const database = await SQLite.openDatabaseAsync('ski_tracker.db');
                await initDB(database);
            } catch (error) {
                console.error('Failed to initialize local database:', error);
            } finally {
                setIsDbReady(true);
            }
        };
        
        const checkStartupPermissions = async () => {
            try {
                const { status } = await Location.getForegroundPermissionsAsync();
                if (status !== 'granted') {
                    await Location.requestForegroundPermissionsAsync();
                }
            } catch (e) {
                console.error("Error checking permissions on startup", e);
            }
        };
    
        initDatabase();
        checkStartupPermissions();
    }, []);

    if (!isDbReady) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.initMessage}>
                    {t('initializing_app')}
                </Text>
            </View>
        );
    }

    return (
        <SafeAreaProvider>
            <OtaProvider>
                <AuthProvider>
                    <FavoritesProvider>
                        <ToastProvider>
                            <AxiosInterceptor>
                                <OtaGate>
                                    <Slot />
                                </OtaGate>
                            </AxiosInterceptor>
                        </ToastProvider>
                    </FavoritesProvider>
                </AuthProvider>
            </OtaProvider>
        </SafeAreaProvider>
    );
}

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    message: {
        marginTop: SPACING.sm,
        color: colors.textSecondary,
    },
    initMessage: {
        marginTop: SPACING.md,
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
    },
});