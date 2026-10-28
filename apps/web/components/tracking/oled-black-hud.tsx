import React, { useState } from 'react';
import {
    Dimensions,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    Battery,
    BatteryCharging,
    ChevronRight,
    Gauge,
    Moon,
    Mountain,
    Pause,
    Play,
    ShieldAlert,
    Snowflake,
    Square,
    Timer,
    Zap,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { LiveStats, formatDuration } from './hooks/use-live-stats';
import { useBatteryOptimizer } from 'hooks/use-battery-optimizer.hook';
import { ActivityType } from 'models/activity.model';

const { width } = Dimensions.get('window');

interface OledBlackHudProps {
    stats: LiveStats | null;
    isTracking: boolean;
    isPaused: boolean;
    activityType?: ActivityType;
    onTogglePause: () => void;
    onStopTracking: () => void;
    onExitOledMode: () => void;
}

export const OledBlackHud: React.FC<OledBlackHudProps> = ({
    stats,
    isTracking,
    isPaused,
    activityType = 'ski',
    onTogglePause,
    onStopTracking,
    onExitOledMode,
}) => {
    const { t } = useTranslation();
    const {
        motionState,
        powerProfile,
        batteryLevel,
        isCharging,
        extremeColdMode,
        adaptiveGpsEnabled,
        toggleExtremeColdMode,
        toggleAdaptiveGps,
        currentIntervalMs,
    } = useBatteryOptimizer();

    const [isLocked, setIsLocked] = useState(false);

    const getMotionText = () => {
        switch (motionState) {
            case 'STATIC':
                return t('motion_static', '🛑 Estático / Cola (GPS a 30s)');
            case 'MOVING_FAST':
                return t('motion_fast', '⛷️ Descenso rápido (GPS a 2s)');
            case 'MOVING':
                return t('motion_moving', '🚠 En remonte / Movimiento');
            default:
                return t('motion_active', '📡 GPS Activo');
        }
    };

    const getIntervalText = () => {
        return `${Math.round(currentIntervalMs / 1000)}s`;
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* 1. Header con estado térmico y batería */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Moon size={18} color="#00FFCC" />
                    <Text style={styles.headerTitle}>
                        {t('oled_mode_title', 'OLED PURE BLACK')}
                    </Text>
                </View>

                <View style={styles.headerRight}>
                    {isCharging ? (
                        <BatteryCharging size={18} color="#00FF66" />
                    ) : (
                        <Battery
                            size={18}
                            color={batteryLevel <= 20 ? '#FF3B30' : '#00FF66'}
                        />
                    )}
                    <Text
                        style={[
                            styles.batteryText,
                            batteryLevel <= 20 && !isCharging ? styles.batteryLow : null,
                        ]}
                    >
                        {batteryLevel}%
                    </Text>
                    {extremeColdMode && (
                        <View style={styles.coldPill}>
                            <Snowflake size={12} color="#00E5FF" />
                            <Text style={styles.coldPillText}>-10°C</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* 2. Banner de estado del sensor y ahorro energético */}
            <View style={styles.statusBanner}>
                <View style={styles.statusPill}>
                    <Zap size={14} color="#00FF66" />
                    <Text style={styles.statusText}>{getMotionText()}</Text>
                </View>
                <Text style={styles.intervalText}>
                    GPS: {getIntervalText()}
                </Text>
            </View>

            {/* 3. Métrica gigante principal: Velocidad */}
            <View style={styles.mainSpeedContainer}>
                <Text style={styles.mainSpeedValue}>
                    {stats ? stats.currentSpeed.toFixed(1) : '0.0'}
                </Text>
                <Text style={styles.mainSpeedUnit}>km/h</Text>
            </View>

            {/* 4. Cuadrícula de Métricas Clave de Alto Contraste */}
            <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                    <Mountain size={18} color="#888888" />
                    <Text style={styles.metricLabel}>{t('altitude', 'Altitud')}</Text>
                    <Text style={styles.metricValue}>
                        {stats ? Math.round(stats.altitude) : 0}{' '}
                        <Text style={styles.metricUnit}>m</Text>
                    </Text>
                </View>

                <View style={styles.metricCard}>
                    <Gauge size={18} color="#888888" />
                    <Text style={styles.metricLabel}>{t('vertical_drop', 'Desnivel -')}</Text>
                    <Text style={styles.metricValue}>
                        {stats ? Math.round(stats.elevationLoss || stats.elevationGain) : 0}{' '}
                        <Text style={styles.metricUnit}>m</Text>
                    </Text>
                </View>

                <View style={styles.metricCard}>
                    <Timer size={18} color="#888888" />
                    <Text style={styles.metricLabel}>{t('duration', 'Tiempo')}</Text>
                    <Text style={styles.metricValue}>
                        {stats ? formatDuration(stats.duration) : '00:00:00'}
                    </Text>
                </View>

                <View style={styles.metricCard}>
                    <ChevronRight size={18} color="#888888" />
                    <Text style={styles.metricLabel}>{t('distance', 'Distancia')}</Text>
                    <Text style={styles.metricValue}>
                        {stats ? stats.distance.toFixed(2) : '0.00'}{' '}
                        <Text style={styles.metricUnit}>km</Text>
                    </Text>
                </View>
            </View>

            {/* 5. Ajustes de Gestión de Batería en Frío Extremo */}
            <View style={styles.optionsRow}>
                <TouchableOpacity
                    style={[
                        styles.optionButton,
                        extremeColdMode ? styles.optionButtonActiveCold : null,
                    ]}
                    onPress={toggleExtremeColdMode}
                    activeOpacity={0.7}
                >
                    <Snowflake
                        size={16}
                        color={extremeColdMode ? '#00E5FF' : '#666666'}
                    />
                    <Text
                        style={[
                            styles.optionButtonText,
                            extremeColdMode ? styles.optionButtonTextActiveCold : null,
                        ]}
                    >
                        {t('extreme_cold_mode', 'Frío Extremo')}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.optionButton,
                        adaptiveGpsEnabled ? styles.optionButtonActiveEco : null,
                    ]}
                    onPress={toggleAdaptiveGps}
                    activeOpacity={0.7}
                >
                    <Zap
                        size={16}
                        color={adaptiveGpsEnabled ? '#00FF66' : '#666666'}
                    />
                    <Text
                        style={[
                            styles.optionButtonText,
                            adaptiveGpsEnabled ? styles.optionButtonTextActiveEco : null,
                        ]}
                    >
                        {t('adaptive_gps', 'Ahorro Acelerómetro')}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* 6. Botones de Control de Sesión */}
            <View style={styles.bottomBar}>
                {isLocked ? (
                    <TouchableOpacity
                        style={styles.unlockButton}
                        onPress={() => setIsLocked(false)}
                        activeOpacity={0.8}
                    >
                        <ShieldAlert size={20} color="#FFCC00" />
                        <Text style={styles.unlockButtonText}>
                            {t('tap_to_unlock', 'Toca para desbloquear controles')}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <>
                        <TouchableOpacity
                            style={styles.exitButton}
                            onPress={onExitOledMode}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.exitButtonText}>
                                {t('exit_oled_mode', 'Salir de OLED')}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.actionButton,
                                isPaused ? styles.resumeButton : styles.pauseButton,
                            ]}
                            onPress={onTogglePause}
                            activeOpacity={0.7}
                        >
                            {isPaused ? (
                                <>
                                    <Play size={18} color="#000000" />
                                    <Text style={styles.actionButtonTextDark}>
                                        {t('resume', 'Reanudar')}
                                    </Text>
                                </>
                            ) : (
                                <>
                                    <Pause size={18} color="#FFFFFF" />
                                    <Text style={styles.actionButtonText}>
                                        {t('pause', 'Pausa')}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.stopButton}
                            onPress={onStopTracking}
                            activeOpacity={0.7}
                        >
                            <Square size={18} color="#FFFFFF" />
                            <Text style={styles.actionButtonText}>
                                {t('finish', 'Fin')}
                            </Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

            {/* Botón flotante para bloquear pantalla en bolsillo */}
            {!isLocked && (
                <TouchableOpacity
                    style={styles.pocketLockToggle}
                    onPress={() => setIsLocked(true)}
                >
                    <Text style={styles.pocketLockText}>
                        🔒 {t('lock_pocket', 'Bloquear pantalla para bolsillo')}
                    </Text>
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000', // PURE OLED BLACK: píxeles totalmente apagados
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#1A1A1A',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: 'bold',
        letterSpacing: 1.5,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    batteryText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    batteryLow: {
        color: '#FF3B30',
        fontWeight: 'bold',
    },
    coldPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: '#002B33',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#00E5FF',
    },
    coldPillText: {
        color: '#00E5FF',
        fontSize: 11,
        fontWeight: 'bold',
    },
    statusBanner: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#0A0A0A',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginTop: 6,
        borderWidth: 1,
        borderColor: '#1E1E1E',
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusText: {
        color: '#CCCCCC',
        fontSize: 12,
        fontWeight: '500',
    },
    intervalText: {
        color: '#777777',
        fontSize: 11,
        fontFamily: 'monospace',
    },
    mainSpeedContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
    },
    mainSpeedValue: {
        color: '#FFFFFF',
        fontSize: width > 380 ? 92 : 80,
        fontWeight: '900',
        lineHeight: width > 380 ? 96 : 84,
        letterSpacing: -2,
    },
    mainSpeedUnit: {
        color: '#00FFCC',
        fontSize: 22,
        fontWeight: 'bold',
        letterSpacing: 2,
        marginTop: -6,
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        justifyContent: 'space-between',
    },
    metricCard: {
        width: '48%',
        backgroundColor: '#0A0A0A',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#1E1E1E',
    },
    metricLabel: {
        color: '#777777',
        fontSize: 12,
        marginTop: 6,
        fontWeight: '500',
    },
    metricValue: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: 'bold',
        marginTop: 2,
    },
    metricUnit: {
        color: '#888888',
        fontSize: 14,
        fontWeight: 'normal',
    },
    optionsRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 10,
    },
    optionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#0A0A0A',
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#222222',
    },
    optionButtonActiveCold: {
        borderColor: '#00E5FF',
        backgroundColor: '#001A20',
    },
    optionButtonActiveEco: {
        borderColor: '#00FF66',
        backgroundColor: '#001A0A',
    },
    optionButtonText: {
        color: '#777777',
        fontSize: 12,
        fontWeight: '600',
    },
    optionButtonTextActiveCold: {
        color: '#00E5FF',
    },
    optionButtonTextActiveEco: {
        color: '#00FF66',
    },
    bottomBar: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 14,
        alignItems: 'center',
    },
    exitButton: {
        flex: 1,
        backgroundColor: '#1E1E1E',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#333333',
    },
    exitButtonText: {
        color: '#CCCCCC',
        fontSize: 13,
        fontWeight: 'bold',
    },
    actionButton: {
        flex: 1.2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 14,
        borderRadius: 12,
    },
    pauseButton: {
        backgroundColor: '#D97706',
    },
    resumeButton: {
        backgroundColor: '#00FF66',
    },
    stopButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#DC2626',
        paddingVertical: 14,
        borderRadius: 12,
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: 'bold',
    },
    actionButtonTextDark: {
        color: '#000000',
        fontSize: 14,
        fontWeight: 'bold',
    },
    unlockButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#1A1A00',
        paddingVertical: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FFCC00',
    },
    unlockButtonText: {
        color: '#FFCC00',
        fontSize: 14,
        fontWeight: 'bold',
    },
    pocketLockToggle: {
        alignItems: 'center',
        paddingVertical: 6,
    },
    pocketLockText: {
        color: '#666666',
        fontSize: 11,
    },
});
