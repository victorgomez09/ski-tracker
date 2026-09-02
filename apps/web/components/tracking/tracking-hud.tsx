import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';
import { formatDuration, formatPace, LiveStats } from './hooks/use-live-stats';

interface TrackingHUDProps {
    stats: LiveStats | null;
    speedUnit?: 'km/h' | 'min/km';
}

export const TrackingHUD: React.FC<TrackingHUDProps> = ({ stats, speedUnit = 'km/h' }) => {
    const { t } = useTranslation();
    const colors = useThemeColors();

    if (!stats) return null;

    const renderSpeedOrPace = () => {
        if (speedUnit === 'min/km') {
            return (
                <View style={styles.statBox}>
                    <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                        {formatPace(stats.currentSpeed)}
                    </Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {t('pace', 'Ritmo')}
                    </Text>
                </View>
            );
        }

        return (
            <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                    {stats.currentSpeed.toFixed(1)}{' '}
                    <Text style={[styles.statUnit, { color: colors.textSecondary }]}>km/h</Text>
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    {t('speed', 'Velocidad')}
                </Text>
            </View>
        );
    };

    return (
        <View style={[styles.liveStatsContainer, { backgroundColor: colors.surface }]}>
            {renderSpeedOrPace()}
            <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                    {stats.altitude.toFixed(0)}{' '}
                    <Text style={[styles.statUnit, { color: colors.textSecondary }]}>m</Text>
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    {t('altitude', 'Altitud')}
                </Text>
            </View>
            <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                    {stats.distance.toFixed(2)}{' '}
                    <Text style={[styles.statUnit, { color: colors.textSecondary }]}>km</Text>
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    {t('distance', 'Distancia')}
                </Text>
            </View>
            <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                    {formatDuration(stats.duration)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    {t('duration', 'Tiempo')}
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    liveStatsContainer: {
        position: 'absolute',
        top: 60,
        left: SPACING.md,
        right: SPACING.md,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.md,
        flexDirection: 'row',
        justifyContent: 'space-between',
        ...SHADOWS.md,
        zIndex: 20,
    },
    statBox: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    statUnit: {
        fontSize: 10,
    },
    statLabel: {
        fontSize: 10,
        marginTop: 2,
    },
});
