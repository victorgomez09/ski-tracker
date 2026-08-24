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
import { OtaProvider, useOta } from 'context/ota.context';
import { AxiosInterceptor } from 'interceptor/axios.interceptor';
import { useThemeColors, ThemeProvider, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from 'constants/theme';

function OtaGate({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);
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
            <View style={styles.container}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.message}>
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
                const database = await SQLite.openDatabaseAsync('ski_tracker.db', {useNewConnection: true});
                await initDB(database);
            } catch (error) {
                console.error('Failed to initialize local database:', error);
            } finally {
                setIsDbReady(true);
            }
        };
    
        initDatabase();
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