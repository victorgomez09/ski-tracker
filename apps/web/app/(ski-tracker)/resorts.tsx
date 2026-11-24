import { useFocusEffect, useRouter } from 'expo-router';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Compass,
  MapPin,
  Search,
  Snowflake,
  Star,
  X
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineMapsModal } from 'components/map/offline-maps-panel';
import { ResortLogo } from 'components/resorts/resort-logo';
import { SkiinfoResortDetail } from 'components/resorts/skiinfo-resort-detail';
import { SnowForecastView } from 'components/snow/snow-forecast-view';
import { API_BASE_URL } from 'constants/constants';
import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';
import { useAuth } from 'context/auth.context';
import { useFavorites } from 'context/favorites.context';
import { useToast } from 'context/toast.context';
import api from 'interceptor/api';
import { Resort } from 'models/ski-resort.model';
import { WeatherForecast, WeatherModelId } from 'models/weather.model';

// Cache state to survive tab navigation / component remounting
let cachedResorts: Resort[] = [];
let cachedSearchTerm = '';
let cachedSelectedResort: Resort | null = null;
let cachedSessions: any[] = [];
let lastFetchedSearchTerm = cachedSearchTerm;

const mapStyleUrl = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

let useOffline: any;
if (Platform.OS === 'web') {
  useOffline = require('../../utils/offline-maps.util').useOfflineMaps;
} else {
  useOffline = require('../../hooks/use-offline.hook').useOfflineMaps;
}

export default function ResortsView() {
  const isWeb = Platform.OS === 'web';
  const { t } = useTranslation();
  const router = useRouter();
  const { token } = useAuth();
  const { favorites, isFavorite, toggleFavorite, isLoadingFavorites, refreshFavorites } = useFavorites();
  const { showToast } = useToast();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { packs, downloadingPack, downloadingProgress, downloadRegion, deletePack } =
    useOffline(mapStyleUrl);

  useFocusEffect(
    useCallback(() => {
      refreshFavorites();
    }, [refreshFavorites])
  );

  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'resorts' | 'snow_forecast'>('resorts');
  const [favoritesExpanded, setFavoritesExpanded] = useState(true);
  const [resorts, setResorts] = useState<Resort[]>(cachedResorts);
  const [searchTerm, setSearchTerm] = useState(cachedSearchTerm);
  const [selectedResort, setSelectedResort] = useState<Resort | null>(cachedSelectedResort);
  const [sessions, setSessions] = useState<any[]>(cachedSessions);
  const [isLoadingResorts, setIsLoadingResorts] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [weatherData, setWeatherData] = useState<WeatherForecast | null>(null);
  const [selectedWeatherModel, setSelectedWeatherModel] = useState<WeatherModelId>('ecmwf_ifs025');
  const [isRefreshingWeather, setIsRefreshingWeather] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  // Cache sync helpers
  /* eslint-disable react-hooks/globals */
  const setResortsWithCache = (val: Resort[]) => {
    cachedResorts = val;
    setResorts(val);
  };

  const setSearchTermWithCache = (val: string) => {
    cachedSearchTerm = val;
    setSearchTerm(val);
  };

  const setSelectedResortWithCache = (val: Resort | null) => {
    cachedSelectedResort = val;
    setSelectedResort(val);
  };

  const setSessionsWithCache = (val: any[]) => {
    cachedSessions = val;
    setSessions(val);
  };
  /* eslint-enable react-hooks/globals */

  // Debounce search API call
  useEffect(() => {
    if (searchTerm === lastFetchedSearchTerm) {
      return;
    }

    if (searchTerm.trim().length <= 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResortsWithCache([]);
      lastFetchedSearchTerm = '';
      return;
    }

    setIsLoadingResorts(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const response = await api.get(`${API_BASE_URL}/resorts/by-name`, {
          params: { name: searchTerm },
        });

        if (response.status === 200) {
          setResortsWithCache(response.data);
          lastFetchedSearchTerm = searchTerm;
        } else {
          console.error('Error fetching resorts:', response.statusText);
          showToast(t('failed_fetch_resorts'), 'error');
        }
      } catch (error) {
        console.error('Error fetching resorts:', error);
        showToast(t('failed_fetch_resorts'), 'error');
        setResortsWithCache([]);
      } finally {
        setIsLoadingResorts(false);
      }
    }, 350);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, token]);

  const handleSearch = (term: string) => {
    setSearchTermWithCache(term);
    setSelectedResortWithCache(null);
  };

  const handleResortSelect = async (resort: Resort) => {
    setSelectedResortWithCache(resort);
    setSessionsWithCache([]);
    setIsLoadingSessions(true);

    try {
      const needsFullDetails = !resort.pistes || resort.pistes.length === 0;

      const [sessionsRequest, weatherRequest, detailRequest] = await Promise.allSettled([
        api.get(`${API_BASE_URL}/ski-sessions/by-resort`, {
          params: { resort_id: resort.ID },
        }),
        api.get<WeatherForecast>(`${API_BASE_URL}/weather`, {
          params: {
            lat: resort.Latitude,
            lon: resort.Longitude,
            resort_id: resort.ID,
            model: selectedWeatherModel,
          },
        }),
        needsFullDetails
          ? api.get(`${API_BASE_URL}/resorts/by-id/${resort.ID}`)
          : Promise.resolve(null),
      ]);

      if (sessionsRequest.status === 'fulfilled' && sessionsRequest.value?.status === 200) {
        setSessionsWithCache(sessionsRequest.value.data.sessions || []);
      }
      if (weatherRequest.status === 'fulfilled' && weatherRequest.value?.status === 200) {
        setWeatherData(weatherRequest.value.data);
      }
      if (
        detailRequest.status === 'fulfilled' &&
        detailRequest.value &&
        detailRequest.value.status === 200 &&
        detailRequest.value.data
      ) {
        setSelectedResortWithCache(detailRequest.value.data);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
      showToast(t('failed_fetch_sessions'), 'error');
      setSessionsWithCache([]);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleSessionClick = (session: any) => {
    if (!selectedResort) return;
    router.navigate({
      pathname: '/map',
      params: {
        sessionId: session.id,
        lat: selectedResort.Latitude,
        lon: selectedResort.Longitude,
        zoom: 14,
      },
    });
    setTimeout(() => setSelectedResortWithCache(null), 100);
  };

  const handleDownloadCurrentView = (customName: string) => {
    if (!selectedResort) return null;

    const delta = 0.08;
    const bounds: [west: number, south: number, east: number, north: number] = [
      selectedResort.Longitude - delta,
      selectedResort.Latitude - delta,
      selectedResort.Longitude + delta,
      selectedResort.Latitude + delta,
    ];

    if (isWeb) {
      downloadRegion(customName, bounds, 10, 16);
    }
  };

  const selectedResortSummary = useMemo(() => {
    if (!selectedResort) return null;

    const stats = selectedResort.Tags?.statistics;
    const liftsType = stats?.lifts?.byType;
    const downhillByDiff = stats?.runs?.byActivity?.downhill?.byDifficulty;
    const pistes = selectedResort.pistes || [];

    return {
      lifts: selectedResort.total_lifts ?? 0,
      pistes: selectedResort.total_pistes ?? 0,
      distance: selectedResort.distance_km ?? 0,
      country: selectedResort.Country || t('unknown'),
      website: selectedResort.Website || null,
      pistesBreakdown: downhillByDiff ? {
        novice: downhillByDiff.novice?.count ?? 0,
        easy: downhillByDiff.easy?.count ?? 0,
        intermediate: downhillByDiff.intermediate?.count ?? 0,
        advanced: (downhillByDiff.advanced?.count ?? 0) + ((downhillByDiff as any).expert?.count ?? 0),
      } : {
        novice: pistes.filter((p) => p.Name && !('category' in p) && p.Difficulty?.toLowerCase() === 'novice').length ?? 0,
        easy: pistes.filter((p) => p.Name && !('category' in p) && p.Difficulty?.toLowerCase() === 'easy').length ?? 0,
        intermediate:
          pistes.filter((p) => p.Name && !('category' in p) && p.Difficulty?.toLowerCase() === 'intermediate').length ?? 0,
        advanced:
          pistes.filter(
            (p) =>
              p.Name && !('category' in p) && (p.Difficulty?.toLowerCase() === 'advanced' || p.Difficulty?.toLowerCase() === 'expert')
          ).length ?? 0,
      },
      liftsBreakdown: {
        chair_lift: liftsType?.chair_lift?.count ?? 0,
        drag_lift: liftsType?.drag_lift?.count ?? 0,
        magic_carpet: liftsType?.magic_carpet?.count ?? 0,
        rope_tow: liftsType?.rope_tow?.count ?? 0,
      },
    };
  }, [selectedResort]);

  const handleRefreshWeather = async (overrideModel?: WeatherModelId) => {
    if (!selectedResort) return;
    setIsRefreshingWeather(true);
    const modelToUse = overrideModel || selectedWeatherModel;
    try {
      const weatherRequest = await api.get<WeatherForecast>(`${API_BASE_URL}/weather`, {
        params: {
          lat: selectedResort.Latitude,
          lon: selectedResort.Longitude,
          resort_id: selectedResort.ID,
          model: modelToUse,
          refresh: 'true',
        },
      });
      if (weatherRequest.status === 200) {
        setWeatherData(weatherRequest.data);
      }
    } catch (err) {
      console.error('Error refreshing weather:', err);
    } finally {
      setIsRefreshingWeather(false);
    }
  };

  const handleSelectWeatherModel = async (model: WeatherModelId) => {
    setSelectedWeatherModel(model);
    if (!selectedResort) return;
    setIsRefreshingWeather(true);
    try {
      const weatherRequest = await api.get<WeatherForecast>(`${API_BASE_URL}/weather`, {
        params: {
          lat: selectedResort.Latitude,
          lon: selectedResort.Longitude,
          resort_id: selectedResort.ID,
          model,
        },
      });
      if (weatherRequest.status === 200) {
        setWeatherData(weatherRequest.data);
      }
    } catch (err) {
      console.error('Error switching weather model:', err);
    } finally {
      setIsRefreshingWeather(false);
    }
  };

  const renderDetailsContent = () => {
    if (!selectedResort) return null;

    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
        <SkiinfoResortDetail
          resort={selectedResort}
          weatherData={weatherData}
          selectedModel={selectedWeatherModel}
          onSelectModel={handleSelectWeatherModel}
          sessions={sessions}
          isLoadingSessions={isLoadingSessions}
          isRefreshingWeather={isRefreshingWeather}
          onRefreshWeather={handleRefreshWeather}
          onClose={() => setSelectedResortWithCache(null)}
          onOpenMap={() => {
            router.navigate({
              pathname: '/map',
              params: { lat: selectedResort.Latitude, lon: selectedResort.Longitude, zoom: 12 },
            });
            setTimeout(() => setSelectedResortWithCache(null), 100);
          }}
          onOpenPiste={(piste) => {
            let lat = selectedResort.Latitude;
            let lon = selectedResort.Longitude;
            const coords = piste.GeometryGeoJSON?.coordinates;
            if (coords && coords.length > 0) {
              lon = coords[0][0];
              lat = coords[0][1];
            }
            router.navigate({
              pathname: '/map',
              params: {
                lat,
                lon,
                zoom: 14,
                pisteId: piste.ID,
              },
            });
            setTimeout(() => setSelectedResortWithCache(null), 100);
          }}
          onStartTracking={() => {
            router.navigate({
              pathname: '/tracking',
              params: {
                lat: selectedResort.Latitude,
                lng: selectedResort.Longitude,
                zoom: 12,
              },
            });
            setTimeout(() => setSelectedResortWithCache(null), 100);
          }}
          onDownloadOffline={() => setShowOfflineModal(true)}
        />
      </SafeAreaView>
    );
  };

  const renderResortCard = (resort: Resort) => {
    const isSelected = selectedResort?.ID === resort.ID;
    const isFav = isFavorite(resort.ID);

    return (
      <TouchableOpacity
        key={resort.ID}
        style={[
          styles.resortCard,
          isSelected ? styles.resortCardSelected : styles.resortCardUnselected,
        ]}
        onPress={() => handleResortSelect(resort)}
        activeOpacity={0.7}>
        <View style={styles.resortCardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <ResortLogo website={resort.Website} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.resortCardName, isSelected && { color: colors.primaryDark }]}>
                {resort.Name}
              </Text>
              <View style={styles.resortCardLocation}>
                <MapPin size={12} color={colors.textSecondary} />
                <Text style={styles.resortCardCountry}>{resort.Country}</Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={styles.favoriteCardButton}
              onPress={(e) => {
                e?.stopPropagation?.();
                toggleFavorite(resort);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Star
                size={18}
                color={isFav ? '#F59E0B' : colors.textLight}
                fill={isFav ? '#F59E0B' : 'transparent'}
              />
            </TouchableOpacity>
            <View style={styles.resortCardBadge}>
              <Text style={styles.resortCardBadgeText}>
                {t('lifts_count', { count: resort.total_lifts ?? 0 })}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.resortCardFooter}>
          <Text style={styles.resortCardFooterText}>
            {t('km_runs', { distance: resort.distance_km?.toFixed(1) ?? '0.0' })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'transparent' }}>
      {showOfflineModal && isWeb && (
        <OfflineMapsModal
          onClose={() => setShowOfflineModal(false)}
          packs={packs}
          downloadingPack={downloadingPack}
          downloadProgress={downloadingProgress}
          onDownloadCurrentArea={handleDownloadCurrentView}
          onDeletePack={deletePack}
          currentResortName={selectedResort?.Name}
        />
      )}

      <View style={styles.container}>
        {/* Top Tab Switcher */}
        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.tabSwitcherBtn, activeTab === 'resorts' && styles.tabSwitcherBtnActive]}
            onPress={() => setActiveTab('resorts')}>
            <Text
              style={[
                styles.tabSwitcherText,
                activeTab === 'resorts' && styles.tabSwitcherTextActive,
              ]}>
              {t('tab_all_resorts', '🏔️ Estaciones')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabSwitcherBtn,
              activeTab === 'snow_forecast' && styles.tabSwitcherBtnActive,
            ]}
            onPress={() => setActiveTab('snow_forecast')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Snowflake
                size={15}
                color={activeTab === 'snow_forecast' ? '#ffffff' : colors.primary}
              />
              <Text
                style={[
                  styles.tabSwitcherText,
                  activeTab === 'snow_forecast' && styles.tabSwitcherTextActive,
                ]}>
                {t('tab_snow_forecast', 'Previsión Nevadas')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {activeTab === 'snow_forecast' ? (
          <SnowForecastView
            showHeader={true}
            onSelectResort={(r) => handleResortSelect(r as any)}
          />
        ) : (
          <ScrollView
            style={styles.resortList}
            contentContainerStyle={{ paddingBottom: SPACING.xl }}
            showsVerticalScrollIndicator={false}>
            {/* Quick Snow Banner */}
            <TouchableOpacity
              style={styles.snowBanner}
              onPress={() => setActiveTab('snow_forecast')}
              activeOpacity={0.85}>
              <View style={styles.snowBannerLeft}>
                <View style={styles.snowBannerIcon}>
                  <Snowflake size={20} color="#38bdf8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.snowBannerTitle}>
                    {t('snow_banner_title', '¿Dónde va a nevar pronto? ❄️')}
                  </Text>
                  <Text style={styles.snowBannerSubtitle}>
                    {t(
                      'snow_banner_subtitle',
                      'Consulta las nevadas previstas en España y Andorra'
                    )}
                  </Text>
                </View>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </TouchableOpacity>

            {/* Favorites Accordion */}
          <View style={styles.favoritesAccordion}>
            <TouchableOpacity
              style={styles.favoritesAccordionHeader}
              onPress={() => setFavoritesExpanded(!favoritesExpanded)}
              activeOpacity={0.7}>
              <View style={styles.favoritesAccordionHeaderLeft}>
                <Star size={18} color="#F59E0B" fill="#F59E0B" />
                <Text style={styles.favoritesAccordionTitle}>{t('favorite_resorts')}</Text>
                <View style={styles.favoritesCountBadge}>
                  <Text style={styles.favoritesCountText}>{favorites.length}</Text>
                </View>
              </View>
              {favoritesExpanded ? (
                <ChevronUp size={18} color={colors.textSecondary} />
              ) : (
                <ChevronDown size={18} color={colors.textSecondary} />
              )}
            </TouchableOpacity>

            {favoritesExpanded && (
              <View style={styles.favoritesAccordionContent}>
                {isLoadingFavorites && favorites.length === 0 ? (
                  <View style={{ padding: SPACING.lg, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : favorites.length > 0 ? (
                  <View style={styles.matchingResortsList}>
                    {favorites.map((resort) => renderResortCard(resort))}
                  </View>
                ) : (
                  <View style={styles.emptyFavoritesContainer}>
                    <Star size={24} color={colors.textLight} />
                    <Text style={styles.emptyFavoritesTitle}>{t('no_favorite_resorts')}</Text>
                    <Text style={styles.emptyFavoritesSubtitle}>
                      {t('no_favorite_resorts_desc')}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Search Header Container */}
          <View style={styles.searchHeader}>
            <Text style={styles.searchSectionTitle}>{t('search_resorts')}</Text>
            <View style={[styles.searchBar, inputFocused ? { borderColor: colors.primary } : {}]}>
              {isLoadingResorts ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Search size={18} color={colors.textLight} />
              )}
              <TextInput
                style={styles.searchInput}
                placeholder={t('search_placeholder') as string}
                placeholderTextColor={colors.textLight}
                value={searchTerm}
                onChangeText={handleSearch}
                onFocus={() => setInputFocused(true)}
              />
              {searchTerm.length > 0 && (
                <TouchableOpacity
                  onPress={() => handleSearch('')}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <X size={16} color={colors.textLight} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Matching Search Results */}
          {resorts.length > 0 && (
            <View style={styles.matchingResortsContainer}>
              <Text style={styles.matchingResortsHeader}>
                {t('matching_resorts', { count: resorts.length })}
              </Text>
              <View style={styles.matchingResortsList}>
                {resorts.map((resort) => renderResortCard(resort))}
              </View>
            </View>
          )}

          {/* Welcome / Initial State */}
          {resorts.length === 0 && searchTerm.length <= 2 && (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyStateIconContainer}>
                <Compass size={32} color={colors.primary} />
              </View>
              <Text style={styles.emptyStateTitle}>{t('explore_resorts')}</Text>
              <Text style={styles.emptyStateSubtitle}>{t('explore_resorts_desc')}</Text>
            </View>
          )}

          {/* No results state */}
          {resorts.length === 0 && searchTerm.length > 2 && !isLoadingResorts && (
            <View style={styles.emptyStateContainer}>
              <View style={[styles.emptyStateIconContainer, styles.emptyStateIconContainerError]}>
                <X size={32} color={colors.danger} />
              </View>
              <Text style={styles.emptyStateTitle}>{t('no_resorts_found')}</Text>
              <Text style={styles.emptyStateSubtitle}>
                {t('no_resorts_matching', { searchTerm })}
              </Text>
            </View>
          )}
        </ScrollView>
        )}

        {/* Modal Detail View for Selected Resort */}
        <Modal
          visible={!!selectedResort}
          animationType="slide"
          onRequestClose={() => setSelectedResortWithCache(null)}
          statusBarTranslucent={true}>
          <View style={styles.modalContainer}>{renderDetailsContent()}</View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: typeof LIGHT_COLORS) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: SPACING.md,
    },
    tabSwitcher: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 4,
      marginBottom: SPACING.md,
      ...SHADOWS.sm,
    },
    tabSwitcherBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.sm,
    },
    tabSwitcherBtnActive: {
      backgroundColor: colors.primary,
    },
    tabSwitcherText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabSwitcherTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    snowBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#0f172a',
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: '#1e293b',
      ...SHADOWS.md,
    },
    snowBannerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    snowBannerIcon: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: '#1e293b',
      alignItems: 'center',
      justifyContent: 'center',
    },
    snowBannerTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#ffffff',
    },
    snowBannerSubtitle: {
      fontSize: 11,
      color: '#94a3b8',
      marginTop: 2,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    searchHeader: {
      marginBottom: SPACING.md,
    },
    searchSectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: colors.textSecondary,
      marginBottom: SPACING.sm,
    },
    favoritesAccordion: {
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: SPACING.md,
      overflow: 'hidden',
      ...SHADOWS.sm,
    },
    favoritesAccordionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: SPACING.md,
      backgroundColor: colors.card,
    },
    favoritesAccordionHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    favoritesAccordionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    favoritesCountBadge: {
      backgroundColor: colors.primaryLight,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.round,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    favoritesCountText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primaryDark,
    },
    favoritesAccordionContent: {
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: SPACING.md,
    },
    emptyFavoritesContainer: {
      paddingVertical: SPACING.md,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    emptyFavoritesTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    emptyFavoritesSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 280,
      lineHeight: 16,
    },
    favoriteCardButton: {
      padding: 6,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerIconButton: {
      padding: SPACING.sm,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.round,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: SPACING.md,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOWS.sm,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 14,
      color: colors.textPrimary,
      marginLeft: SPACING.sm,
    },
    resortList: {
      flex: 1,
    },
    matchingResortsContainer: {
      marginBottom: SPACING.md,
    },
    matchingResortsHeader: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: colors.textSecondary,
      marginBottom: SPACING.sm,
    },
    matchingResortsList: {
      gap: SPACING.sm,
    },
    resortCard: {
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      ...SHADOWS.sm,
    },
    resortCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },
    resortCardUnselected: {
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    resortCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    resortCardName: {
      fontWeight: '700',
      fontSize: 16,
      color: colors.textPrimary,
    },
    resortCardLocation: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: 4,
    },
    resortCardCountry: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    resortCardBadge: {
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.round,
      borderWidth: 1,
      borderColor: colors.border,
    },
    resortCardBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    resortCardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: SPACING.sm,
      marginTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: SPACING.sm,
    },
    resortCardFooterText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    emptyStateContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.xl,
      marginVertical: 48,
    },
    emptyStateIconContainer: {
      width: 64,
      height: 64,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    emptyStateIconContainerError: {
      backgroundColor: '#FEE2E2',
      borderColor: colors.danger,
    },
    emptyStateTitle: {
      fontWeight: '700',
      fontSize: 16,
      color: colors.textPrimary,
    },
    emptyStateSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.sm,
      maxWidth: 260,
      lineHeight: 18,
    },
    detailsScrollView: {
      flex: 1,
      backgroundColor: colors.background,
      padding: SPACING.md,
    },
    headerBanner: {
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.md,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOWS.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: SPACING.md,
    },
    countryBadge: {
      backgroundColor: colors.primaryLight,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.round,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    countryText: {
      fontSize: 12,
      color: colors.primaryDark,
      fontWeight: '700',
    },
    resortName: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textPrimary,
      marginTop: SPACING.sm,
      lineHeight: 28,
    },
    closeButton: {
      padding: SPACING.sm,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.round,
    },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: colors.textSecondary,
      marginBottom: SPACING.sm,
    },
    metricsGrid: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    metricCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      ...SHADOWS.sm,
    },
    metricLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    metricValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 4,
    },
    breakdownGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    breakdownCard: {
      width: '48%',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      borderRadius: BORDER_RADIUS.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: SPACING.sm,
      ...SHADOWS.sm,
    },
    statusDot: {
      width: 12,
      height: 12,
      borderRadius: BORDER_RADIUS.round,
    },
    breakdownLabel: {
      display: 'flex',
      fontSize: 10,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    breakdownValue: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    websiteCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
      ...SHADOWS.sm,
    },
    websiteLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    websiteTitle: {
      fontWeight: '600',
      fontSize: 14,
      color: colors.textPrimary,
    },
    websiteSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    websiteButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    websiteButtonText: {
      color: colors.textOnPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    sessionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    sessionItem: {
      backgroundColor: colors.card,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
      ...SHADOWS.sm,
    },
    sessionItemLeft: {
      gap: 4,
    },
    sessionItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sessionDot: {
      width: 8,
      height: 8,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.success,
    },
    sessionDate: {
      fontWeight: '700',
      fontSize: 12,
      color: colors.textPrimary,
    },
    sessionTime: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    sessionUserRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    avatarContainer: {
      width: 24,
      height: 24,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.primary,
      overflow: 'hidden',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarText: {
      color: colors.textPrimary,
      fontWeight: '800',
      fontSize: 10,
    },
    privacyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    publicText: {
      fontSize: 10,
      color: colors.success,
      fontWeight: '600',
    },
    privateText: {
      fontSize: 10,
      color: colors.warning,
      fontWeight: '600',
    },
    sessionStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 6,
    },
    sessionStatText: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    activityBadge: {
      fontSize: 10,
      backgroundColor: colors.surface,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      color: colors.textSecondary,
      fontWeight: '700',
    },
    noSessionsCard: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
    },
    noSessionsTitle: {
      fontWeight: '600',
      fontSize: 14,
      color: colors.textPrimary,
      marginTop: 8,
    },
    noSessionsSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 4,
    },
    footerActions: {
      width: '100%',
      marginBottom: SPACING.xl,
    },
    footerActionsGrid: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    actionButton: {
      flex: 1,
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      ...SHADOWS.md,
      marginBottom: SPACING.md,
    },
  });
