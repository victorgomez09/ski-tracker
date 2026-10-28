import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Battery, BatteryCharging, Moon, Snowflake, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';
import { formatDuration, formatPace, LiveStats } from './hooks/use-live-stats';
import { useBatteryOptimizer } from 'hooks/use-battery-optimizer.hook';
import { ActivityType } from 'models/activity.model';

interface TrackingHUDProps {
    stats: LiveStats | null;
    activityType?: ActivityType;
    speedUnit?: 'km/h' | 'min/km';
    onToggleOled?: () => void;
}

export const TrackingHUD: React.FC<TrackingHUDProps> = ({
    stats,
    activityType = 'ski',
    speedUnit = 'km/h',
    onToggleOled,
}) => {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const {
        batteryLevel,
        isCharging,
        extremeColdMode,
        adaptiveGpsEnabled,
        motionState,
    } = useBatteryOptimizer();

    if (!stats) return null;

    // Render HUD items adaptively per sport
    const renderContent = () => {
        if (activityType === 'walk' || activityType === 'hike') {
            return (
                <>
                    <View style={styles.statBox}>
                        <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                            {formatPace(stats.currentSpeed)}
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                            {t('pace', 'Ritmo')}
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
                    <View style={styles.statBox}>
                        <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                            +{Math.round(stats.elevationGain)}{' '}
                            <Text style={[styles.statUnit, { color: colors.textSecondary }]}>m</Text>
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                            {t('d_plus', 'D+')}
                        </Text>
                    </View>
                </>
            );
        }

        if (activityType === 'bike') {
            return (
                <>
                    <View style={styles.statBox}>
                        <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                            {stats.currentSpeed.toFixed(1)}{' '}
                            <Text style={[styles.statUnit, { color: colors.textSecondary }]}>km/h</Text>
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                            {t('speed', 'Velocidad')}
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
                    <View style={styles.statBox}>
                        <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                            {stats.altitude.toFixed(0)}{' '}
                            <Text style={[styles.statUnit, { color: colors.textSecondary }]}>m</Text>
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                            {t('altitude', 'Altitud')}
                        </Text>
                    </View>
                </>
            );
        }

        if (activityType === 'car') {
            return (
                <>
                    <View style={styles.statBox}>
                        <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                            {stats.currentSpeed.toFixed(0)}{' '}
                            <Text style={[styles.statUnit, { color: colors.textSecondary }]}>km/h</Text>
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                            {t('speed', 'Velocidad')}
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
                            {stats.maxSpeed.toFixed(0)}{' '}
                            <Text style={[styles.statUnit, { color: colors.textSecondary }]}>km/h</Text>
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                            {t('max_speed', 'Vel. Máx')}
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
                </>
            );
        }

        if (activityType === 'ski' || activityType === 'snowboard') {
            return (
                <>
                    <View style={styles.statBox}>
                        <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                            {stats.maxSpeed.toFixed(1)}{' '}
                            <Text style={[styles.statUnit, { color: colors.textSecondary }]}>km/h</Text>
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                            {t('max_speed', 'Vel. Punta')}
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
                            {Math.round(stats.elevationLoss || stats.elevationGain)}{' '}
                            <Text style={[styles.statUnit, { color: colors.textSecondary }]}>m</Text>
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                            {t('vertical_drop', 'Desnivel')}
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
                </>
            );
        }

        // Default / General
        return (
            <>
                <View style={styles.statBox}>
                    <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                        {stats.currentSpeed.toFixed(1)}{' '}
                        <Text style={[styles.statUnit, { color: colors.textSecondary }]}>km/h</Text>
                    </Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {t('speed', 'Velocidad')}
                    </Text>
                </View>
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
            </>
        );
    };

    return (
        <View style={[styles.liveStatsContainer, { backgroundColor: colors.surface }]}>
            <View style={styles.topHudRow}>
                <View style={styles.batteryBadge}>
                    {isCharging ? (
                        <BatteryCharging size={13} color="#10B981" />
                    ) : (
                        <Battery size={13} color={batteryLevel <= 20 ? '#EF4444' : '#10B981'} />
                    )}
                    <Text style={[styles.batteryBadgeText, { color: colors.textSecondary }]}>
                        {batteryLevel}%
                    </Text>
                    {extremeColdMode && (
                        <View style={styles.coldTag}>
                            <Snowflake size={10} color="#0284C7" />
                            <Text style={styles.coldTagText}>-10°C</Text>
                        </View>
                    )}
                    {adaptiveGpsEnabled && motionState === 'STATIC' && (
                        <View style={styles.staticTag}>
                            <Zap size={10} color="#10B981" />
                            <Text style={styles.staticTagText}>{t('stationary_eco', 'Eco')}</Text>
                        </View>
                    )}
                </View>

                {onToggleOled && (
                    <TouchableOpacity
                        style={[styles.oledPill, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={onToggleOled}
                        activeOpacity={0.7}
                    >
                        <Moon size={12} color="#0EA5E9" />
                        <Text style={[styles.oledPillText, { color: colors.textPrimary }]}>
                            {t('oled_mode', 'OLED')}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.statsRow}>
                {renderContent()}
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
        padding: SPACING.sm + 2,
        ...SHADOWS.md,
        zIndex: 20,
    },
    topHudRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
        paddingBottom: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(150, 150, 150, 0.15)',
    },
    batteryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    batteryBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    coldTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        backgroundColor: 'rgba(2, 132, 199, 0.15)',
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
    },
    coldTagText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#0284C7',
    },
    staticTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
    },
    staticTagText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#10B981',
    },
    oledPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: BORDER_RADIUS.sm,
        borderWidth: 1,
    },
    oledPillText: {
        fontSize: 11,
        fontWeight: 'bold',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
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
