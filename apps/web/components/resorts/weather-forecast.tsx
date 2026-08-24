import { Sun, Cloud, CloudRain, Snowflake, Wind, Compass, Droplets, Flame, Gauge, Umbrella, Eye } from 'lucide-react-native';
import { WeatherForecast } from 'models/weather.model';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface WeatherWidgetProps {
    data: WeatherForecast;
}

export const WeatherForecastDetails: React.FC<WeatherWidgetProps> = ({ data }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'current' | 'hourly' | 'daily'>('current');

    const current = data.current;
    const currentUnits = data.current_units;
    const hourlyUnits = data.hourly_units;

    const formatVisibility = (meters: number) => {
        if (!meters && meters !== 0) return t('na');
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km`;
        }
        return `${meters} m`;
    };

    const getWeatherInfo = (code: number) => {
        switch (code) {
            case 0:
                return { label: t('clear_sky'), icon: <Sun size={24} color="#f59e0b" /> };
            case 1:
            case 2:
            case 3:
                return { label: t('partly_cloudy'), icon: <Cloud size={24} color={COLORS.primary} /> };
            case 45:
            case 48:
                return { label: t('foggy'), icon: <Cloud size={24} color={COLORS.textLight} /> };
            case 51:
            case 53:
            case 55:
            case 61:
            case 63:
                return { label: t('rain_showers'), icon: <CloudRain size={24} color={COLORS.primary} /> };
            case 71:
            case 73:
            case 75:
            case 77:
                return { label: t('snowfall'), icon: <Snowflake size={24} color="#38bdf8" /> };
            case 95:
            case 96:
            case 99:
                return { label: t('thunderstorm'), icon: <CloudRain size={24} color={COLORS.danger} /> };
            default:
                return { label: t('variable'), icon: <Cloud size={24} color={COLORS.textLight} /> };
        }
    };

    const currentWeatherInfo = getWeatherInfo(current.weather_code);

    return (
        <View style={styles.container}>
            {/* Header Tabs */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>{t('detailed_weather')}</Text>
                <View style={styles.tabsWrapper}>
                    <TouchableOpacity
                        style={[styles.tabButton, activeTab === 'current' && styles.tabButtonActive]}
                        onPress={() => setActiveTab('current')}
                    >
                        <Text style={[styles.tabText, activeTab === 'current' && styles.tabTextActive]}>{t('current')}</Text>
                    </TouchableOpacity>
                    {data.hourly && (
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'hourly' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('hourly')}
                        >
                            <Text style={[styles.tabText, activeTab === 'hourly' && styles.tabTextActive]}>{t('hourly')}</Text>
                        </TouchableOpacity>
                    )}
                    {data.daily && (
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'daily' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('daily')}
                        >
                            <Text style={[styles.tabText, activeTab === 'daily' && styles.tabTextActive]}>{t('daily')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* CURRENT TAB */}
            {activeTab === 'current' && (
                <View style={styles.bodyCard}>
                    <View style={styles.conditionRow}>
                        <View style={styles.conditionLeft}>
                            <View style={styles.iconCircle}>
                                {currentWeatherInfo.icon}
                            </View>
                            <View>
                                <Text style={styles.metricLabel}>{t('condition')}</Text>
                                <Text style={styles.conditionText}>{currentWeatherInfo.label}</Text>
                                <Text style={styles.timeText}>
                                    {t('updated')}: {new Date(current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.conditionRight}>
                            <Text style={styles.tempText}>{current.temperature_2m}{currentUnits.temperature_2m}</Text>
                            <Text style={styles.feelsLikeText}>{t('feels_like')}: {current.apparent_temperature}{currentUnits.temperature_2m}</Text>
                        </View>
                    </View>

                    {/* Metrics Grid */}
                    <View style={styles.metricsGrid}>
                        <View style={styles.metricCard}>
                            <Wind size={16} color="#38bdf8" />
                            <View>
                                <Text style={styles.gridMetricLabel}>{t('wind_speed')}</Text>
                                <Text style={styles.gridMetricValue}>{current.wind_speed_10m} {currentUnits.wind_speed_10m}</Text>
                            </View>
                        </View>

                        <View style={styles.metricCard}>
                            <Flame size={16} color="#f59e0b" />
                            <View>
                                <Text style={styles.gridMetricLabel}>{t('wind_gusts')}</Text>
                                <Text style={styles.gridMetricValue}>{current.wind_gusts_10m} {currentUnits.wind_gusts_10m}</Text>
                            </View>
                        </View>

                        <View style={styles.metricCard}>
                            <Compass size={16} color="#c084fc" />
                            <View>
                                <Text style={styles.gridMetricLabel}>{t('wind_dir')}</Text>
                                <Text style={styles.gridMetricValue}>{current.wind_direction_10m}{currentUnits.wind_direction_10m}</Text>
                            </View>
                        </View>

                        <View style={styles.metricCard}>
                            <Eye size={16} color="#34d399" />
                            <View>
                                <Text style={styles.gridMetricLabel}>{t('visibility')}</Text>
                                <Text style={styles.gridMetricValue}>{formatVisibility(current.visibility)}</Text>
                            </View>
                        </View>

                        <View style={styles.metricCard}>
                            <Droplets size={16} color={COLORS.primary} />
                            <View>
                                <Text style={styles.gridMetricLabel}>{t('humidity')}</Text>
                                <Text style={styles.gridMetricValue}>{current.relative_humidity_2m}{currentUnits.relative_humidity_2m}</Text>
                            </View>
                        </View>

                        <View style={styles.metricCard}>
                            <Gauge size={16} color="#4ade80" />
                            <View>
                                <Text style={styles.gridMetricLabel}>{t('pressure')}</Text>
                                <Text style={styles.gridMetricValue}>{current.surface_pressure} {currentUnits.surface_pressure}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            )}

            {/* HOURLY TAB */}
            {activeTab === 'hourly' && data.hourly && (
                <View style={styles.bodyCard}>
                    <Text style={styles.sectionHeader}>{t('upcoming_hours')}</Text>
                    <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={true}>
                        {data.hourly.time.slice(0, 12).map((timeStr, index) => {
                            const hourFormatted = new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const temp = data.hourly.temperature_2m[index];
                            const snowfall = data.hourly.snowfall[index];
                            const prob = data.hourly.precipitation_probability[index];
                            const windSpeed = data.hourly.wind_speed_10m ? data.hourly.wind_speed_10m[index] : 0;

                            return (
                                <View key={index} style={styles.hourlyItem}>
                                    <Text style={styles.hourText}>{hourFormatted}</Text>
                                    
                                    <View style={styles.hourlyBadgeContainer}>
                                        {snowfall > 0 ? (
                                            <View style={styles.snowBadge}>
                                                <Snowflake size={10} color="#0284c7" />
                                                <Text style={styles.snowBadgeText}>{snowfall}{hourlyUnits.snowfall}</Text>
                                            </View>
                                        ) : prob > 0 ? (
                                            <View style={styles.rainBadge}>
                                                <Umbrella size={10} color={COLORS.primaryDark} />
                                                <Text style={styles.rainBadgeText}>{prob}%</Text>
                                            </View>
                                        ) : (
                                            <Text style={styles.noPrecipText}>{t('no_precip')}</Text>
                                        )}
                                    </View>
                                    
                                    <View style={styles.hourlyWind}>
                                        <Wind size={10} color={COLORS.textLight} />
                                        <Text style={styles.hourlyWindText}>{windSpeed} {hourlyUnits.wind_speed_10m}</Text>
                                    </View>
                                    
                                    <Text style={styles.hourlyTempText}>{temp}°</Text>
                                </View>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

            {/* DAILY TAB */}
            {activeTab === 'daily' && data.daily && (
                <View style={styles.bodyCard}>
                    <Text style={styles.sectionHeader}>{t('multiday_outlook')}</Text>
                    <View style={styles.dailyContainer}>
                        {data.daily.time.map((dayStr, index) => {
                            const dateObj = new Date(dayStr);
                            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                            const maxTemp = data.daily?.temperature_2m_max[index];
                            const minTemp = data.daily?.temperature_2m_min[index];
                            const snowfallSum = data.daily?.snowfall_sum ? data.daily.snowfall_sum[index] : 0;

                            return (
                                <View key={index} style={styles.hourlyItem}>
                                    <Text style={styles.dayNameText}>{dayName}</Text>
                                    {snowfallSum > 0 ? (
                                        <View style={styles.snowBadge}>
                                            <Snowflake size={10} color="#0284c7" />
                                            <Text style={styles.snowBadgeText}>{snowfallSum} cm</Text>
                                        </View>
                                    ) : (
                                        <Text style={styles.noPrecipText}>{t('no_snow')}</Text>
                                    )}
                                    <View style={styles.dailyTempRange}>
                                        <Text style={styles.dailyMaxText}>{maxTemp}°</Text>
                                        <Text style={styles.dailySlashText}>/</Text>
                                        <Text style={styles.dailyMinText}>{minTemp}°</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'column',
        gap: SPACING.sm,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    headerTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: COLORS.textSecondary,
    },
    tabsWrapper: {
        flexDirection: 'row',
        backgroundColor: COLORS.surface,
        padding: 4,
        borderRadius: BORDER_RADIUS.md,
    },
    tabButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.sm,
    },
    tabButtonActive: {
        backgroundColor: COLORS.primary,
    },
    tabText: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    tabTextActive: {
        color: COLORS.textOnPrimary,
    },
    bodyCard: {
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.lg,
        flexDirection: 'column',
        gap: SPACING.md,
        ...SHADOWS.sm,
    },
    conditionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    conditionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    iconCircle: {
        padding: 10,
        borderRadius: BORDER_RADIUS.md,
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    metricLabel: {
        fontSize: 10,
        color: COLORS.textLight,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    conditionText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
    timeText: {
        fontSize: 10,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    conditionRight: {
        alignItems: 'end',
    },
    tempText: {
        fontSize: 30,
        fontWeight: '800',
        color: COLORS.textPrimary,
    },
    feelsLikeText: {
        fontSize: 11,
        color: COLORS.textSecondary,
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingTop: SPACING.md,
        borderTopWidth: 1,
        borderColor: COLORS.border,
    },
    metricCard: {
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: BORDER_RADIUS.md,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: '48%',
        marginBottom: 4,
    },
    gridMetricLabel: {
        fontSize: 9,
        color: COLORS.textLight,
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    gridMetricValue: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
    sectionHeader: {
        fontSize: 10,
        color: COLORS.textLight,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    scrollList: {
        height: 280,
    },
    hourlyItem: {
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.md,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginVertical: 4,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    hourText: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.textPrimary,
        width: 56,
    },
    hourlyBadgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        justifyContent: 'center',
    },
    snowBadge: {
        backgroundColor: '#e0f2fe',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: BORDER_RADIUS.round,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    snowBadgeText: {
        fontSize: 10,
        color: '#0369a1',
        fontWeight: 'bold',
    },
    rainBadge: {
        backgroundColor: COLORS.primaryLight,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: BORDER_RADIUS.round,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    rainBadgeText: {
        fontSize: 10,
        color: COLORS.primaryDark,
        fontWeight: 'bold',
    },
    noPrecipText: {
        fontSize: 10,
        color: COLORS.textLight,
    },
    hourlyWind: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        width: 64,
        justifyContent: 'flex-end',
    },
    hourlyWindText: {
        fontSize: 10,
        color: COLORS.textSecondary,
    },
    hourlyTempText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        width: 48,
        textAlign: 'right',
    },
    dailyContainer: {
        flexDirection: 'column',
    },
    dayNameText: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.textPrimary,
        width: 112,
    },
    dailyTempRange: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    dailyMaxText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.danger,
    },
    dailySlashText: {
        fontSize: 12,
        color: COLORS.textLight,
    },
    dailyMinText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
});