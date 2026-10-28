import {
    Sun,
    Cloud,
    CloudRain,
    Snowflake,
    Wind,
    Compass,
    Droplets,
    Flame,
    Gauge,
    Umbrella,
    Eye,
    MountainSnow,
    Layers,
    Calendar,
    ShieldAlert,
    ArrowUpRight,
    AlertTriangle,
} from 'lucide-react-native';
import { WeatherForecast } from 'models/weather.model';
import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface WeatherWidgetProps {
    data: WeatherForecast;
}

type WeatherTab = 'snow' | 'current' | 'hourly' | 'daily';

const SCALE_LEVELS = [
    { level: 1, titleKey: 'avalanche_level_1', titleDef: 'Débil', color: '#16a34a' },
    { level: 2, titleKey: 'avalanche_level_2', titleDef: 'Moderado', color: '#ca8a04' },
    { level: 3, titleKey: 'avalanche_level_3', titleDef: 'Notable', color: '#ea580c' },
    { level: 4, titleKey: 'avalanche_level_4', titleDef: 'Fuerte', color: '#dc2626' },
    { level: 5, titleKey: 'avalanche_level_5', titleDef: 'Muy Fuerte', color: '#7f1d1d' },
];

export const WeatherForecastDetails: React.FC<WeatherWidgetProps> = ({ data }) => {
    const { t, i18n } = useTranslation();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

    const hasSnowReport = Boolean(data.snow_report);
    const [activeTab, setActiveTab] = useState<WeatherTab>(hasSnowReport ? 'snow' : 'current');

    const current = data.current;
    const currentUnits = data.current_units;
    const hourlyUnits = data.hourly_units;
    const snowReport = data.snow_report;

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
                return { label: t('partly_cloudy'), icon: <Cloud size={24} color={colors.primary} /> };
            case 45:
            case 48:
                return { label: t('foggy'), icon: <Cloud size={24} color={colors.textSecondary} /> };
            case 51:
            case 53:
            case 55:
            case 61:
            case 63:
                return { label: t('rain_showers'), icon: <CloudRain size={24} color={colors.primary} /> };
            case 71:
            case 73:
            case 75:
            case 77:
                return { label: t('snowfall'), icon: <Snowflake size={24} color="#38bdf8" /> };
            case 95:
            case 96:
            case 99:
                return { label: t('thunderstorm'), icon: <CloudRain size={24} color={colors.danger} /> };
            default:
                return { label: t('variable'), icon: <Cloud size={24} color={colors.textSecondary} /> };
        }
    };

    const currentWeatherInfo = getWeatherInfo(current.weather_code);

    // Filter upcoming days with snowfall in the 7-day window
    const upcomingSnowDays = useMemo(() => {
        if (!data.daily) return [];
        const list: {
            dayName: string;
            snowfall: number;
            tempMax: number;
            tempMin: number;
            precipProb?: number;
        }[] = [];

        data.daily.time.forEach((dayStr, idx) => {
            const snowfall = data.daily?.snowfall_sum?.[idx] ?? 0;
            if (snowfall > 0) {
                const dateObj = new Date(dayStr);
                const dayName = dateObj.toLocaleDateString(i18n.language, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                });
                list.push({
                    dayName,
                    snowfall,
                    tempMax: data.daily?.temperature_2m_max?.[idx] ?? 0,
                    tempMin: data.daily?.temperature_2m_min?.[idx] ?? 0,
                    precipProb: data.daily?.precipitation_probability_max?.[idx],
                });
            }
        });

        return list;
    }, [data.daily, i18n.language]);

    // Format last snowfall date
    const formattedLastSnowfall = (() => {
        if (!snowReport?.last_snowfall_date) return null;
        try {
            const dateObj = new Date(snowReport.last_snowfall_date);
            const dateText = dateObj.toLocaleDateString(i18n.language, {
                day: 'numeric',
                month: 'short',
            });
            return `${dateText} (${snowReport.last_snowfall_amount_cm} cm)`;
        } catch {
            return `${snowReport.last_snowfall_date} (${snowReport.last_snowfall_amount_cm} cm)`;
        }
    })();

    const snowConditionLabel = snowReport
        ? t(`snow_condition_${snowReport.snow_condition}`, {
              defaultValue: snowReport.snow_condition_label || t('snow_condition_packed_powder'),
          })
        : '';

    return (
        <View style={styles.container}>
            {/* Header Tabs */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>{t('detailed_weather')}</Text>
                <View style={styles.tabsWrapper}>
                    {hasSnowReport && (
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'snow' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('snow')}
                        >
                            <Snowflake
                                size={12}
                                color={activeTab === 'snow' ? colors.textOnPrimary : colors.primary}
                                style={{ marginRight: 4 }}
                            />
                            <Text style={[styles.tabText, activeTab === 'snow' && styles.tabTextActive]}>
                                {t('tab_snow')}
                            </Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={[styles.tabButton, activeTab === 'current' && styles.tabButtonActive]}
                        onPress={() => setActiveTab('current')}
                    >
                        <Text style={[styles.tabText, activeTab === 'current' && styles.tabTextActive]}>
                            {t('current')}
                        </Text>
                    </TouchableOpacity>
                    {data.hourly && (
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'hourly' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('hourly')}
                        >
                            <Text style={[styles.tabText, activeTab === 'hourly' && styles.tabTextActive]}>
                                {t('hourly')}
                            </Text>
                        </TouchableOpacity>
                    )}
                    {data.daily && (
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'daily' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('daily')}
                        >
                            <Text style={[styles.tabText, activeTab === 'daily' && styles.tabTextActive]}>
                                {t('daily')}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* SNOW & SNOWFALL FORECAST TAB */}
            {activeTab === 'snow' && snowReport && (
                <View style={styles.bodyCard}>
                    {/* Hero Snowfall Forecast Banner */}
                    <View style={styles.snowHeroCard}>
                        <View style={styles.snowHeroHeader}>
                            <View style={styles.snowHeroIconBadge}>
                                <MountainSnow size={22} color="#0284c7" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.snowHeroTitle}>{t('snow_forecast')}</Text>
                                <Text style={styles.snowHeroSubtitle}>{t('snow_forecast_7d_total')}</Text>
                            </View>
                            <View style={styles.snowHeroStat}>
                                <Text style={styles.snowHeroAmount}>
                                    {snowReport.forecast_snow_7d_cm > 0 ? `+${snowReport.forecast_snow_7d_cm}` : '0'}
                                </Text>
                                <Text style={styles.snowHeroUnit}>cm</Text>
                            </View>
                        </View>

                        {/* 24h & 48h mini stats */}
                        <View style={styles.snowHeroSubRow}>
                            <View style={styles.snowSubMetric}>
                                <Text style={styles.snowSubLabel}>{t('fresh_snow_24h')}</Text>
                                <Text style={styles.snowSubValue}>
                                    {snowReport.fresh_snow_24h_cm > 0 ? `+${snowReport.fresh_snow_24h_cm} cm` : '0 cm'}
                                </Text>
                            </View>
                            <View style={styles.snowSubDivider} />
                            <View style={styles.snowSubMetric}>
                                <Text style={styles.snowSubLabel}>{t('fresh_snow_48h')}</Text>
                                <Text style={styles.snowSubValue}>
                                    {snowReport.fresh_snow_48h_cm > 0 ? `+${snowReport.fresh_snow_48h_cm} cm` : '0 cm'}
                                </Text>
                            </View>
                            <View style={styles.snowSubDivider} />
                            <View style={styles.snowSubMetric}>
                                <Text style={styles.snowSubLabel}>{t('freezing_level')}</Text>
                                <Text style={styles.snowSubValue}>
                                    {Math.round(snowReport.freezing_level_m)} m
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Snowpack by Elevation (Base vs Summit) */}
                    <View>
                        <Text style={styles.sectionHeader}>{t('snowpack_overview')}</Text>
                        <View style={styles.elevationGrid}>
                            <View style={styles.elevationCard}>
                                <View style={styles.elevationIconCircle}>
                                    <Layers size={16} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.elevationTitle}>{t('cota_base')}</Text>
                                    <Text style={styles.elevationAlt}>
                                        {Math.round(snowReport.base_elevation_m)} m
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={styles.elevationDepth}>{snowReport.snow_depth_base_cm}</Text>
                                    <Text style={styles.elevationDepthUnit}>cm</Text>
                                </View>
                            </View>

                            <View style={styles.elevationCard}>
                                <View style={[styles.elevationIconCircle, { backgroundColor: '#e0f2fe' }]}>
                                    <MountainSnow size={16} color="#0284c7" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.elevationTitle}>{t('cota_summit')}</Text>
                                    <Text style={styles.elevationAlt}>
                                        {Math.round(snowReport.summit_elevation_m)} m
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={styles.elevationDepth}>{snowReport.snow_depth_summit_cm}</Text>
                                    <Text style={styles.elevationDepthUnit}>cm</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Snow Quality & Conditions */}
                    <View style={styles.metricsGrid}>
                        <View style={styles.metricCard}>
                            <Snowflake size={16} color="#0284c7" />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.gridMetricLabel}>{t('snow_quality')}</Text>
                                <Text style={styles.gridMetricValue} numberOfLines={1}>
                                    {snowConditionLabel}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.metricCard}>
                            <Calendar size={16} color="#8b5cf6" />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.gridMetricLabel}>{t('last_snowfall')}</Text>
                                <Text style={styles.gridMetricValue} numberOfLines={1}>
                                    {formattedLastSnowfall || t('no_recent_snow')}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Upcoming Snowfalls in Next 7 Days */}
                    <View>
                        <Text style={styles.sectionHeader}>{t('upcoming_snowfalls')}</Text>
                        {upcomingSnowDays.length > 0 ? (
                            <View style={styles.upcomingList}>
                                {upcomingSnowDays.map((item, index) => (
                                    <View key={index} style={styles.snowDayItem}>
                                        <View style={styles.snowDayLeft}>
                                            <Snowflake size={14} color="#0284c7" />
                                            <Text style={styles.snowDayName}>{item.dayName}</Text>
                                        </View>

                                        <View style={styles.snowDayBadge}>
                                            <Text style={styles.snowDayBadgeText}>+{item.snowfall} cm</Text>
                                        </View>

                                        <View style={styles.dailyTempRange}>
                                            <Text style={styles.dailyMaxText}>{item.tempMax}°</Text>
                                            <Text style={styles.dailySlashText}>/</Text>
                                            <Text style={styles.dailyMinText}>{item.tempMin}°</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View style={styles.noSnowCard}>
                                <Sun size={20} color="#f59e0b" />
                                <Text style={styles.noSnowCardText}>{t('no_snow_forecast_7d')}</Text>
                            </View>
                        )}
                    </View>

                    {/* AVALANCHE DANGER BULLETIN (BPA) SECTION */}
                    {snowReport.avalanche_report && (
                        <View style={styles.avalancheCard}>
                            <View style={styles.avalancheHeaderRow}>
                                <View style={styles.avalancheHeaderLeft}>
                                    <View
                                        style={[
                                            styles.avalancheIconCircle,
                                            { backgroundColor: snowReport.avalanche_report.danger_color || '#ea580c' },
                                        ]}
                                    >
                                        <ShieldAlert size={16} color="#ffffff" />
                                    </View>
                                    <View>
                                        <Text style={styles.sectionHeader}>
                                            {t('avalanche_bulletin', 'Peligro de Aludes (BPA)')}
                                        </Text>
                                        <Text style={styles.avalancheSubtitle}>
                                            {t('avalanche_scale', 'Escala Europea (1 a 5)')}
                                        </Text>
                                    </View>
                                </View>

                                <View
                                    style={[
                                        styles.avalancheBadge,
                                        { backgroundColor: snowReport.avalanche_report.danger_color || '#ea580c' },
                                    ]}
                                >
                                    <Text style={styles.avalancheBadgeText}>
                                        {snowReport.avalanche_report.danger_level} ·{' '}
                                        {t(`avalanche_level_${snowReport.avalanche_report.danger_level}`, {
                                            defaultValue: snowReport.avalanche_report.danger_level_title,
                                        })}
                                    </Text>
                                </View>
                            </View>

                            {/* European 5-Level Visual Bar */}
                            <View style={styles.scaleContainer}>
                                {SCALE_LEVELS.map((item) => {
                                    const isActive = item.level === snowReport.avalanche_report?.danger_level;
                                    return (
                                        <View key={item.level} style={styles.scaleSegment}>
                                            <View
                                                style={[
                                                    styles.scaleBar,
                                                    {
                                                        backgroundColor: item.color,
                                                        opacity: isActive ? 1.0 : 0.25,
                                                        height: isActive ? 10 : 6,
                                                    },
                                                ]}
                                            />
                                            <Text
                                                style={[
                                                    styles.scaleNum,
                                                    isActive
                                                        ? { color: item.color, fontWeight: '800' }
                                                        : { color: colors.textSecondary },
                                                ]}
                                            >
                                                {item.level}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>

                            {/* Critical Factors Row */}
                            <View style={styles.avalancheFactorsRow}>
                                <View style={styles.avalancheFactorCard}>
                                    <View style={styles.avalancheFactorHeader}>
                                        <ArrowUpRight size={12} color={colors.primary} />
                                        <Text style={styles.avalancheFactorLabel}>
                                            {t('critical_elevation', 'Cota crítica')}
                                        </Text>
                                    </View>
                                    <Text style={styles.avalancheFactorValue}>
                                        &gt; {Math.round(snowReport.avalanche_report.critical_elevation_m || 2000)} m
                                    </Text>
                                </View>

                                <View style={styles.avalancheFactorCard}>
                                    <View style={styles.avalancheFactorHeader}>
                                        <Compass size={12} color="#ea580c" />
                                        <Text style={styles.avalancheFactorLabel}>
                                            {t('dangerous_aspects', 'Laderas críticas')}
                                        </Text>
                                    </View>
                                    <View style={styles.aspectsPillWrap}>
                                        {snowReport.avalanche_report.dangerous_aspects?.length > 0 ? (
                                            snowReport.avalanche_report.dangerous_aspects.map((aspect) => (
                                                <View key={aspect} style={styles.aspectPill}>
                                                    <Text style={styles.aspectPillText}>{aspect}</Text>
                                                </View>
                                            ))
                                        ) : (
                                            <Text style={styles.avalancheFactorValue}>Todas</Text>
                                        )}
                                    </View>
                                </View>

                                <View style={styles.avalancheFactorCard}>
                                    <View style={styles.avalancheFactorHeader}>
                                        <Wind size={12} color="#0284c7" />
                                        <Text style={styles.avalancheFactorLabel}>
                                            {t('avalanche_wind_risk', 'Viento')}
                                        </Text>
                                    </View>
                                    <Text style={styles.avalancheFactorValue}>
                                        {snowReport.avalanche_report.wind_risk || 'Bajo'}
                                    </Text>
                                </View>
                            </View>

                            {/* Advisory Summary Box */}
                            <View
                                style={[
                                    styles.avalancheSummaryBox,
                                    { borderLeftColor: snowReport.avalanche_report.danger_color || colors.primary },
                                ]}
                            >
                                <AlertTriangle
                                    size={14}
                                    color={snowReport.avalanche_report.danger_color || colors.textSecondary}
                                />
                                <Text style={styles.avalancheSummaryText}>
                                    {snowReport.avalanche_report.summary}
                                </Text>
                            </View>
                        </View>
                    )}

                    <Text style={styles.dataSourceNotice}>{t('open_meteo_credit')}</Text>
                </View>
            )}

            {/* CURRENT TAB */}
            {activeTab === 'current' && (
                <View style={styles.bodyCard}>
                    <View style={styles.conditionRow}>
                        <View style={styles.conditionLeft}>
                            <View style={styles.iconCircle}>
                                {currentWeatherInfo.icon}
                            </View>
                            <View style={styles.conditionTextContainer}>
                                <Text style={styles.metricLabel}>{t('condition')}</Text>
                                <Text style={styles.conditionText} numberOfLines={1} ellipsizeMode="tail">
                                    {currentWeatherInfo.label}
                                </Text>
                                <Text style={styles.timeText} numberOfLines={1} ellipsizeMode="tail">
                                    {t('updated')}: {new Date(current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.conditionRight}>
                            <Text style={styles.tempText}>
                                {current.temperature_2m}{currentUnits.temperature_2m}
                            </Text>
                            <Text style={styles.feelsLikeText}>
                                {t('feels_like', { temp: `${current.apparent_temperature}${currentUnits.temperature_2m}` })}
                            </Text>
                        </View>
                    </View>

                    {/* Quick Snow Bar if SnowReport exists */}
                    {snowReport && (
                        <View style={styles.quickSnowBar}>
                            <View style={styles.quickSnowItem}>
                                <Snowflake size={14} color="#0284c7" />
                                <Text style={styles.quickSnowLabel}>{t('snow_depth')}:</Text>
                                <Text style={styles.quickSnowValue}>
                                    {snowReport.snow_depth_base_cm} - {snowReport.snow_depth_summit_cm} cm
                                </Text>
                            </View>
                            <View style={styles.quickSnowDivider} />
                            <View style={styles.quickSnowItem}>
                                <Text style={styles.quickSnowLabel}>{t('snow_quality')}:</Text>
                                <Text style={styles.quickSnowValue}>{snowConditionLabel}</Text>
                            </View>
                            {snowReport.forecast_snow_7d_cm > 0 && (
                                <>
                                    <View style={styles.quickSnowDivider} />
                                    <View style={styles.quickSnowItem}>
                                        <Text style={styles.quickSnowLabel}>7d:</Text>
                                        <Text style={[styles.quickSnowValue, { color: '#0284c7' }]}>
                                            +{snowReport.forecast_snow_7d_cm} cm
                                        </Text>
                                    </View>
                                </>
                            )}
                            {snowReport.avalanche_report && (
                                <>
                                    <View style={styles.quickSnowDivider} />
                                    <View style={styles.quickSnowItem}>
                                        <ShieldAlert
                                            size={12}
                                            color={snowReport.avalanche_report.danger_color || '#ea580c'}
                                        />
                                        <Text style={styles.quickSnowLabel}>BPA:</Text>
                                        <Text
                                            style={[
                                                styles.quickSnowValue,
                                                {
                                                    color:
                                                        snowReport.avalanche_report.danger_color ||
                                                        colors.textPrimary,
                                                },
                                            ]}
                                        >
                                            {snowReport.avalanche_report.danger_level}/5
                                        </Text>
                                    </View>
                                </>
                            )}
                        </View>
                    )}

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
                            <Droplets size={16} color={colors.primary} />
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
                                                <Umbrella size={10} color={colors.primaryDark} />
                                                <Text style={styles.rainBadgeText}>{prob}%</Text>
                                            </View>
                                        ) : (
                                            <Text style={styles.noPrecipText}>{t('no_precip')}</Text>
                                        )}
                                    </View>

                                    <View style={styles.hourlyWind}>
                                        <Wind size={10} color={colors.textSecondary} />
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
                            const dayName = dateObj.toLocaleDateString(i18n.language, { weekday: 'short', month: 'short', day: 'numeric' });
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

const getStyles = (colors: any) => StyleSheet.create({
    container: {
        flexDirection: 'column',
        gap: SPACING.sm,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
        flexWrap: 'wrap',
        gap: 6,
    },
    headerTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: colors.textSecondary,
    },
    tabsWrapper: {
        flexDirection: 'row',
        backgroundColor: colors.background,
        padding: 3,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
    },
    tabButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: BORDER_RADIUS.sm,
    },
    tabButtonActive: {
        backgroundColor: colors.primary,
    },
    tabText: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    tabTextActive: {
        color: colors.textOnPrimary,
    },
    bodyCard: {
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.lg,
        flexDirection: 'column',
        gap: SPACING.md,
        ...SHADOWS.sm,
    },
    snowHeroCard: {
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        gap: 12,
    },
    snowHeroHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    snowHeroIconBadge: {
        backgroundColor: '#e0f2fe',
        padding: 10,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: '#bae6fd',
    },
    snowHeroTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    snowHeroSubtitle: {
        fontSize: 11,
        color: colors.textSecondary,
        marginTop: 1,
    },
    snowHeroStat: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
    },
    snowHeroAmount: {
        fontSize: 26,
        fontWeight: '800',
        color: '#0284c7',
        lineHeight: 30,
    },
    snowHeroUnit: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#0284c7',
        marginBottom: 3,
    },
    snowHeroSubRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 10,
        borderTopWidth: 1,
        borderColor: colors.border,
    },
    snowSubMetric: {
        flex: 1,
        alignItems: 'center',
    },
    snowSubLabel: {
        fontSize: 9,
        fontWeight: '600',
        textTransform: 'uppercase',
        color: colors.textSecondary,
        marginBottom: 2,
    },
    snowSubValue: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    snowSubDivider: {
        width: 1,
        height: 20,
        backgroundColor: colors.border,
    },
    elevationGrid: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 4,
    },
    elevationCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BORDER_RADIUS.md,
        padding: 10,
    },
    elevationIconCircle: {
        padding: 8,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
    },
    elevationTitle: {
        fontSize: 11,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    elevationAlt: {
        fontSize: 9,
        color: colors.textSecondary,
    },
    elevationDepth: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0284c7',
    },
    elevationDepthUnit: {
        fontSize: 9,
        fontWeight: 'bold',
        color: colors.textSecondary,
    },
    upcomingList: {
        flexDirection: 'column',
        gap: 6,
        marginTop: 4,
    },
    snowDayItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.background,
        borderRadius: BORDER_RADIUS.md,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    snowDayLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    snowDayName: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    snowDayBadge: {
        backgroundColor: '#e0f2fe',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: BORDER_RADIUS.round,
        marginHorizontal: 8,
    },
    snowDayBadgeText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#0284c7',
    },
    noSnowCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.background,
        padding: 12,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.border,
        marginTop: 4,
    },
    noSnowCardText: {
        fontSize: 11,
        color: colors.textSecondary,
        flex: 1,
    },
    avalancheCard: {
        backgroundColor: colors.background,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: SPACING.md,
        gap: 10,
        marginTop: 4,
    },
    avalancheHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    avalancheHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    avalancheIconCircle: {
        width: 30,
        height: 30,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avalancheSubtitle: {
        fontSize: 10,
        color: colors.textSecondary,
        marginTop: 1,
    },
    avalancheBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: BORDER_RADIUS.round,
    },
    avalancheBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#ffffff',
        textTransform: 'uppercase',
    },
    scaleContainer: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
        marginVertical: 2,
    },
    scaleSegment: {
        flex: 1,
        alignItems: 'center',
        gap: 3,
    },
    scaleBar: {
        width: '100%',
        borderRadius: BORDER_RADIUS.round,
    },
    scaleNum: {
        fontSize: 10,
    },
    avalancheFactorsRow: {
        flexDirection: 'row',
        gap: 6,
    },
    avalancheFactorCard: {
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.sm,
        padding: 8,
        borderWidth: 1,
        borderColor: colors.border,
    },
    avalancheFactorHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 2,
    },
    avalancheFactorLabel: {
        fontSize: 9,
        fontWeight: '600',
        color: colors.textSecondary,
        textTransform: 'uppercase',
    },
    avalancheFactorValue: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    aspectsPillWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 2,
    },
    aspectPill: {
        backgroundColor: colors.background,
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: BORDER_RADIUS.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    aspectPillText: {
        fontSize: 9,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    avalancheSummaryBox: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
        backgroundColor: colors.card,
        padding: 10,
        borderRadius: BORDER_RADIUS.sm,
        borderLeftWidth: 3,
    },
    avalancheSummaryText: {
        flex: 1,
        fontSize: 11,
        color: colors.textPrimary,
        lineHeight: 15,
    },
    dataSourceNotice: {
        fontSize: 9,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: 2,
    },
    quickSnowBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BORDER_RADIUS.md,
        paddingVertical: 6,
        paddingHorizontal: 10,
        flexWrap: 'wrap',
        gap: 4,
    },
    quickSnowItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    quickSnowLabel: {
        fontSize: 10,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    quickSnowValue: {
        fontSize: 11,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    quickSnowDivider: {
        width: 1,
        height: 12,
        backgroundColor: colors.border,
    },
    conditionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: SPACING.sm,
    },
    conditionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
        flex: 1,
        minWidth: 0,
    },
    conditionTextContainer: {
        flex: 1,
        minWidth: 0,
    },
    iconCircle: {
        padding: 10,
        borderRadius: BORDER_RADIUS.md,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        flexShrink: 0,
    },
    metricLabel: {
        fontSize: 10,
        color: colors.textSecondary,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    conditionText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    timeText: {
        fontSize: 10,
        color: colors.textSecondary,
        marginTop: 2,
    },
    conditionRight: {
        alignItems: 'flex-end',
        flexShrink: 0,
    },
    tempText: {
        fontSize: 30,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    feelsLikeText: {
        fontSize: 11,
        color: colors.textSecondary,
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingTop: SPACING.sm,
        borderTopWidth: 1,
        borderColor: colors.border,
    },
    metricCard: {
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
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
        color: colors.textSecondary,
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    gridMetricValue: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    sectionHeader: {
        fontSize: 10,
        color: colors.textSecondary,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    scrollList: {
        height: 280,
    },
    hourlyItem: {
        backgroundColor: colors.background,
        borderRadius: BORDER_RADIUS.md,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginVertical: 4,
        borderWidth: 1,
        borderColor: colors.border,
    },
    hourText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary,
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
        backgroundColor: '#e0f2fe',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: BORDER_RADIUS.round,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    rainBadgeText: {
        fontSize: 10,
        color: '#0369a1',
        fontWeight: 'bold',
    },
    noPrecipText: {
        fontSize: 10,
        color: colors.textSecondary,
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
        color: colors.textSecondary,
    },
    hourlyTempText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.textPrimary,
        width: 48,
        textAlign: 'right',
    },
    dailyContainer: {
        flexDirection: 'column',
    },
    dayNameText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary,
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
        color: colors.danger,
    },
    dailySlashText: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    dailyMinText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.primary,
    },
});
