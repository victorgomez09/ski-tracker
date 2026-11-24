import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  CloudLightning,
  CloudRain,
  Compass,
  Download,
  Droplets,
  ExternalLink,
  Eye,
  Flame,
  Gauge,
  Globe,
  Layers,
  Map as MapIcon,
  MapPin,
  Mountain,
  Navigation,
  RefreshCw,
  ShieldAlert,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Thermometer,
  Umbrella,
  Wind,
  X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from '../../constants/theme';
import { useFavorites } from '../../context/favorites.context';
import { ACTIVITY_CONFIGS, ActivityType } from '../../models/activity.model';
import { Resort, ResortDetail } from '../../models/ski-resort.model';
import { WeatherForecast } from '../../models/weather.model';
import { getWindDirectionInfo, SPAIN_ANDORRA_RESORTS } from '../../services/snow-forecast.service';
import { ResortLogo } from './resort-logo';

export type SkiinfoTab = 'snow' | 'pistes' | 'weather' | 'community';

interface SkiinfoResortDetailProps {
  resort: Resort | ResortDetail;
  weatherData: WeatherForecast | null;
  sessions?: any[];
  isLoadingSessions?: boolean;
  isRefreshingWeather?: boolean;
  onRefreshWeather?: () => void;
  onClose: () => void;
  onOpenMap?: () => void;
  onStartTracking?: () => void;
  onDownloadOffline?: () => void;
}

const SCALE_LEVELS = [
  { level: 1, title: 'Débil', color: '#16a34a' },
  { level: 2, title: 'Moderado', color: '#ca8a04' },
  { level: 3, title: 'Notable', color: '#ea580c' },
  { level: 4, title: 'Fuerte', color: '#dc2626' },
  { level: 5, title: 'Muy Fuerte', color: '#7f1d1d' },
];

const parseLiftType = (liftType: string) => {
  switch (liftType?.toLowerCase()) {
    case 'chair_lift':
      return 'Telesillas';
    case 'drag_lift':
      return 'Telesquís';
    case 'gondola':
      return 'Telecabinas';
    case 'cable_car':
      return 'Teleféricos';
    case 'funicular':
      return 'Funiculares';
    case 'magic_carpet':
      return 'Cintas transportadoras';
    case 'rope_tow':
      return 'Telecuerdas';
    default:
      return liftType ? liftType.replace(/_/g, ' ') : 'Remonte';
  }
};

const WindDirectionArrow: React.FC<{ degrees?: number; size?: number; color?: string }> = ({
  degrees = 0,
  size = 12,
  color = '#0284c7',
}) => {
  const rotation = (degrees + 180) % 360;
  return (
    <View
      style={{
        transform: [{ rotate: `${rotation}deg` }],
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <ArrowUp size={size} color={color} strokeWidth={2.4} />
    </View>
  );
};

const getWeatherCodeLabel = (code: number) => {
  switch (code) {
    case 0:
      return 'Despejado';
    case 1:
      return 'Mayormente despejado';
    case 2:
      return 'Intervalos nubosos';
    case 3:
      return 'Nublado';
    case 45:
    case 48:
      return 'Niebla en montaña';
    case 51:
    case 53:
    case 55:
      return 'Llovizna';
    case 61:
    case 63:
    case 65:
      return 'Lluvia';
    case 71:
      return 'Nevada débil';
    case 73:
      return 'Nevada moderada';
    case 75:
      return 'Nevada copiosa';
    case 77:
      return 'Granizo o cinarra';
    case 85:
    case 86:
      return 'Chubascos de nieve';
    case 95:
    case 96:
    case 99:
      return 'Tormenta';
    default:
      return 'Variable';
  }
};

const renderWeatherIcon = (code: number, size = 20) => {
  switch (code) {
    case 0:
      return <Sun size={size} color="#f59e0b" />;
    case 1:
    case 2:
      return <Cloud size={size} color="#0284c7" />;
    case 3:
      return <Cloud size={size} color="#64748b" />;
    case 45:
    case 48:
      return <Cloud size={size} color="#94a3b8" />;
    case 51:
    case 53:
    case 55:
    case 61:
    case 63:
    case 65:
      return <CloudRain size={size} color="#0284c7" />;
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return <Snowflake size={size} color="#0284c7" />;
    case 95:
    case 96:
    case 99:
      return <CloudLightning size={size} color="#ea580c" />;
    default:
      return <Cloud size={size} color="#64748b" />;
  }
};

const getVisibilityInfo = (visibilityMeters?: number) => {
  if (visibilityMeters === undefined || visibilityMeters === null) {
    return { label: 'Buena', color: '#0284c7', bgColor: '#e0f2fe' };
  }
  if (visibilityMeters >= 10000) {
    return { label: 'Excelente', color: '#059669', bgColor: '#ecfdf5' };
  }
  if (visibilityMeters >= 4000) {
    return { label: 'Buena', color: '#0284c7', bgColor: '#e0f2fe' };
  }
  if (visibilityMeters >= 1000) {
    return { label: 'Media', color: '#d97706', bgColor: '#fef3c7' };
  }
  return { label: 'Baja', color: '#dc2626', bgColor: '#fee2e2' };
};

export const SkiinfoResortDetail: React.FC<SkiinfoResortDetailProps> = ({
  resort,
  weatherData,
  sessions = [],
  isLoadingSessions = false,
  isRefreshingWeather = false,
  onRefreshWeather,
  onClose,
  onOpenMap,
  onStartTracking,
  onDownloadOffline,
}) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { isFavorite, toggleFavorite } = useFavorites();
  const isWeb = Platform.OS === 'web';

  const [activeTab, setActiveTab] = useState<SkiinfoTab>('snow');

  // Horizontal scroll references & handlers (wheel, drag & buttons on Web & Mobile)
  const hourlyScrollRef = useRef<ScrollView>(null);
  const sevenDayScrollRef = useRef<ScrollView>(null);
  const snowForecastScrollRef = useRef<ScrollView>(null);

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const activeDragScrollRef = useRef<React.RefObject<ScrollView | null> | null>(null);

  const scrollHorizontal = (scrollRef: React.RefObject<ScrollView | null>, offset: number) => {
    if (scrollRef.current) {
      if (Platform.OS === 'web') {
        const node =
          (scrollRef.current as any).getScrollableNode?.() ||
          (scrollRef.current as any);
        if (node && typeof node.scrollBy === 'function') {
          node.scrollBy({ left: offset, behavior: 'smooth' });
          return;
        }
      }
      // @ts-ignore
      scrollRef.current.scrollTo?.({ x: Math.max(0, offset), animated: true });
    }
  };

  const handleWheel = (scrollRef: React.RefObject<ScrollView | null>, e: any) => {
    if (Platform.OS === 'web' && scrollRef.current) {
      const delta = e?.deltaY || e?.nativeEvent?.deltaY || e?.deltaX || e?.nativeEvent?.deltaX;
      if (delta) {
        const node =
          (scrollRef.current as any).getScrollableNode?.() ||
          (scrollRef.current as any);
        if (node) {
          node.scrollLeft += delta;
        }
      }
    }
  };

  const handleMouseDown = (scrollRef: React.RefObject<ScrollView | null>, e: any) => {
    if (Platform.OS === 'web' && scrollRef.current) {
      const node =
        (scrollRef.current as any).getScrollableNode?.() ||
        (scrollRef.current as any);
      if (node) {
        isDraggingRef.current = true;
        activeDragScrollRef.current = scrollRef;
        startXRef.current = (e.pageX || e.clientX || 0) - node.offsetLeft;
        scrollLeftRef.current = node.scrollLeft || 0;
      }
    }
  };

  const handleMouseMove = (e: any) => {
    if (Platform.OS === 'web' && isDraggingRef.current && activeDragScrollRef.current?.current) {
      e.preventDefault?.();
      const node =
        (activeDragScrollRef.current.current as any).getScrollableNode?.() ||
        (activeDragScrollRef.current.current as any);
      if (node) {
        const pageX = e.pageX || e.clientX || 0;
        const x = pageX - node.offsetLeft;
        const walk = (x - startXRef.current) * 1.5;
        node.scrollLeft = scrollLeftRef.current - walk;
      }
    }
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
    activeDragScrollRef.current = null;
  };

  // Find fallback elevation seed if resort tags lack full elevation data
  const seedMatch = useMemo(() => {
    const cleanName = resort.Name.toLowerCase();
    return SPAIN_ANDORRA_RESORTS.find(
      (s) =>
        s.id === resort.ID ||
        cleanName.includes(s.id) ||
        cleanName.includes(s.name.toLowerCase()) ||
        s.name.toLowerCase().includes(cleanName)
    );
  }, [resort]);

  // Resort stats calculation
  const stats = useMemo(() => {
    const tagsStats = resort.Tags?.statistics;
    const liftsType = tagsStats?.lifts?.byType;
    const downhillByDiff = tagsStats?.runs?.byActivity?.downhill?.byDifficulty;
    const pistes = resort.pistes || [];
    const lifts = resort.lifts || [];

    let minElev = tagsStats?.minElevation ?? tagsStats?.runs?.minElevation ?? tagsStats?.lifts?.minElevation ?? 0;
    let maxElev = tagsStats?.maxElevation ?? tagsStats?.runs?.maxElevation ?? tagsStats?.lifts?.maxElevation ?? 0;

    if (!minElev && weatherData?.snow_report?.base_elevation_m) {
      minElev = Math.round(weatherData.snow_report.base_elevation_m);
    }
    if (!maxElev && weatherData?.snow_report?.summit_elevation_m) {
      maxElev = Math.round(weatherData.snow_report.summit_elevation_m);
    }

    if ((!minElev || !maxElev) && seedMatch) {
      if (!minElev) minElev = seedMatch.base_elevation_m;
      if (!maxElev) maxElev = seedMatch.summit_elevation_m;
    }

    if (minElev && maxElev && maxElev < minElev) {
      const temp = minElev;
      minElev = maxElev;
      maxElev = temp;
    }

    const verticalDrop = maxElev > minElev ? maxElev - minElev : 0;
    let midElev = weatherData?.snow_report?.mid_elevation_m;
    if (!midElev && minElev && maxElev) {
      midElev = Math.round((minElev + maxElev) / 2);
    }

    const difficultyCounts = downhillByDiff
      ? {
          novice: downhillByDiff.novice?.count ?? 0,
          easy: downhillByDiff.easy?.count ?? 0,
          intermediate: downhillByDiff.intermediate?.count ?? 0,
          advanced: (downhillByDiff.advanced?.count ?? 0) + ((downhillByDiff as any).expert?.count ?? 0),
        }
      : {
          novice: pistes.filter((p) => p.Difficulty?.toLowerCase() === 'novice').length,
          easy: pistes.filter((p) => p.Difficulty?.toLowerCase() === 'easy').length,
          intermediate: pistes.filter((p) => p.Difficulty?.toLowerCase() === 'intermediate').length,
          advanced: pistes.filter(
            (p) => p.Difficulty?.toLowerCase() === 'advanced' || p.Difficulty?.toLowerCase() === 'expert'
          ).length,
        };

    const difficultyLengths = downhillByDiff
      ? {
          novice: (downhillByDiff.novice?.lengthInKm ?? 0) * 1000,
          easy: (downhillByDiff.easy?.lengthInKm ?? 0) * 1000,
          intermediate: (downhillByDiff.intermediate?.lengthInKm ?? 0) * 1000,
          advanced:
            ((downhillByDiff.advanced?.lengthInKm ?? 0) + ((downhillByDiff as any).expert?.lengthInKm ?? 0)) * 1000,
        }
      : {
          novice: 0,
          easy: 0,
          intermediate: 0,
          advanced: 0,
        };

    const totalLifts = (resort as Resort).total_lifts ?? lifts.length ?? 0;
    const totalPistes =
      (resort as Resort).total_pistes ??
      difficultyCounts.novice + difficultyCounts.easy + difficultyCounts.intermediate + difficultyCounts.advanced;
    const totalKm = (resort as Resort).distance_km ?? 0;

    const liftTypeCounts: Record<string, number> = {};
    if (liftsType) {
      Object.entries(liftsType).forEach(([type, data]: [string, any]) => {
        if (data && typeof data.count === 'number' && data.count > 0) {
          liftTypeCounts[type] = data.count;
        }
      });
    }

    return {
      minElev,
      midElev,
      maxElev,
      verticalDrop,
      totalLifts,
      totalPistes,
      totalKm: totalKm.toFixed(1),
      difficultyCounts,
      difficultyLengths,
      liftTypeCounts,
    };
  }, [resort, weatherData, seedMatch]);

  const snowReport = weatherData?.snow_report;
  const current = weatherData?.current;

  const baseDepth = snowReport?.snow_depth_base_cm;
  const summitDepth = snowReport?.snow_depth_summit_cm;
  const midDepth =
    snowReport?.snow_depth_mid_cm ??
    (baseDepth !== undefined && summitDepth !== undefined
      ? Math.round((baseDepth + summitDepth) / 2)
      : undefined);

  // Powder alarm check (Skiinfo hallmark)
  const isPowderAlarm = useMemo(() => {
    if (!snowReport) return false;
    return snowReport.fresh_snow_24h_cm >= 15 || snowReport.fresh_snow_48h_cm >= 20 || snowReport.forecast_snow_7d_cm >= 25;
  }, [snowReport]);

  // Today's snowfall estimates by elevation (Cota Baja, Intermedia, Máxima)
  const todaySnowSummit = useMemo(() => {
    if (snowReport?.snowfall_today_summit_cm !== undefined) {
      return snowReport.snowfall_today_summit_cm;
    }
    if (weatherData?.daily?.snowfall_sum?.[0] !== undefined) {
      return Math.round(weatherData.daily.snowfall_sum[0] * 10) / 10;
    }
    return snowReport?.fresh_snow_24h_cm ?? 0;
  }, [snowReport, weatherData]);

  // Freezing level & Snow line analysis
  const freezingLevelInfo = useMemo(() => {
    if (!snowReport || !snowReport.freezing_level_m) return null;
    const isocero = Math.round(snowReport.freezing_level_m);
    // La cota de nieve efectiva se sitúa habitualmente ~250m por debajo del isocero (0°C)
    const snowLine = Math.round(snowReport.snow_line_m || Math.max(0, isocero - 250));

    const minElev = stats.minElev || 1660;
    const maxElev = stats.maxElev || 2300;

    if (snowLine <= minElev) {
      return {
        altitude: snowLine,
        isocero,
        status: 'base',
        label: t('snow_to_base', `❄️ Cota de nieve a ~${snowLine}m (hasta la base)`),
        color: '#0284c7',
      };
    }
    if (snowLine <= maxElev) {
      return {
        altitude: snowLine,
        isocero,
        status: 'mid',
        label: t('snow_mid_mountain', `❄️ Cota de nieve a ~${snowLine}m (nieve en cumbre y cotas medias)`),
        color: '#0284c7',
      };
    }
    // Si la cota de nieve actual está alta pero hay nevada registrada hoy (ej. frente frío en cumbre)
    if (todaySnowSummit > 0) {
      return {
        altitude: snowLine,
        isocero,
        status: 'mid',
        label: t('snow_today_summit_info', `❄️ Nevada en cumbre (+${todaySnowSummit} cm). Cota actual subiendo a ~${snowLine}m`),
        color: '#0284c7',
      };
    }
    return {
      altitude: snowLine,
      isocero,
      status: 'high',
      label: t('snow_above_summit', `💧 Cota de nieve a ~${snowLine}m (por encima de la cumbre, lluvia)`),
      color: '#f59e0b',
    };
  }, [snowReport, stats, todaySnowSummit, t]);

  const windDirInfo = useMemo(() => {
    const deg = current?.wind_direction_10m ?? 0;
    return getWindDirectionInfo(deg);
  }, [current]);

  const snowConditionLabel = useMemo(() => {
    if (!snowReport) return t('snow_condition_packed_powder', 'Polvo dura');
    return (
      t(`snow_condition_${snowReport.snow_condition}`, {
        defaultValue: snowReport.snow_condition_label || t('snow_condition_packed_powder', 'Polvo dura'),
      }) || 'Polvo dura'
    );
  }, [snowReport, t]);

  // Formatted last snowfall text
  const lastSnowfallText = useMemo(() => {
    if (!snowReport?.last_snowfall_date) return null;
    try {
      const d = new Date(snowReport.last_snowfall_date);
      const dateStr = d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
      return `${dateStr} (+${snowReport.last_snowfall_amount_cm} cm)`;
    } catch {
      return `${snowReport.last_snowfall_date} (+${snowReport.last_snowfall_amount_cm} cm)`;
    }
  }, [snowReport, i18n.language]);

  const todaySnowBase = useMemo(() => {
    if (snowReport?.snowfall_today_base_cm !== undefined) {
      return snowReport.snowfall_today_base_cm;
    }
    if (todaySnowSummit > 0 && freezingLevelInfo) {
      const baseElev = stats.minElev || 1600;
      const snowLevel = freezingLevelInfo.altitude - 250;
      if (snowLevel <= baseElev) {
        return Math.round(todaySnowSummit * 0.75 * 10) / 10;
      } else if (snowLevel <= baseElev + 150) {
        return Math.round(todaySnowSummit * 0.25 * 10) / 10;
      }
      return 0;
    }
    return 0;
  }, [snowReport, todaySnowSummit, freezingLevelInfo, stats.minElev]);

  const todaySnowMid = useMemo(() => {
    if (snowReport?.snowfall_today_mid_cm !== undefined) {
      return snowReport.snowfall_today_mid_cm;
    }
    if (todaySnowSummit > 0 && freezingLevelInfo) {
      const midElev = stats.midElev || ((stats.minElev || 1600) + (stats.maxElev || 2300)) / 2;
      const maxElev = stats.maxElev || 2300;
      const snowLevel = freezingLevelInfo.altitude - 250;
      if (snowLevel <= midElev) {
        if (todaySnowBase > 0) {
          return Math.round(((todaySnowBase + todaySnowSummit) / 2) * 10) / 10;
        }
        const fraction = Math.max(0.2, Math.min(0.85, (midElev - snowLevel) / Math.max(1, maxElev - snowLevel)));
        return Math.round(todaySnowSummit * fraction * 10) / 10;
      }
      return 0;
    }
    return Math.round(((todaySnowBase + todaySnowSummit) / 2) * 10) / 10;
  }, [snowReport, todaySnowBase, todaySnowSummit, freezingLevelInfo, stats]);

  return (
    <View style={styles.container}>
      {/* Top Header Card */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <ResortLogo website={resort.Website} size={48} />
          <View style={styles.headerTitleCol}>
            <View style={styles.locationPill}>
              <MapPin size={11} color={colors.primary} />
              <Text style={styles.locationText}>{resort.Country || 'España / Andorra'}</Text>
            </View>
            <Text style={styles.resortTitle} numberOfLines={1}>
              {resort.Name}
            </Text>
          </View>

          <View style={styles.headerActions}>
            {onRefreshWeather && (
              <TouchableOpacity
                onPress={onRefreshWeather}
                style={styles.headerIconBtn}
                accessibilityLabel="Actualizar tiempo"
                disabled={isRefreshingWeather}>
                <RefreshCw
                  size={18}
                  color={colors.textSecondary}
                  style={isRefreshingWeather ? { transform: [{ rotate: '45deg' }] } : {}}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => toggleFavorite(resort as Resort)}
              style={styles.headerIconBtn}
              accessibilityLabel="Favorita">
              <Star
                size={18}
                color={isFavorite(resort.ID) ? '#f59e0b' : colors.textSecondary}
                fill={isFavorite(resort.ID) ? '#f59e0b' : 'transparent'}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.headerIconBtn} accessibilityLabel="Cerrar">
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Skiinfo Mountain Key Stats Bar (Altitude / Vertical Drop / Km / Lifts) */}
        <View style={styles.mountainStatsBar}>
          <View style={styles.mountainStatItem}>
            <Mountain size={13} color={colors.primary} />
            <View>
              <Text style={styles.mountainStatLabel}>{t('elevation', 'Cotas')}</Text>
              <Text style={styles.mountainStatValue}>
                {stats.minElev ? `${stats.minElev} - ${stats.maxElev}m` : '--'}
              </Text>
            </View>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.mountainStatItem}>
            <ArrowUpRight size={13} color="#0284c7" />
            <View>
              <Text style={styles.mountainStatLabel}>{t('vertical_drop', 'Desnivel')}</Text>
              <Text style={[styles.mountainStatValue, { color: '#0284c7' }]}>
                {stats.verticalDrop > 0 ? `${stats.verticalDrop} m` : '--'}
              </Text>
            </View>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.mountainStatItem}>
            <Layers size={13} color="#10b981" />
            <View>
              <Text style={styles.mountainStatLabel}>{t('slopes', 'Pistas')}</Text>
              <Text style={styles.mountainStatValue}>
                {stats.totalKm} km ({stats.totalPistes})
              </Text>
            </View>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.mountainStatItem}>
            <Navigation size={13} color="#f59e0b" />
            <View>
              <Text style={styles.mountainStatLabel}>{t('lifts', 'Remontes')}</Text>
              <Text style={styles.mountainStatValue}>{stats.totalLifts}</Text>
            </View>
          </View>
        </View>

        {/* Skiinfo Powder Alarm Ribbon */}
        {isPowderAlarm && (
          <View style={styles.powderAlarmRibbon}>
            <Sparkles size={16} color="#ffffff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.powderAlarmTitle}>POWDER ALARM ❄️ ¡Alerta de Nieve en Polvo!</Text>
              <Text style={styles.powderAlarmSubtitle}>
                {t(
                  'powder_alarm_text',
                  'Se esperan importantes nevadas en la estación. Condiciones óptimas para esquiar.'
                )}
              </Text>
            </View>
          </View>
        )}

        {/* Skiinfo Segmented Tab Navigation */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'snow' && styles.tabBtnActive]}
            onPress={() => setActiveTab('snow')}>
            <Snowflake size={14} color={activeTab === 'snow' ? '#ffffff' : colors.primary} />
            <Text style={[styles.tabBtnText, activeTab === 'snow' && styles.tabBtnTextActive]}>
              {t('tab_snow_report', 'Parte Nieve')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'pistes' && styles.tabBtnActive]}
            onPress={() => setActiveTab('pistes')}>
            <Layers size={14} color={activeTab === 'pistes' ? '#ffffff' : colors.textSecondary} />
            <Text style={[styles.tabBtnText, activeTab === 'pistes' && styles.tabBtnTextActive]}>
              {t('tab_slopes_lifts', 'Pistas & Remontes')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'weather' && styles.tabBtnActive]}
            onPress={() => setActiveTab('weather')}>
            <Cloud size={14} color={activeTab === 'weather' ? '#ffffff' : colors.textSecondary} />
            <Text style={[styles.tabBtnText, activeTab === 'weather' && styles.tabBtnTextActive]}>
              {t('tab_weather', 'El Tiempo')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'community' && styles.tabBtnActive]}
            onPress={() => setActiveTab('community')}>
            <Activity size={14} color={activeTab === 'community' ? '#ffffff' : colors.textSecondary} />
            <Text style={[styles.tabBtnText, activeTab === 'community' && styles.tabBtnTextActive]}>
              {t('tab_community', 'Sesiones')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Tab Content */}
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefreshWeather ? (
            <RefreshControl
              refreshing={Boolean(isRefreshingWeather)}
              onRefresh={onRefreshWeather}
              tintColor={colors.primary}
            />
          ) : undefined
        }>
        {/* ========================================================================= */}
        {/* TAB 1: PARTE DE NIEVE (SNOW REPORT - SKIINFO EXPERIENCE) */}
        {/* ========================================================================= */}
        {activeTab === 'snow' && (
          <View style={styles.tabSection}>
            {/* Today's Snowfall by Elevation Hero Card (Cota Baja / Intermedia / Máxima) */}
            <View style={styles.snowDepthCard}>
              <View style={styles.snowDepthHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Snowflake size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>{t('snowfall_today_title', 'Nevada Prevista Hoy')}</Text>
                </View>
                <View style={styles.qualityBadge}>
                  <Text style={styles.qualityBadgeText}>{snowConditionLabel}</Text>
                </View>
              </View>

              <View style={styles.depthColumnsRow}>
                {/* 1. Cota Baja / Base */}
                <View style={styles.depthCol}>
                  <View style={styles.depthMeterTrack}>
                    <View
                      style={[
                        styles.depthMeterFill,
                        {
                          height: `${Math.min(
                            100,
                            Math.max(
                              todaySnowBase > 0 ? 15 : 6,
                              Math.round((todaySnowBase / Math.max(todaySnowSummit, todaySnowBase, 1)) * 90)
                            )
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.depthColAmount}>
                    {todaySnowBase > 0 ? `+${todaySnowBase}` : '0'}{' '}
                    <Text style={styles.depthUnit}>cm</Text>
                  </Text>
                  <Text style={styles.depthColTitle}>Cota Baja</Text>
                  <Text style={styles.depthColAlt}>{stats.minElev ? `${stats.minElev} m` : 'Base'}</Text>
                </View>

                {/* 2. Cota Intermedia */}
                <View style={styles.depthCol}>
                  <View style={[styles.depthMeterTrack, styles.depthMeterTrackMid]}>
                    <View
                      style={[
                        styles.depthMeterFill,
                        styles.depthMeterFillMid,
                        {
                          height: `${Math.min(
                            100,
                            Math.max(
                              todaySnowMid > 0 ? 15 : 6,
                              Math.round((todaySnowMid / Math.max(todaySnowSummit, todaySnowBase, 1)) * 90)
                            )
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.depthColAmount, { color: '#0ea5e9' }]}>
                    {todaySnowMid > 0 ? `+${todaySnowMid}` : '0'}{' '}
                    <Text style={styles.depthUnit}>cm</Text>
                  </Text>
                  <Text style={styles.depthColTitle}>Cota Intermedia</Text>
                  <Text style={styles.depthColAlt}>{stats.midElev ? `${stats.midElev} m` : 'Media'}</Text>
                </View>

                {/* 3. Cota Máxima / Cumbre */}
                <View style={styles.depthCol}>
                  <View style={[styles.depthMeterTrack, styles.depthMeterTrackSummit]}>
                    <View
                      style={[
                        styles.depthMeterFill,
                        styles.depthMeterFillSummit,
                        {
                          height: `${Math.min(
                            100,
                            Math.max(
                              todaySnowSummit > 0 ? 15 : 6,
                              Math.round((todaySnowSummit / Math.max(todaySnowSummit, todaySnowBase, 1)) * 90)
                            )
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.depthColAmount, { color: '#0284c7' }]}>
                    {todaySnowSummit > 0 ? `+${todaySnowSummit}` : '0'}{' '}
                    <Text style={styles.depthUnit}>cm</Text>
                  </Text>
                  <Text style={styles.depthColTitle}>Cota Máxima</Text>
                  <Text style={styles.depthColAlt}>{stats.maxElev ? `${stats.maxElev} m` : 'Cumbre'}</Text>
                </View>
              </View>
            </View>

            {/* Fresh Snowfall & History Row (Skiinfo metrics) */}
            <View style={styles.snowHistoryGrid}>
              <View style={styles.historyCard}>
                <Text style={styles.historyCardLabel}>{t('fresh_snow_24h', 'Últimas 24h')}</Text>
                <Text style={styles.historyCardValue}>
                  {snowReport?.fresh_snow_24h_cm && snowReport.fresh_snow_24h_cm > 0
                    ? `${snowReport.fresh_snow_24h_cm} cm`
                    : '0 cm'}
                </Text>
                <Text style={styles.historyCardSub}>Nieve fresca caída</Text>
              </View>

              <View style={styles.historyCard}>
                <Text style={styles.historyCardLabel}>{t('fresh_snow_48h', 'Últimas 48h')}</Text>
                <Text style={styles.historyCardValue}>
                  {snowReport?.fresh_snow_48h_cm && snowReport.fresh_snow_48h_cm > 0
                    ? `${snowReport.fresh_snow_48h_cm} cm`
                    : '0 cm'}
                </Text>
                <Text style={styles.historyCardSub}>Acumulado 2 días</Text>
              </View>

              <View style={styles.historyCard}>
                <Text style={styles.historyCardLabel}>{t('last_snowfall', 'Última nevada')}</Text>
                <Text style={[styles.historyCardValue, { fontSize: 13 }]} numberOfLines={1}>
                  {lastSnowfallText || t('no_recent_snow', 'Sin registro')}
                </Text>
                <Text style={styles.historyCardSub}>Fecha y espesor</Text>
              </View>
            </View>

            {/* Freezing Level / Cota de Nieve Card */}
            {freezingLevelInfo && (
              <View style={styles.freezingLevelCard}>
                <View style={styles.freezingLevelLeft}>
                  <Thermometer size={18} color={freezingLevelInfo.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.freezingLevelTitle}>
                      {t('snow_line_title', 'Cota de nieve')}:{' '}
                      <Text style={{ fontWeight: '800', color: colors.textPrimary }}>
                        ~{freezingLevelInfo.altitude} m
                      </Text>
                      {freezingLevelInfo.isocero ? (
                        <Text style={{ fontSize: 11, fontWeight: 'normal', color: colors.textSecondary }}>
                          {' '}(Isocero: {freezingLevelInfo.isocero} m)
                        </Text>
                      ) : null}
                    </Text>
                    <Text style={styles.freezingLevelSubtitle}>{freezingLevelInfo.label}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* 7-Day Snowfall Forecast Timeline (Skiinfo Forecast chart) */}
            <View style={styles.forecastCard}>
              <View style={styles.forecastCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>{t('snow_forecast_7d_title', 'Previsión de Nevadas a 7 días')}</Text>
                  <Text style={styles.forecastSubtitle}>
                    {t('total_expected_7d', 'Acumulación estimada en cumbre:')}{' '}
                    <Text style={{ fontWeight: '800', color: '#0284c7' }}>
                      {snowReport?.forecast_snow_7d_cm ?? 0} cm
                    </Text>
                  </Text>
                </View>
                <View style={styles.hourlyScrollNav}>
                  <TouchableOpacity
                    style={styles.hourlyNavBtn}
                    onPress={() => scrollHorizontal(snowForecastScrollRef, -180)}
                    accessibilityLabel="Ver días anteriores">
                    <ChevronLeft size={16} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.hourlyNavBtn}
                    onPress={() => scrollHorizontal(snowForecastScrollRef, 180)}
                    accessibilityLabel="Ver siguientes días">
                    <ChevronRight size={16} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {weatherData?.daily && weatherData.daily.time?.length > 0 ? (
                <View
                  style={styles.hourlyScrollWrapper}
                  // @ts-ignore
                  onWheel={(e: any) => handleWheel(snowForecastScrollRef, e)}
                  // @ts-ignore
                  onMouseDown={(e: any) => handleMouseDown(snowForecastScrollRef, e)}
                  // @ts-ignore
                  onMouseMove={handleMouseMove}
                  // @ts-ignore
                  onMouseUp={handleMouseUpOrLeave}
                  // @ts-ignore
                  onMouseLeave={handleMouseUpOrLeave}>
                  <ScrollView
                    ref={snowForecastScrollRef}
                    horizontal
                    nestedScrollEnabled={true}
                    directionalLockEnabled={true}
                    showsHorizontalScrollIndicator={isWeb}
                    style={styles.hourlyScrollView}
                    contentContainerStyle={styles.dailyBarsScroll}>
                    {weatherData.daily.time.slice(0, 10).map((timeStr, idx) => {
                      const dateObj = new Date(timeStr);
                      const isToday = idx === 0;
                      const dayLabel = isToday
                        ? 'Hoy'
                        : dateObj.toLocaleDateString(i18n.language, { weekday: 'short' });
                      const dateLabel = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
                      const snowCm = weatherData.daily?.snowfall_sum?.[idx] ?? 0;
                      const maxT = weatherData.daily?.temperature_2m_max?.[idx] ?? 0;
                      const minT = weatherData.daily?.temperature_2m_min?.[idx] ?? 0;
                      const hasSnow = snowCm > 0;

                      return (
                        <View key={timeStr || idx} style={[styles.dailyBarCol, isToday && styles.dailyBarColToday]}>
                          <Text style={[styles.dailyBarSnow, hasSnow && styles.dailyBarSnowActive]}>
                            {hasSnow ? `${snowCm >= 1 ? Math.round(snowCm) : Math.round(snowCm * 10) / 10} cm` : '-'}
                          </Text>
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                {
                                  height: Math.min(50, Math.max(4, snowCm * 2.5)),
                                  backgroundColor: hasSnow ? '#0284c7' : colors.border,
                                },
                              ]}
                            />
                          </View>
                          <Text style={[styles.dailyBarDayName, isToday && { color: colors.primary, fontWeight: '800' }]}>
                            {dayLabel}
                          </Text>
                          <Text style={styles.dailyBarDateText}>{dateLabel}</Text>
                          <Text style={styles.dailyBarTemp}>
                            {Math.round(maxT)}°/{Math.round(minT)}°
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : (
                <View style={styles.emptyStateBox}>
                  <Sun size={24} color="#f59e0b" />
                  <Text style={styles.emptyStateText}>
                    {t('no_snow_forecast_7d', 'No se esperan precipitaciones en los próximos días.')}
                  </Text>
                </View>
              )}
            </View>

            {/* Avalanche Danger Bulletin (BPA) Section */}
            {snowReport?.avalanche_report && (
              <View style={styles.avalancheCard}>
                <View style={styles.avalancheHeader}>
                  <View style={styles.avalancheHeaderLeft}>
                    <View
                      style={[
                        styles.avalancheBadgeIcon,
                        { backgroundColor: snowReport.avalanche_report.danger_color || '#ea580c' },
                      ]}>
                      <ShieldAlert size={16} color="#ffffff" />
                    </View>
                    <View>
                      <Text style={styles.sectionTitle}>
                        {t('avalanche_bulletin', 'Peligro de Aludes (BPA)')}
                      </Text>
                      <Text style={styles.avalancheSub}>
                        {t('european_scale', 'Escala Europea de Peligro (1 a 5)')}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.dangerLevelTag,
                      { backgroundColor: snowReport.avalanche_report.danger_color || '#ea580c' },
                    ]}>
                    <Text style={styles.dangerLevelTagText}>
                      Nivel {snowReport.avalanche_report.danger_level} ·{' '}
                      {snowReport.avalanche_report.danger_level_title}
                    </Text>
                  </View>
                </View>

                {/* 5-step scale indicator */}
                <View style={styles.scaleBarRow}>
                  {SCALE_LEVELS.map((lvl) => {
                    const isActive = lvl.level === snowReport.avalanche_report?.danger_level;
                    return (
                      <View key={lvl.level} style={styles.scaleSegment}>
                        <View
                          style={[
                            styles.scaleFill,
                            {
                              backgroundColor: lvl.color,
                              opacity: isActive ? 1.0 : 0.25,
                              height: isActive ? 8 : 4,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.scaleNum,
                            isActive ? { color: lvl.color, fontWeight: '800' } : { color: colors.textSecondary },
                          ]}>
                          {lvl.level}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Risk Factors */}
                <View style={styles.avalancheFactorsRow}>
                  <View style={styles.avalancheFactorBox}>
                    <Text style={styles.factorLabel}>Cota crítica</Text>
                    <Text style={styles.factorVal}>
                      &gt; {Math.round(snowReport.avalanche_report.critical_elevation_m || 2000)} m
                    </Text>
                  </View>

                  <View style={styles.avalancheFactorBox}>
                    <Text style={styles.factorLabel}>Laderas críticas</Text>
                    <View style={styles.aspectsPillsWrap}>
                      {snowReport.avalanche_report.dangerous_aspects?.map((asp) => (
                        <View key={asp} style={styles.aspectPill}>
                          <Text style={styles.aspectPillText}>{asp}</Text>
                        </View>
                      )) || <Text style={styles.factorVal}>Todas</Text>}
                    </View>
                  </View>

                  <View style={styles.avalancheFactorBox}>
                    <Text style={styles.factorLabel}>Riesgo Viento</Text>
                    <Text style={styles.factorVal}>{snowReport.avalanche_report.wind_risk || 'Bajo'}</Text>
                  </View>
                </View>

                {snowReport.avalanche_report.summary && (
                  <View style={styles.avalancheSummaryBox}>
                    <AlertTriangle size={13} color="#ea580c" />
                    <Text style={styles.avalancheSummaryText}>{snowReport.avalanche_report.summary}</Text>
                  </View>
                )}
              </View>
            )}

            {resort.Website && (
              <View style={styles.officialWebsiteCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Globe size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.officialWebsiteTitle}>{t('official_website', 'Sitio Web Oficial')}</Text>
                    <Text style={styles.officialWebsiteUrl} numberOfLines={1}>
                      {resort.Website.replace(/^https?:\/\//, '')}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.officialWebsiteBtn}
                  onPress={() => Linking.openURL(resort.Website!)}>
                  <Text style={styles.officialWebsiteBtnText}>Visitar</Text>
                  <ExternalLink size={13} color="#ffffff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PISTAS Y REMONTES (SLOPES & LIFTS - SKIINFO EXPERIENCE) */}
        {/* ========================================================================= */}
        {activeTab === 'pistes' && (
          <View style={styles.tabSection}>
            {/* Domain Overview Cards */}
            <View style={styles.domainSummaryCard}>
              <View style={styles.domainSummaryCol}>
                <Text style={styles.domainSummaryNumber}>{stats.totalKm}</Text>
                <Text style={styles.domainSummaryLabel}>Km Esquiables</Text>
              </View>

              <View style={styles.domainSummaryDivider} />

              <View style={styles.domainSummaryCol}>
                <Text style={styles.domainSummaryNumber}>{stats.totalPistes}</Text>
                <Text style={styles.domainSummaryLabel}>Pistas Totales</Text>
              </View>

              <View style={styles.domainSummaryDivider} />

              <View style={styles.domainSummaryCol}>
                <Text style={styles.domainSummaryNumber}>{stats.totalLifts}</Text>
                <Text style={styles.domainSummaryLabel}>Remontes</Text>
              </View>
            </View>

            {/* Pistes Breakdown by Difficulty (Colored Cards) */}
            <View style={styles.pistesBreakdownCard}>
              <Text style={styles.sectionTitle}>{t('pistes_breakdown', 'Desglose de Pistas por Dificultad')}</Text>

              <View style={styles.diffGrid}>
                {/* Novice / Green */}
                <View style={styles.diffCard}>
                  <View style={[styles.diffColorDot, { backgroundColor: '#00a859' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.diffCount}>{stats.difficultyCounts.novice}</Text>
                    <Text style={styles.diffName}>{t('novice', 'Verdes (Muy fácil)')}</Text>
                  </View>
                </View>

                {/* Easy / Blue */}
                <View style={styles.diffCard}>
                  <View style={[styles.diffColorDot, { backgroundColor: '#0072bc' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.diffCount}>{stats.difficultyCounts.easy}</Text>
                    <Text style={styles.diffName}>{t('easy', 'Azules (Fácil)')}</Text>
                  </View>
                </View>

                {/* Intermediate / Red */}
                <View style={styles.diffCard}>
                  <View style={[styles.diffColorDot, { backgroundColor: '#f0141e' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.diffCount}>{stats.difficultyCounts.intermediate}</Text>
                    <Text style={styles.diffName}>{t('intermediate', 'Rojas (Intermedia)')}</Text>
                  </View>
                </View>

                {/* Advanced / Black */}
                <View style={styles.diffCard}>
                  <View style={[styles.diffColorDot, { backgroundColor: '#000000' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.diffCount}>{stats.difficultyCounts.advanced}</Text>
                    <Text style={styles.diffName}>{t('expert', 'Negras (Difícil)')}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Lifts by Type */}
            <View style={styles.liftsBreakdownCard}>
              <Text style={styles.sectionTitle}>{t('lifts_breakdown', 'Tipos de Remontes')}</Text>

              {Object.keys(stats.liftTypeCounts).length > 0 ? (
                <View style={styles.liftsGrid}>
                  {Object.entries(stats.liftTypeCounts).map(([type, count]) => (
                    <View key={type} style={styles.liftTypeCard}>
                      <Text style={{ fontSize: 16 }}>🚡</Text>
                      <View>
                        <Text style={styles.liftTypeName}>{parseLiftType(type)}</Text>
                        <Text style={styles.liftTypeCount}>{count} instalaciones</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.liftsGrid}>
                  <View style={styles.liftTypeCard}>
                    <Text style={{ fontSize: 16 }}>🚡</Text>
                    <View>
                      <Text style={styles.liftTypeName}>Remontes mecánicos</Text>
                      <Text style={styles.liftTypeCount}>{stats.totalLifts} en servicio</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Mountain Profile Altitude Card */}
            <View style={styles.altitudeCard}>
              <Text style={styles.sectionTitle}>{t('mountain_elevations', 'Perfil Altimétrico')}</Text>
              <View style={styles.altitudesRow}>
                <View style={styles.altitudeItem}>
                  <ArrowUp size={16} color="#0284c7" />
                  <View>
                    <Text style={styles.altitudeLabel}>Cota Máxima (Cumbre)</Text>
                    <Text style={styles.altitudeValue}>{stats.maxElev ? `${stats.maxElev} m` : '--'}</Text>
                  </View>
                </View>
                <View style={styles.altitudeItem}>
                  <ArrowDown size={16} color={colors.textSecondary} />
                  <View>
                    <Text style={styles.altitudeLabel}>Cota Mínima (Base)</Text>
                    <Text style={styles.altitudeValue}>{stats.minElev ? `${stats.minElev} m` : '--'}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* ========================================================================= */}
        {/* TAB 3: METEOROLOGÍA (WEATHER & FORECAST - SKIINFO EXPERIENCE) */}
        {/* ========================================================================= */}
        {activeTab === 'weather' && current && (
          <View style={styles.tabSection}>
            {/* Current Conditions Main Box */}
            <View style={styles.weatherCurrentCard}>
              <View style={styles.weatherCurrentTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.weatherTempText}>
                    {Math.round(current.temperature_2m)}°C
                  </Text>
                  <Text style={styles.weatherConditionDesc}>
                    {getWeatherCodeLabel(current.weather_code)}
                  </Text>
                  <Text style={styles.weatherFeelsLike}>
                    Sensación térmica: {Math.round(current.apparent_temperature)}°C
                  </Text>
                </View>
                <View style={styles.weatherIconCircle}>
                  {renderWeatherIcon(current.weather_code, 34)}
                </View>
              </View>

              {/* Freezing Level Info Bar */}
              {freezingLevelInfo && (
                <View style={styles.weatherFreezingRow}>
                  <Thermometer size={14} color={freezingLevelInfo.color} />
                  <Text style={styles.weatherFreezingText}>
                    Cota de nieve / Isocero:{' '}
                    <Text style={{ fontWeight: '800', color: colors.textPrimary }}>
                      {freezingLevelInfo.altitude} m
                    </Text>{' '}
                    <Text style={{ color: freezingLevelInfo.color, fontWeight: '700' }}>
                      ({freezingLevelInfo.label})
                    </Text>
                  </Text>
                </View>
              )}

              {/* Quick Snow Summary Ribbon */}
              {snowReport && (
                <View style={styles.weatherSnowSummaryRibbon}>
                  <View style={styles.weatherSnowRibbonItem}>
                    <Text style={styles.weatherSnowRibbonVal}>{snowReport.fresh_snow_24h_cm ?? 0} cm</Text>
                    <Text style={styles.weatherSnowRibbonLbl}>Nieve 24h</Text>
                  </View>
                  <View style={styles.weatherSnowRibbonDivider} />
                  <View style={styles.weatherSnowRibbonItem}>
                    <Text style={[styles.weatherSnowRibbonVal, { color: '#0284c7' }]}>
                      {snowReport.forecast_snow_7d_cm ?? 0} cm
                    </Text>
                    <Text style={styles.weatherSnowRibbonLbl}>Próx. 7 días</Text>
                  </View>
                  <View style={styles.weatherSnowRibbonDivider} />
                  <View style={styles.weatherSnowRibbonItem}>
                    <Text style={styles.weatherSnowRibbonVal}>
                      {baseDepth !== undefined ? baseDepth : '--'} / {midDepth !== undefined ? midDepth : '--'} /{' '}
                      {summitDepth !== undefined ? summitDepth : '--'} cm
                    </Text>
                    <Text style={styles.weatherSnowRibbonLbl}>Espesor (Baja/Med/Alta)</Text>
                  </View>
                </View>
              )}

              {/* Weather Metrics 6-pack Grid */}
              <View style={styles.weatherMetricsGrid}>
                <View style={styles.weatherMetricItem}>
                  <Wind size={15} color="#0284c7" />
                  <View>
                    <Text style={styles.weatherMetricLabel}>Viento medio</Text>
                    <Text style={styles.weatherMetricValue}>
                      {Math.round(current.wind_speed_10m)} km/h
                    </Text>
                  </View>
                </View>

                <View style={styles.weatherMetricItem}>
                  <Flame size={15} color="#ea580c" />
                  <View>
                    <Text style={styles.weatherMetricLabel}>Rachas máx.</Text>
                    <Text style={styles.weatherMetricValue}>
                      {Math.round(current.wind_gusts_10m)} km/h
                    </Text>
                  </View>
                </View>

                <View style={styles.weatherMetricItem}>
                  <Compass size={15} color="#8b5cf6" />
                  <View>
                    <Text style={styles.weatherMetricLabel}>Dirección</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <WindDirectionArrow degrees={current.wind_direction_10m} size={11} />
                      <Text style={styles.weatherMetricValue}>{windDirInfo.cardinal} ({windDirInfo.name})</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.weatherMetricItem}>
                  <Droplets size={15} color={colors.primary} />
                  <View>
                    <Text style={styles.weatherMetricLabel}>Humedad</Text>
                    <Text style={styles.weatherMetricValue}>{current.relative_humidity_2m}%</Text>
                  </View>
                </View>

                <View style={styles.weatherMetricItem}>
                  <Eye size={15} color="#10b981" />
                  <View>
                    <Text style={styles.weatherMetricLabel}>Visibilidad</Text>
                    <Text style={styles.weatherMetricValue}>
                      {current.visibility ? `${(current.visibility / 1000).toFixed(1)} km` : 'Buena'}
                    </Text>
                  </View>
                </View>

                <View style={styles.weatherMetricItem}>
                  <Gauge size={15} color="#6366f1" />
                  <View>
                    <Text style={styles.weatherMetricLabel}>Presión</Text>
                    <Text style={styles.weatherMetricValue}>{Math.round(current.surface_pressure)} hPa</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Upcoming Hours Scroll */}
            {weatherData?.hourly && weatherData.hourly.time?.length > 0 && (
              <View style={styles.hourlyCard}>
                <View style={styles.hourlyHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Clock size={16} color={colors.primary} />
                    <Text style={styles.sectionTitle}>{t('upcoming_hours', 'Previsión por Horas')}</Text>
                  </View>
                  <View style={styles.hourlyScrollNav}>
                    <TouchableOpacity
                      style={styles.hourlyNavBtn}
                      onPress={() => scrollHorizontal(hourlyScrollRef, -240)}
                      accessibilityLabel="Ver horas anteriores">
                      <ChevronLeft size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.hourlyNavBtn}
                      onPress={() => scrollHorizontal(hourlyScrollRef, 240)}
                      accessibilityLabel="Ver siguientes horas">
                      <ChevronRight size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View
                  style={styles.hourlyScrollWrapper}
                  // @ts-ignore
                  onWheel={(e: any) => handleWheel(hourlyScrollRef, e)}
                  // @ts-ignore
                  onMouseDown={(e: any) => handleMouseDown(hourlyScrollRef, e)}
                  // @ts-ignore
                  onMouseMove={handleMouseMove}
                  // @ts-ignore
                  onMouseUp={handleMouseUpOrLeave}
                  // @ts-ignore
                  onMouseLeave={handleMouseUpOrLeave}>
                  <ScrollView
                    ref={hourlyScrollRef}
                    horizontal
                    nestedScrollEnabled={true}
                    directionalLockEnabled={true}
                    showsHorizontalScrollIndicator={isWeb}
                    style={styles.hourlyScrollView}
                    contentContainerStyle={styles.hourlyScroll}>
                    {weatherData.hourly.time.slice(0, 24).map((tStr, hIdx) => {
                      const hDate = new Date(tStr);
                      const hourStr = `${String(hDate.getHours()).padStart(2, '0')}:00`;
                      const hTemp = Math.round(weatherData.hourly.temperature_2m?.[hIdx] ?? 0);
                      const hSnow = Math.round((weatherData.hourly.snowfall?.[hIdx] ?? 0) * 10) / 10;
                      const hPrecip = Math.round((weatherData.hourly.precipitation?.[hIdx] ?? 0) * 10) / 10;
                      const hProb = weatherData.hourly.precipitation_probability?.[hIdx] ?? 0;
                      const hWind = Math.round(weatherData.hourly.wind_speed_10m?.[hIdx] ?? 0);
                      const hWindDir = weatherData.hourly.wind_direction_10m?.[hIdx] ?? current.wind_direction_10m ?? 0;
                      const hWindInfo = getWindDirectionInfo(hWindDir);
                      const hVis = weatherData.hourly.visibility?.[hIdx];
                      const visInfo = getVisibilityInfo(hVis);
                      const hCode = weatherData.hourly.weather_code?.[hIdx] ?? (hSnow > 0 ? 71 : hProb > 40 ? 61 : 0);

                      return (
                        <View key={tStr || hIdx} style={styles.hourlyItem}>
                          <Text style={styles.hourlyTimeText}>{hourStr}</Text>

                          <View style={styles.hourlyIconBox}>
                            {renderWeatherIcon(hCode, 22)}
                          </View>

                          <Text style={styles.hourlyTemp}>{hTemp}°C</Text>

                          {/* Nevada / Precipitación */}
                          <View style={styles.hourlyPrecipContainer}>
                            {hSnow > 0 ? (
                              <View style={styles.hourlySnowPill}>
                                <Snowflake size={10} color="#0284c7" />
                                <Text style={styles.hourlySnowPillText}>+{hSnow} cm</Text>
                              </View>
                            ) : hPrecip > 0 || hProb > 20 ? (
                              <View style={styles.hourlyRainPill}>
                                <Umbrella size={10} color="#0284c7" />
                                <Text style={styles.hourlyRainPillText}>{hProb}%</Text>
                              </View>
                            ) : (
                              <Text style={styles.hourlyNoSnowText}>-</Text>
                            )}
                          </View>

                          {/* Viento y Dirección */}
                          <View style={styles.hourlyWindBox}>
                            <View style={styles.hourlyWindRow}>
                              <WindDirectionArrow degrees={hWindDir} size={11} color={colors.primary} />
                              <Text style={styles.hourlyWindText}>{hWind} km/h</Text>
                            </View>
                            <Text style={styles.hourlyWindDirText}>{hWindInfo.cardinal}</Text>
                          </View>

                          {/* Visibilidad combinada */}
                          <View style={[styles.hourlyVisBadge, { backgroundColor: visInfo.bgColor }]}>
                            <Text style={[styles.hourlyVisText, { color: visInfo.color }]}>
                              Vis. {visInfo.label}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* 7-Day Weather & Forecast (Skiinfo Experience) */}
            {weatherData?.daily && weatherData.daily.time?.length > 0 && (
              <View style={styles.sevenDayForecastCard}>
                <View style={styles.sevenDayHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Calendar size={16} color={colors.primary} />
                    <Text style={styles.sectionTitle}>
                      {t('seven_day_weather_forecast', 'Previsión del Tiempo a 7 Días')}
                    </Text>
                  </View>
                  <View style={styles.hourlyScrollNav}>
                    <TouchableOpacity
                      style={styles.hourlyNavBtn}
                      onPress={() => scrollHorizontal(sevenDayScrollRef, -240)}
                      accessibilityLabel="Ver días anteriores">
                      <ChevronLeft size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.hourlyNavBtn}
                      onPress={() => scrollHorizontal(sevenDayScrollRef, 240)}
                      accessibilityLabel="Ver siguientes días">
                      <ChevronRight size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View
                  style={styles.hourlyScrollWrapper}
                  // @ts-ignore
                  onWheel={(e: any) => handleWheel(sevenDayScrollRef, e)}
                  // @ts-ignore
                  onMouseDown={(e: any) => handleMouseDown(sevenDayScrollRef, e)}
                  // @ts-ignore
                  onMouseMove={handleMouseMove}
                  // @ts-ignore
                  onMouseUp={handleMouseUpOrLeave}
                  // @ts-ignore
                  onMouseLeave={handleMouseUpOrLeave}>
                  <ScrollView
                    ref={sevenDayScrollRef}
                    horizontal
                    nestedScrollEnabled={true}
                    directionalLockEnabled={true}
                    showsHorizontalScrollIndicator={isWeb}
                    style={styles.hourlyScrollView}
                    contentContainerStyle={styles.sevenDayScroll}>
                    {weatherData.daily.time.slice(0, 10).map((timeStr, idx) => {
                      const dateObj = new Date(timeStr);
                      const isToday = idx === 0;
                      const dayName = isToday
                        ? 'Hoy'
                        : dateObj.toLocaleDateString(i18n.language, { weekday: 'short' });
                      const dateFormatted = dateObj.toLocaleDateString(i18n.language, {
                        day: 'numeric',
                        month: 'short',
                      });

                      const snowCm = weatherData.daily?.snowfall_sum?.[idx] ?? 0;
                      const hasSnow = snowCm > 0;
                      const roundedSnow = snowCm >= 1 ? Math.round(snowCm) : Math.round(snowCm * 10) / 10;
                      const maxT = Math.round(weatherData.daily?.temperature_2m_max?.[idx] ?? 0);
                      const minT = Math.round(weatherData.daily?.temperature_2m_min?.[idx] ?? 0);
                      const wCode = weatherData.daily?.weather_code?.[idx] ?? (hasSnow ? 71 : 0);
                      const precipProb = weatherData.daily?.precipitation_probability_max?.[idx] ?? 0;

                      return (
                        <View key={timeStr || idx} style={[styles.sevenDayCardItem, isToday && styles.sevenDayCardItemToday]}>
                          <Text style={[styles.sevenDayCardDay, isToday && { color: colors.primary, fontWeight: '800' }]}>
                            {dayName}
                          </Text>
                          <Text style={styles.sevenDayCardDate}>{dateFormatted}</Text>

                          <View style={styles.sevenDayCardIconBox}>
                            {renderWeatherIcon(wCode, 24)}
                          </View>
                          <Text style={styles.sevenDayCardCondition} numberOfLines={1}>
                            {getWeatherCodeLabel(wCode)}
                          </Text>

                          <View style={styles.sevenDayCardTempRow}>
                            <Text style={styles.sevenDayCardMaxTemp}>{maxT}°</Text>
                            <Text style={styles.sevenDayCardTempSlash}>/</Text>
                            <Text style={styles.sevenDayCardMinTemp}>{minT}°</Text>
                          </View>

                          <View style={styles.sevenDayCardPrecipContainer}>
                            {hasSnow ? (
                              <View style={styles.sevenDaySnowBadge}>
                                <Snowflake size={11} color="#0284c7" />
                                <Text style={styles.sevenDaySnowBadgeText}>+{roundedSnow} cm</Text>
                              </View>
                            ) : precipProb > 20 ? (
                              <View style={styles.sevenDayRainPill}>
                                <Umbrella size={10} color="#0284c7" />
                                <Text style={styles.sevenDayRainPillText}>{precipProb}%</Text>
                              </View>
                            ) : (
                              <Text style={styles.sevenDayNoSnowText}>0 cm</Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SESIONES Y COMUNIDAD */}
        {/* ========================================================================= */}
        {activeTab === 'community' && (
          <View style={styles.tabSection}>
            <View style={styles.sessionsHeaderRow}>
              <Text style={styles.sectionTitle}>
                {t('community_sessions', 'Sesiones grabadas')} ({sessions.length})
              </Text>
              {isLoadingSessions && <ActivityIndicator size="small" color={colors.primary} />}
            </View>

            {sessions.length > 0 ? (
              <View style={{ gap: 8 }}>
                {sessions.map((sess) => {
                  const sDate = new Date(sess.start_time);
                  const dateText = sDate.toLocaleDateString(i18n.language, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  });
                  const actConf = ACTIVITY_CONFIGS[sess.activity_type as ActivityType] || ACTIVITY_CONFIGS.ski;

                  return (
                    <View key={sess.id} style={styles.sessionCard}>
                      <View style={styles.sessionCardLeft}>
                        <Text style={styles.sessionDateText}>{dateText}</Text>
                        <Text style={styles.sessionUserName}>
                          {sess.user?.display_name || sess.user?.first_name || 'Esquiador'}
                        </Text>
                        <View style={styles.sessionStatsInline}>
                          <Text style={styles.sessionStat}>{(sess.total_distance / 1000).toFixed(1)} km</Text>
                          <Text style={styles.sessionStat}>{(sess.max_speed * 3.6).toFixed(0)} km/h máx</Text>
                          <Text style={styles.sessionStat}>
                            {actConf.icon} {t(actConf.labelKey, actConf.defaultLabel)}
                          </Text>
                        </View>
                      </View>
                      <ChevronRight size={18} color={colors.textLight} />
                    </View>
                  );
                })}
              </View>
            ) : !isLoadingSessions ? (
              <View style={styles.emptySessionsCard}>
                <Activity size={32} color={colors.textLight} />
                <Text style={styles.emptySessionsTitle}>Aún no hay sesiones grabadas aquí</Text>
                <Text style={styles.emptySessionsSubtitle}>
                  ¡Sé el primero en iniciar un trackeo de esquí en {resort.Name}!
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Footer Bottom Action Buttons */}
      <View style={styles.footerBar}>
        {onOpenMap && (
          <TouchableOpacity style={styles.footerBtn} onPress={onOpenMap}>
            <MapIcon size={16} color={colors.primary} />
            <Text style={styles.footerBtnText}>{t('view_on_map', 'Ver en Mapa')}</Text>
          </TouchableOpacity>
        )}

        {onStartTracking && (
          <TouchableOpacity style={[styles.footerBtn, styles.footerBtnPrimary]} onPress={onStartTracking}>
            <Navigation size={16} color="#ffffff" />
            <Text style={styles.footerBtnPrimaryText}>{t('start_skiing', 'Iniciar Esquí')}</Text>
          </TouchableOpacity>
        )}

        {onDownloadOffline && !isWeb && (
          <TouchableOpacity style={styles.footerBtnIconOnly} onPress={onDownloadOffline} accessibilityLabel="Descargar mapa">
            <Download size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const getStyles = (colors: typeof LIGHT_COLORS) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
      gap: 8,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    headerTitleCol: {
      flex: 1,
    },
    locationPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    locationText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    resortTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginTop: 1,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headerIconBtn: {
      width: 34,
      height: 34,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mountainStatsBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    mountainStatItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border,
    },
    mountainStatLabel: {
      fontSize: 9,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    mountainStatValue: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    powderAlarmRibbon: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#4338ca',
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    powderAlarmTitle: {
      fontSize: 11,
      fontWeight: 'bold',
      color: '#ffffff',
    },
    powderAlarmSubtitle: {
      fontSize: 9.5,
      color: '#e0e7ff',
    },
    tabsRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 2,
    },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    tabBtnText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabBtnTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    scrollContent: {
      flex: 1,
    },
    scrollInner: {
      padding: SPACING.md,
      paddingBottom: SPACING.xl * 2,
      gap: SPACING.md,
    },
    tabSection: {
      gap: 12,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    snowDepthCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 12,
      ...SHADOWS.sm,
    },
    snowDepthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    qualityBadge: {
      backgroundColor: '#e0f2fe',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.round,
      borderWidth: 1,
      borderColor: '#bae6fd',
    },
    qualityBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: '#0284c7',
    },
    depthColumnsRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingVertical: 6,
      gap: 8,
    },
    depthCol: {
      alignItems: 'center',
      flex: 1,
      gap: 2,
    },
    depthMeterTrack: {
      width: 22,
      height: 70,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      justifyContent: 'flex-end',
      overflow: 'hidden',
      marginBottom: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    depthMeterTrackMid: {
      borderColor: '#7dd3fc',
    },
    depthMeterTrackSummit: {
      borderColor: '#bae6fd',
    },
    depthMeterFill: {
      width: '100%',
      backgroundColor: '#38bdf8',
      borderRadius: 2,
    },
    depthMeterFillMid: {
      backgroundColor: '#0ea5e9',
    },
    depthMeterFillSummit: {
      backgroundColor: '#0284c7',
    },
    depthColAmount: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    depthUnit: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    depthColTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    depthColAlt: {
      fontSize: 9.5,
      color: colors.textSecondary,
    },
    depthCenterDivider: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      marginBottom: 16,
    },
    depthCenterDrop: {
      fontSize: 10,
      fontWeight: '600',
      color: '#0284c7',
    },
    snowHistoryGrid: {
      flexDirection: 'row',
      gap: 8,
    },
    historyCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.sm,
      padding: 10,
      gap: 2,
    },
    historyCardLabel: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    historyCardValue: {
      fontSize: 14,
      fontWeight: '800',
      color: '#0284c7',
    },
    historyCardSub: {
      fontSize: 8.5,
      color: colors.textLight,
    },
    freezingLevelCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.sm,
      padding: 10,
    },
    freezingLevelLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    freezingLevelTitle: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    freezingLevelSubtitle: {
      fontSize: 10.5,
      color: colors.textPrimary,
      fontWeight: '500',
      marginTop: 1,
    },
    forecastCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 10,
    },
    forecastCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    forecastSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 1,
    },
    dailyBarsScroll: {
      gap: 10,
      paddingVertical: 4,
      alignItems: 'flex-end',
      minHeight: 110,
    },
    dailyBarsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      minHeight: 110,
      paddingTop: 8,
    },
    dailyBarCol: {
      width: 58,
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 3,
      paddingVertical: 4,
    },
    dailyBarColToday: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    dailyBarSnow: {
      fontSize: 9,
      color: colors.textLight,
      fontWeight: '600',
    },
    dailyBarSnowActive: {
      color: '#0284c7',
      fontWeight: '800',
    },
    barTrack: {
      height: 52,
      width: 14,
      backgroundColor: colors.surface,
      borderRadius: 3,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    barFill: {
      width: '100%',
      borderRadius: 2,
    },
    dailyBarDayName: {
      fontSize: 9.5,
      fontWeight: '600',
      color: colors.textPrimary,
      textTransform: 'capitalize',
    },
    dailyBarDateText: {
      fontSize: 8,
      color: colors.textLight,
    },
    dailyBarTemp: {
      fontSize: 8,
      color: colors.textSecondary,
      marginTop: 1,
    },
    emptyStateBox: {
      alignItems: 'center',
      paddingVertical: 16,
      gap: 6,
    },
    emptyStateText: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    avalancheCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 10,
    },
    avalancheHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    avalancheHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    avalancheBadgeIcon: {
      width: 30,
      height: 30,
      borderRadius: BORDER_RADIUS.round,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avalancheSub: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    dangerLevelTag: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.round,
    },
    dangerLevelTagText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#ffffff',
    },
    scaleBarRow: {
      flexDirection: 'row',
      gap: 4,
    },
    scaleSegment: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
    },
    scaleFill: {
      width: '100%',
      borderRadius: 2,
    },
    scaleNum: {
      fontSize: 9,
    },
    avalancheFactorsRow: {
      flexDirection: 'row',
      gap: 6,
    },
    avalancheFactorBox: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: 6,
      borderRadius: BORDER_RADIUS.sm,
      gap: 2,
    },
    factorLabel: {
      fontSize: 8.5,
      color: colors.textSecondary,
    },
    factorVal: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    aspectsPillsWrap: {
      flexDirection: 'row',
      gap: 2,
      flexWrap: 'wrap',
    },
    aspectPill: {
      backgroundColor: colors.card,
      paddingHorizontal: 3,
      paddingVertical: 1,
      borderRadius: 2,
    },
    aspectPillText: {
      fontSize: 8,
      fontWeight: 'bold',
      color: '#ea580c',
    },
    avalancheSummaryBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      backgroundColor: '#fffbeb',
      padding: 8,
      borderRadius: BORDER_RADIUS.sm,
      borderLeftWidth: 3,
      borderLeftColor: '#ea580c',
    },
    avalancheSummaryText: {
      fontSize: 10.5,
      color: '#9a3412',
      flex: 1,
      lineHeight: 14,
    },
    domainSummaryCard: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 12,
    },
    domainSummaryCol: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    domainSummaryNumber: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.primary,
    },
    domainSummaryLabel: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    domainSummaryDivider: {
      width: 1,
      backgroundColor: colors.border,
      marginVertical: 4,
    },
    pistesBreakdownCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 10,
    },
    diffGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    diffCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      padding: 8,
      width: '48%',
      gap: 8,
    },
    diffColorDot: {
      width: 12,
      height: 12,
      borderRadius: BORDER_RADIUS.round,
    },
    diffCount: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    diffName: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    liftsBreakdownCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 10,
    },
    liftsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    liftTypeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      padding: 8,
      width: '48%',
      gap: 8,
    },
    liftTypeName: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    liftTypeCount: {
      fontSize: 9.5,
      color: colors.textSecondary,
    },
    altitudeCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 8,
    },
    altitudesRow: {
      flexDirection: 'row',
      gap: 12,
    },
    altitudeItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      padding: 8,
      borderRadius: BORDER_RADIUS.sm,
    },
    altitudeLabel: {
      fontSize: 9.5,
      color: colors.textSecondary,
    },
    altitudeValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    weatherCurrentCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 12,
    },
    weatherCurrentTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    weatherTempText: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    weatherFeelsLike: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    weatherConditionDesc: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
      marginTop: 2,
      marginBottom: 2,
    },
    weatherFreezingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.sm,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    weatherFreezingText: {
      fontSize: 11,
      color: colors.textSecondary,
      flex: 1,
    },
    weatherSnowSummaryRibbon: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      paddingVertical: 8,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    weatherSnowRibbonItem: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    weatherSnowRibbonVal: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    weatherSnowRibbonLbl: {
      fontSize: 9,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    weatherSnowRibbonDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border,
    },
    weatherIconCircle: {
      width: 52,
      height: 52,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weatherMetricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    weatherMetricItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      padding: 8,
      borderRadius: BORDER_RADIUS.sm,
      width: '48%',
      gap: 6,
    },
    weatherMetricLabel: {
      fontSize: 9,
      color: colors.textSecondary,
    },
    weatherMetricValue: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    hourlyCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 10,
    },
    hourlyHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    hourlyScrollNav: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    hourlyNavBtn: {
      width: 28,
      height: 28,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hourlyScrollWrapper: {
      width: '100%',
    },
    hourlyScrollView: {
      marginHorizontal: -12,
      paddingHorizontal: 12,
      ...(Platform.OS === 'web'
        ? ({
            overflowX: 'auto',
            overflowY: 'hidden',
            cursor: 'grab',
          } as any)
        : {}),
    },
    hourlyScroll: {
      gap: 8,
      paddingVertical: 4,
    },
    hourlyItem: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: BORDER_RADIUS.md,
      width: 96,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    hourlyIconBox: {
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hourlyTimeText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '700',
    },
    hourlyTemp: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    hourlyPrecipContainer: {
      minHeight: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hourlySnowPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: '#e0f2fe',
      paddingHorizontal: 5,
      paddingVertical: 1.5,
      borderRadius: BORDER_RADIUS.sm,
    },
    hourlySnowPillText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#0284c7',
    },
    hourlyRainPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.card,
      paddingHorizontal: 4,
      paddingVertical: 1.5,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    hourlyRainPillText: {
      fontSize: 9,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    hourlyNoSnowText: {
      fontSize: 10,
      color: colors.textLight,
      fontWeight: '500',
    },
    hourlyWindBox: {
      alignItems: 'center',
      gap: 1,
    },
    hourlyWindRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    hourlyWindText: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    hourlyWindDirText: {
      fontSize: 8.5,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    hourlyVisBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center',
      width: '100%',
    },
    hourlyVisText: {
      fontSize: 8.5,
      fontWeight: '700',
      textAlign: 'center',
    },
    sevenDayForecastCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 10,
    },
    sevenDayHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sevenDayScroll: {
      gap: 8,
      paddingVertical: 4,
    },
    sevenDayCardItem: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: BORDER_RADIUS.md,
      width: 104,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 5,
    },
    sevenDayCardItemToday: {
      borderColor: colors.primary,
      borderWidth: 1.5,
      backgroundColor: colors.card,
    },
    sevenDayCardDay: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
      textTransform: 'capitalize',
    },
    sevenDayCardDate: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    sevenDayCardIconBox: {
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sevenDayCardCondition: {
      fontSize: 9.5,
      color: colors.textPrimary,
      textAlign: 'center',
      minHeight: 14,
    },
    sevenDayCardTempRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    sevenDayCardMaxTemp: {
      fontSize: 12.5,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    sevenDayCardTempSlash: {
      fontSize: 10,
      color: colors.textLight,
    },
    sevenDayCardMinTemp: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    sevenDayCardPrecipContainer: {
      minHeight: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sevenDayRainPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.card,
      paddingHorizontal: 5,
      paddingVertical: 1.5,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sevenDayRainPillText: {
      fontSize: 9,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    sevenDaySnowBadgeCol: {
      width: 68,
      alignItems: 'center',
    },
    sevenDaySnowBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: '#e0f2fe',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
    },
    sevenDaySnowBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#0284c7',
    },
    sevenDayNoSnowText: {
      fontSize: 10,
      color: colors.textLight,
      fontWeight: '500',
    },
    sessionsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sessionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.sm,
      padding: 10,
    },
    sessionCardLeft: {
      gap: 2,
    },
    sessionDateText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
      textTransform: 'capitalize',
    },
    sessionUserName: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    sessionStatsInline: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 2,
    },
    sessionStat: {
      fontSize: 9.5,
      color: colors.primary,
      fontWeight: '600',
    },
    emptySessionsCard: {
      alignItems: 'center',
      padding: 24,
      gap: 6,
    },
    emptySessionsTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    emptySessionsSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    officialWebsiteCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 8,
    },
    officialWebsiteTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    officialWebsiteUrl: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    officialWebsiteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.sm,
      gap: 4,
    },
    officialWebsiteBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#ffffff',
    },
    footerBar: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    footerBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      borderRadius: BORDER_RADIUS.sm,
      gap: 6,
    },
    footerBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    footerBtnPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    footerBtnPrimaryText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#ffffff',
    },
    footerBtnIconOnly: {
      width: 42,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.sm,
    },
  });
