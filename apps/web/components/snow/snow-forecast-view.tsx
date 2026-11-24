import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Map as MapIcon,
  RefreshCw,
  Search,
  Snowflake,
  Sparkles,
  Star,
  Thermometer,
  TrendingUp,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ResortLogo } from '../resorts/resort-logo';
import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from '../../constants/theme';
import { useFavorites } from '../../context/favorites.context';
import { ResortSnowForecast, SnowRegion, SnowTimeframe } from '../../models/snow-forecast.model';
import { SnowForecastService, getWindDirectionInfo } from '../../services/snow-forecast.service';

interface SnowForecastViewProps {
  onSelectResort?: (resort: {
    ID: string;
    Name: string;
    Country: string;
    Latitude: number;
    Longitude: number;
    Website?: string;
  }) => void;
  showHeader?: boolean;
}

const REGION_OPTIONS: { id: SnowRegion; labelKey: string; defaultLabel: string; flag?: string }[] = [
  { id: 'all', labelKey: 'region_all', defaultLabel: 'Todas', flag: '🇪🇸🇦🇩' },
  { id: 'andorra', labelKey: 'region_andorra', defaultLabel: 'Andorra', flag: '🇦🇩' },
  { id: 'pirineo_aragones', labelKey: 'region_pirineo_aragones', defaultLabel: 'Pirineo Aragonés', flag: '🏔️' },
  { id: 'pirineo_catalan', labelKey: 'region_pirineo_catalan', defaultLabel: 'Pirineo Catalán', flag: '🏔️' },
  { id: 'cordillera_cantabrica', labelKey: 'region_cantabrica', defaultLabel: 'Cantábrica', flag: '⛰️' },
  { id: 'sistema_central', labelKey: 'region_central', defaultLabel: 'Sistema Central', flag: '🌲' },
  { id: 'sistema_penibetico', labelKey: 'region_penibetico', defaultLabel: 'Sierra Nevada', flag: '☀️' },
  { id: 'sistema_iberico', labelKey: 'region_iberico', defaultLabel: 'Sistema Ibérico', flag: '❄️' },
];

const TIMEFRAME_OPTIONS: { id: SnowTimeframe; labelKey: string; defaultLabel: string }[] = [
  { id: '24h', labelKey: 'timeframe_24h', defaultLabel: 'Próximas 24h' },
  { id: '72h', labelKey: 'timeframe_72h', defaultLabel: 'Próximos 3 días' },
  { id: '7d', labelKey: 'timeframe_7d', defaultLabel: 'Próximos 7 días' },
];

const formatDayAndMonth = (dateStr?: string, fallbackDayName?: string): string => {
  if (dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
  }
  if (fallbackDayName && fallbackDayName.includes('/')) {
    return fallbackDayName;
  }
  return fallbackDayName || '';
};

const WindDirectionArrow: React.FC<{
  degrees?: number;
  size?: number;
  color?: string;
}> = ({ degrees = 0, size = 11, color = '#0284c7' }) => {
  // Rotate arrow to indicate direction of wind vector (where it blows towards: degrees + 180)
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
      <ArrowUp size={size} color={color} strokeWidth={2.6} />
    </View>
  );
};

export const SnowForecastView: React.FC<SnowForecastViewProps> = ({
  onSelectResort,
  showHeader = true,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { isFavorite, toggleFavorite } = useFavorites();

  const [forecasts, setForecasts] = useState<ResortSnowForecast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState<SnowTimeframe>('72h');
  const [selectedRegion, setSelectedRegion] = useState<SnowRegion>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [onlySnowing, setOnlySnowing] = useState(false);
  const [expandedResortId, setExpandedResortId] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await SnowForecastService.getSnowForecasts(true);
      setForecasts(data);
    } catch (e) {
      console.error('Error refreshing snow forecasts:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    SnowForecastService.getSnowForecasts(false)
      .then((data) => {
        if (isMounted) setForecasts(data);
      })
      .catch((e) => {
        console.error('Error fetching snow forecasts:', e);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredForecasts = useMemo(() => {
    return SnowForecastService.filterAndSort(forecasts, {
      timeframe: selectedTimeframe,
      region: selectedRegion,
      searchTerm,
      onlySnowing,
      sortBy: 'snowfall',
    });
  }, [forecasts, selectedTimeframe, selectedRegion, searchTerm, onlySnowing]);

  // Overall Summary Metrics
  const summary = useMemo(() => {
    if (forecasts.length === 0) return null;

    let snowingCount = 0;
    let maxSnow = 0;
    let topResort: ResortSnowForecast | null = null;

    forecasts.forEach((r) => {
      const snow = SnowForecastService.getSnowfallByTimeframe(r, selectedTimeframe);
      if (snow > 0.5) snowingCount++;
      if (snow > maxSnow) {
        maxSnow = snow;
        topResort = r;
      }
    });

    return {
      snowingCount,
      totalCount: forecasts.length,
      maxSnow,
      topResortName: topResort ? (topResort as ResortSnowForecast).name : null,
    };
  }, [forecasts, selectedTimeframe]);

  const handleOpenResort = (resort: ResortSnowForecast) => {
    if (onSelectResort) {
      onSelectResort({
        ID: resort.id,
        Name: resort.name,
        Country: resort.country,
        Latitude: resort.latitude,
        Longitude: resort.longitude,
        Website: resort.website,
      });
    } else {
      router.navigate({
        pathname: '/map',
        params: { lat: resort.latitude, lon: resort.longitude, zoom: 12 },
      });
    }
  };

  const getSnowBadgeStyle = (snowCm: number) => {
    if (snowCm >= 25) {
      return {
        bg: '#4338ca',
        textColor: '#ffffff',
        tag: t('snow_epic_powder', '¡Polvorón!'),
        iconColor: '#a5b4fc',
      };
    }
    if (snowCm >= 10) {
      return {
        bg: '#0284c7',
        textColor: '#ffffff',
        tag: t('snow_heavy', 'Nevada intensa'),
        iconColor: '#bae6fd',
      };
    }
    if (snowCm > 0.5) {
      return {
        bg: '#0284c7',
        textColor: '#ffffff',
        tag: t('snow_light', 'Nevada suave'),
        iconColor: '#bae6fd',
      };
    }
    return {
      bg: colors.surface,
      textColor: colors.textSecondary,
      tag: t('snow_none', 'Sin nieve prevista'),
      iconColor: colors.textLight,
    };
  };

  const renderResortCard = ({ item, index }: { item: ResortSnowForecast; index: number }) => {
    const snowAmount = SnowForecastService.getSnowfallByTimeframe(item, selectedTimeframe);
    const badgeStyle = getSnowBadgeStyle(snowAmount);
    const isExpanded = expandedResortId === item.id;
    const isFav = isFavorite(item.id);
    const snowCotas = SnowForecastService.getTripleElevationSnowfall(item, selectedTimeframe);
    const midElev = item.mid_elevation_m || Math.round((item.summit_elevation_m + item.base_elevation_m) / 2);
    const windDeg = item.wind_direction_deg ?? 315;
    const windInfo = getWindDirectionInfo(windDeg);

    return (
      <View style={[styles.card, isExpanded && styles.cardExpanded]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setExpandedResortId(isExpanded ? null : item.id)}
          style={styles.cardCompactRow}>
          {/* Ranking */}
          <Text style={styles.rankNumber}>#{index + 1}</Text>

          {/* Logo */}
          <ResortLogo website={item.website} size={30} />

          {/* Resort Info */}
          <View style={styles.resortInfoCol}>
            <Text style={styles.resortTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.resortSubtext} numberOfLines={1}>
              {item.country_code === 'AD' ? '🇦🇩' : '🇪🇸'} {item.region_label} • {item.base_elevation_m}-{item.summit_elevation_m}m
            </Text>
          </View>

          {/* Next Snow Pill */}
          {item.next_snowfall_label && snowAmount > 0 && (
            <View style={styles.nextSnowPill}>
              <Text style={styles.nextSnowPillText}>❄️ {item.next_snowfall_label}</Text>
            </View>
          )}

          {/* Compact Wind Pill */}
          {item.current_wind_speed_kmh !== undefined && (
            <View
              style={[
                styles.compactWindPill,
                (item.wind_level === 'extreme' || item.wind_level === 'strong') &&
                  styles.compactWindPillAlert,
              ]}>
              <WindDirectionArrow
                degrees={windDeg}
                size={10}
                color={
                  item.wind_level === 'extreme'
                    ? '#ef4444'
                    : item.wind_level === 'strong'
                    ? '#ea580c'
                    : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.compactWindText,
                  (item.wind_level === 'extreme' || item.wind_level === 'strong') && {
                    color: item.wind_level === 'extreme' ? '#ef4444' : '#ea580c',
                    fontWeight: '700',
                  },
                ]}>
                {windInfo.cardinal} {item.current_wind_speed_kmh}k
              </Text>
            </View>
          )}

          {/* Snow Badge */}
          <View style={[styles.compactSnowBadge, { backgroundColor: badgeStyle.bg }]}>
            <Text style={[styles.compactSnowText, { color: badgeStyle.textColor }]}>
              {snowAmount > 0 ? `${snowAmount} cm` : '0 cm'}
            </Text>
          </View>

          {/* Chevron */}
          <View style={styles.chevronWrapper}>
            {isExpanded ? (
              <ChevronUp size={16} color={colors.textSecondary} />
            ) : (
              <ChevronDown size={16} color={colors.textSecondary} />
            )}
          </View>
        </TouchableOpacity>

        {/* Expanded Details */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* Quick Metrics */}
            <View style={styles.expandedMetricsRow}>
              <View style={styles.expandedMetricItem}>
                <Thermometer size={13} color={colors.textSecondary} />
                <Text style={styles.expandedMetricText}>
                  {item.current_temp !== undefined ? `${item.current_temp}°C` : '--'}
                </Text>
              </View>

              {item.max_snowfall_day && (
                <View style={styles.expandedMetricItem}>
                  <TrendingUp size={13} color="#0284c7" />
                  <Text style={[styles.expandedMetricText, { color: '#0284c7', fontWeight: '600' }]}>
                    Pico: {item.max_snowfall_day.amount_cm} cm ({formatDayAndMonth(item.max_snowfall_day.date, item.max_snowfall_day.dayName)})
                  </Text>
                </View>
              )}

              <TouchableOpacity
                onPress={() => {
                  toggleFavorite({
                    ID: item.id,
                    Name: item.name,
                    Country: item.country,
                    Latitude: item.latitude,
                    Longitude: item.longitude,
                    Website: item.website || '',
                  } as any);
                }}
                style={styles.favToggleBtn}>
                <Star
                  size={14}
                  color={isFav ? '#f59e0b' : colors.textLight}
                  fill={isFav ? '#f59e0b' : 'transparent'}
                />
                <Text style={styles.favToggleText}>
                  {isFav ? t('favorited', 'Favorita') : t('favorite', 'Guardar')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Triple Elevation Breakdown: Cota Alta, Cota Intermedia, Cota Baja */}
            <View style={styles.elevationTripleContainer}>
              {/* Cota Alta */}
              <View style={styles.elevationTripleBox}>
                <View style={styles.elevationTripleHeader}>
                  <Text style={styles.elevationTripleTitle}>🏔️ Cota Alta</Text>
                  <Text style={styles.elevationTripleMeters}>{item.summit_elevation_m}m</Text>
                </View>
                <Text style={styles.elevationTripleSnowValue}>
                  {snowCotas.summit > 0 ? `${snowCotas.summit} cm` : '0 cm'}
                </Text>
                <View style={styles.elevationTripleWindRow}>
                  <WindDirectionArrow degrees={windDeg} size={11} color="#0284c7" />
                  <Text style={styles.elevationTripleWindText}>
                    {windInfo.cardinal} {item.max_wind_speed_kmh ?? 25} km/h
                  </Text>
                </View>
                <Text style={styles.elevationTripleGustsText}>
                  Rachas: {item.max_wind_gusts_kmh ?? 35} km/h
                </Text>
              </View>

              {/* Cota Intermedia */}
              <View style={styles.elevationTripleBox}>
                <View style={styles.elevationTripleHeader}>
                  <Text style={styles.elevationTripleTitle}>🚠 Intermedia</Text>
                  <Text style={styles.elevationTripleMeters}>{midElev}m</Text>
                </View>
                <Text style={styles.elevationTripleSnowValue}>
                  {snowCotas.mid > 0 ? `${snowCotas.mid} cm` : '0 cm'}
                </Text>
                <View style={styles.elevationTripleWindRow}>
                  <WindDirectionArrow degrees={windDeg} size={11} color="#0284c7" />
                  <Text style={styles.elevationTripleWindText}>
                    {windInfo.cardinal} {Math.round((item.max_wind_speed_kmh ?? 25) * 0.8)} km/h
                  </Text>
                </View>
                <Text style={styles.elevationTripleGustsText}>
                  Rachas: {Math.round((item.max_wind_gusts_kmh ?? 35) * 0.8)} km/h
                </Text>
              </View>

              {/* Cota Baja */}
              <View style={styles.elevationTripleBox}>
                <View style={styles.elevationTripleHeader}>
                  <Text style={styles.elevationTripleTitle}>🌲 Cota Baja</Text>
                  <Text style={styles.elevationTripleMeters}>{item.base_elevation_m}m</Text>
                </View>
                <Text style={styles.elevationTripleSnowValue}>
                  {snowCotas.base > 0 ? `${snowCotas.base} cm` : '0 cm'}
                </Text>
                <View style={styles.elevationTripleWindRow}>
                  <WindDirectionArrow degrees={windDeg} size={11} color={colors.textSecondary} />
                  <Text style={[styles.elevationTripleWindText, { color: colors.textSecondary }]}>
                    {windInfo.cardinal} {Math.round((item.max_wind_speed_kmh ?? 25) * 0.65)} km/h
                  </Text>
                </View>
                <Text style={styles.elevationTripleGustsText}>
                  Rachas: {Math.round((item.max_wind_gusts_kmh ?? 35) * 0.65)} km/h
                </Text>
              </View>
            </View>

            {/* Wind warning if high wind in summit */}
            {item.wind_warning && (
              <View
                style={[
                  styles.windWarningCard,
                  item.wind_level === 'extreme' && styles.windWarningCardExtreme,
                ]}>
                <AlertTriangle
                  size={12}
                  color={item.wind_level === 'extreme' ? '#ef4444' : '#ea580c'}
                />
                <Text
                  style={[
                    styles.windWarningText,
                    item.wind_level === 'extreme' && { color: '#ef4444' },
                  ]}>
                  {item.wind_warning}
                </Text>
              </View>
            )}

            <Text style={styles.elevationDisclaimer}>
              * Previsión de nevada ({selectedTimeframe}) y viento por cotas. Flecha indica rumbo del viento.
            </Text>

            {/* Mini 7-day snowfall bars */}
            <View style={styles.miniTimelineContainer}>
              <Text style={styles.miniTimelineTitle}>
                {t('snowfall_forecast_7d', 'Previsión 7 días (nevada y viento):')}
              </Text>
              <View style={styles.miniDaysRow}>
                {item.daily.slice(0, 7).map((day, idx) => {
                  const hasSnow = day.snowfall_cm > 0;
                  const dayWindDir = day.wind_direction_deg ?? windDeg;
                  const dayCardinal = getWindDirectionInfo(dayWindDir).cardinal;
                  return (
                    <View key={day.date || idx} style={styles.miniDayCol}>
                      <Text
                        style={[
                          styles.miniDaySnowAmount,
                          hasSnow && styles.miniDaySnowAmountActive,
                        ]}>
                        {hasSnow ? `${day.snowfall_cm} cm` : '-'}
                      </Text>
                      <View
                        style={[
                          styles.miniBar,
                          {
                            height: Math.min(26, Math.max(4, day.snowfall_cm * 1.8)),
                            backgroundColor: hasSnow ? '#0284c7' : colors.border,
                          },
                        ]}
                      />
                      <Text style={styles.miniDayNameText}>{formatDayAndMonth(day.date, day.dayName)}</Text>
                      <View style={styles.miniDayWindRow}>
                        <WindDirectionArrow degrees={dayWindDir} size={9} color={colors.textSecondary} />
                        <Text style={styles.miniDayWindText}>
                          {dayCardinal} {day.wind_speed_max_kmh ?? 20}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Action buttons */}
            <View style={styles.cardFooter}>
              <TouchableOpacity
                style={styles.cardActionBtn}
                onPress={() => handleOpenResort(item)}>
                <MapIcon size={14} color={colors.primary} />
                <Text style={styles.cardActionBtnText}>{t('view_on_map', 'Ver en Mapa')}</Text>
              </TouchableOpacity>

              {onSelectResort && (
                <TouchableOpacity
                  style={[styles.cardActionBtn, styles.cardActionBtnPrimary]}
                  onPress={() => handleOpenResort(item)}>
                  <Text style={styles.cardActionBtnPrimaryText}>
                    {t('resort_details', 'Ver Estación')}
                  </Text>
                  <ChevronRight size={14} color="#ffffff" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* View Header */}
      {showHeader && (
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIconContainer}>
              <Snowflake size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>
                {t('snow_forecast_title', 'Previsión de Nevadas')}
              </Text>
              <Text style={styles.headerSubtitle}>
                {t('snow_forecast_subtitle', 'Dónde va a nevar pronto en España y Andorra')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleRefresh}
              style={styles.refreshBtn}
              accessibilityLabel="Actualizar">
              <RefreshCw
                size={18}
                color={colors.textSecondary}
                style={isRefreshing ? { transform: [{ rotate: '45deg' }] } : {}}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Summary Highlight Card */}
      {summary && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryLeft}>
            <View style={styles.summaryRow}>
              <Sparkles size={16} color="#38bdf8" />
              <Text style={styles.summaryCountText}>
                {t('snowing_resorts_count', {
                  count: summary.snowingCount,
                  total: summary.totalCount,
                  defaultValue: `${summary.snowingCount} de ${summary.totalCount} estaciones con nevadas previstas`,
                })}
              </Text>
            </View>
            {summary.topResortName && summary.maxSnow > 0 && (
              <Text style={styles.summaryTopText}>
                🏆 {t('top_snowfall_label', 'Máxima nevada:')}{' '}
                <Text style={{ fontWeight: '700', color: '#ffffff' }}>
                  {summary.topResortName} ({summary.maxSnow} cm)
                </Text>
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Timeframe Selector Chips */}
      <View style={styles.timeframeRow}>
        {TIMEFRAME_OPTIONS.map((opt) => {
          const isSelected = selectedTimeframe === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.timeframeChip, isSelected && styles.timeframeChipActive]}
              onPress={() => setSelectedTimeframe(opt.id)}>
              <Text
                style={[
                  styles.timeframeChipText,
                  isSelected && styles.timeframeChipTextActive,
                ]}>
                {t(opt.labelKey, opt.defaultLabel)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Region Filter Horizontal Scroll */}
      <View style={styles.regionContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.regionScrollContent}>
          {REGION_OPTIONS.map((reg) => {
            const isSelected = selectedRegion === reg.id;
            return (
              <TouchableOpacity
                key={reg.id}
                onPress={() => setSelectedRegion(reg.id)}
                style={[styles.regionChip, isSelected && styles.regionChipActive]}>
                {reg.flag && <Text style={{ fontSize: 13, marginRight: 4 }}>{reg.flag}</Text>}
                <Text
                  style={[styles.regionChipText, isSelected && styles.regionChipTextActive]}>
                  {t(reg.labelKey, reg.defaultLabel)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search and Filters Bar */}
      <View style={styles.searchBarRow}>
        <View style={styles.searchContainer}>
          <Search size={16} color={colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('search_resort_placeholder', 'Buscar estación o zona...')}
            placeholderTextColor={colors.textLight}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <X size={16} color={colors.textLight} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={() => setOnlySnowing(!onlySnowing)}
          style={[styles.onlySnowToggle, onlySnowing && styles.onlySnowToggleActive]}>
          <Snowflake size={14} color={onlySnowing ? '#ffffff' : colors.textSecondary} />
          <Text
            style={[
              styles.onlySnowToggleText,
              onlySnowing && styles.onlySnowToggleTextActive,
            ]}>
            {t('only_snowing', 'Solo nieve')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Resort List */}
      {isLoading && forecasts.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {t('loading_snow_forecasts', 'Consultando partes y previsiones de nieve...')}
          </Text>
        </View>
      ) : filteredForecasts.length > 0 ? (
        <FlatList
          data={filteredForecasts}
          keyExtractor={(item) => item.id}
          renderItem={renderResortCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Snowflake size={48} color={colors.textLight} />
          <Text style={styles.emptyTitle}>
            {t('no_snow_forecasts_found', 'No se encontraron estaciones')}
          </Text>
          <Text style={styles.emptySubtitle}>
            {onlySnowing
              ? t(
                  'no_snow_in_selected_timeframe',
                  'No hay nevadas significativas previstas para este filtro. Prueba a seleccionar los próximos 7 días o cambiar de región.'
                )
              : t('try_adjusting_filters', 'Prueba a cambiar los términos de búsqueda o filtros.')}
          </Text>
          {onlySnowing && (
            <TouchableOpacity
              onPress={() => setOnlySnowing(false)}
              style={styles.clearFilterBtn}>
              <Text style={styles.clearFilterBtnText}>
                {t('show_all_resorts', 'Mostrar todas las estaciones')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
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
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    headerIconContainer: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    refreshBtn: {
      padding: SPACING.sm,
    },
    summaryCard: {
      marginHorizontal: SPACING.md,
      marginTop: 2,
      marginBottom: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: '#0f172a',
      gap: 4,
    },
    summaryLeft: {
      gap: 3,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    summaryCountText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#e2e8f0',
    },
    summaryTopText: {
      fontSize: 11,
      color: '#cbd5e1',
    },
    timeframeRow: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.md,
      gap: SPACING.xs,
      marginBottom: 4,
    },
    timeframeChip: {
      flex: 1,
      paddingVertical: 6,
      paddingHorizontal: 4,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timeframeChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    timeframeChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    timeframeChipTextActive: {
      color: '#ffffff',
    },
    regionContainer: {
      marginBottom: 4,
    },
    regionScrollContent: {
      paddingHorizontal: SPACING.md,
      gap: SPACING.xs,
      paddingVertical: 2,
    },
    regionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    regionChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    regionChipText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    regionChipTextActive: {
      color: '#ffffff',
      fontWeight: '600',
    },
    searchBarRow: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.md,
      gap: SPACING.xs,
      marginBottom: 8,
      alignItems: 'center',
    },
    searchContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: SPACING.sm,
      height: 34,
      gap: 6,
    },
    searchInput: {
      flex: 1,
      fontSize: 12,
      color: colors.textPrimary,
      paddingVertical: 0,
    },
    onlySnowToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      height: 34,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    onlySnowToggleActive: {
      backgroundColor: '#0284c7',
      borderColor: '#0284c7',
    },
    onlySnowToggleText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    onlySnowToggleTextActive: {
      color: '#ffffff',
      fontWeight: '600',
    },
    listContent: {
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.xl * 2,
      gap: 6,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    cardExpanded: {
      borderColor: colors.primary,
      ...SHADOWS.sm,
    },
    cardCompactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 8,
      minHeight: 52,
    },
    rankNumber: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textLight,
      width: 20,
      textAlign: 'center',
    },
    resortInfoCol: {
      flex: 1,
      justifyContent: 'center',
    },
    resortTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      lineHeight: 17,
    },
    resortSubtext: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 1,
    },
    nextSnowPill: {
      backgroundColor: colors.surface,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.round,
      borderWidth: 1,
      borderColor: colors.border,
    },
    nextSnowPillText: {
      fontSize: 10,
      fontWeight: '600',
      color: '#0284c7',
    },
    compactWindPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: 5,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.round,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 3,
    },
    compactWindPillAlert: {
      backgroundColor: '#fef2f2',
      borderColor: '#fca5a5',
    },
    compactWindText: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    compactSnowBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.sm,
      minWidth: 54,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compactSnowText: {
      fontSize: 12,
      fontWeight: '800',
    },
    chevronWrapper: {
      width: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    expandedContent: {
      paddingHorizontal: 12,
      paddingBottom: 10,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      gap: 6,
    },
    expandedMetricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 2,
    },
    elevationTripleContainer: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 2,
    },
    elevationTripleBox: {
      flex: 1,
      backgroundColor: colors.card,
      padding: 6,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 2,
    },
    elevationTripleHeader: {
      flexDirection: 'column',
    },
    elevationTripleTitle: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    elevationTripleMeters: {
      fontSize: 8.5,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    elevationTripleSnowValue: {
      fontSize: 12,
      fontWeight: '800',
      color: '#0284c7',
      marginVertical: 1,
    },
    elevationTripleWindRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    elevationTripleWindText: {
      fontSize: 9,
      fontWeight: '600',
      color: '#0284c7',
    },
    elevationTripleGustsText: {
      fontSize: 8,
      color: colors.textSecondary,
    },
    elevationBreakdownRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 2,
    },
    elevationBox: {
      flex: 1,
      backgroundColor: colors.card,
      padding: 6,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 2,
    },
    elevationBoxHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    elevationBoxTitle: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    elevationWindRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    elevationWindValue: {
      fontSize: 9,
      fontWeight: '600',
      color: '#0284c7',
    },
    elevationBoxValue: {
      fontSize: 11,
      fontWeight: '700',
      color: '#0284c7',
    },
    elevationSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 3,
    },
    elevationBoxSub: {
      fontSize: 8.5,
      color: colors.textSecondary,
    },
    windWarningCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#fffbeb',
      borderWidth: 1,
      borderColor: '#fde68a',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 2,
    },
    windWarningCardExtreme: {
      backgroundColor: '#fef2f2',
      borderColor: '#fca5a5',
    },
    windWarningText: {
      fontSize: 10,
      fontWeight: '600',
      color: '#b45309',
      flex: 1,
    },
    elevationDisclaimer: {
      fontSize: 9,
      color: colors.textLight,
      fontStyle: 'italic',
      lineHeight: 12,
    },
    expandedMetricItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    expandedMetricText: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    favToggleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    favToggleText: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    miniTimelineContainer: {
      paddingTop: 4,
      gap: 4,
    },
    miniTimelineTitle: {
      fontSize: 10,
      color: colors.textLight,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    miniDaysRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      minHeight: 52,
    },
    miniDayCol: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'flex-end',
      gap: 2,
    },
    miniDaySnowAmount: {
      fontSize: 8,
      color: colors.textLight,
      fontWeight: '500',
    },
    miniDaySnowAmountActive: {
      color: '#0284c7',
      fontWeight: '700',
    },
    miniBar: {
      width: 10,
      borderRadius: 2,
    },
    miniDayNameText: {
      fontSize: 8.5,
      color: colors.textSecondary,
      textTransform: 'capitalize',
    },
    miniDayWindRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      marginTop: 1,
    },
    miniDayWindText: {
      fontSize: 7.5,
      color: colors.textLight,
      fontWeight: '500',
    },
    cardFooter: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
    },
    cardActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 7,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    cardActionBtnText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.primary,
    },
    cardActionBtnPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    cardActionBtnPrimaryText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#ffffff',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xl,
      gap: SPACING.sm,
    },
    loadingText: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xl,
      gap: SPACING.sm,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
    clearFilterBtn: {
      marginTop: SPACING.sm,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.primary,
      borderRadius: BORDER_RADIUS.sm,
    },
    clearFilterBtnText: {
      fontSize: 13,
      color: '#ffffff',
      fontWeight: '600',
    },
  });
