import { useRouter } from "expo-router";
import {
    Activity,
    ChevronRight,
    Compass,
    Download,
    ExternalLink,
    Globe,
    Lock,
    Map as MapIcon,
    MapPin,
    Navigation,
    Search,
    Unlock,
    X
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Image, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OfflineMapsModal } from "components/map/offline-maps-panel";
import { WeatherForecastDetails } from "components/resorts/weather-forecast";
import { API_BASE_URL } from "constants/constants";
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from "constants/theme";
import { useAuth } from "context/auth.context";
import { useToast } from "context/toast.context";
import api from "interceptor/api";
import { Resort } from "models/ski-resort.model";
import { WeatherForecast } from "models/weather.model";

// Cache state to survive tab navigation / component remounting
let cachedResorts: Resort[] = [];
let cachedSearchTerm = "";
let cachedSelectedResort: Resort | null = null;
let cachedSessions: any[] = [];
let lastFetchedSearchTerm = cachedSearchTerm;

const mapStyleUrl = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

let useOffline: any;
if (Platform.OS === 'web') {
    useOffline = require('../../utils/offline-maps.util').useOfflineMaps;
} else {
    useOffline = require('../../hooks/use-offline.hook').useOfflineMaps;
}

export default function ResortsView() {
    const isWeb = Platform.OS === "web";
    const { t } = useTranslation();
    const router = useRouter();
    const { token } = useAuth();
    const { showToast } = useToast();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const {
        packs,
        downloadingPack,
        downloadingProgress,
        downloadRegion,
        deletePack,
    } = useOffline(mapStyleUrl);

    const [showOfflineModal, setShowOfflineModal] = useState(false);
    const [resorts, setResorts] = useState<Resort[]>(cachedResorts);
    const [searchTerm, setSearchTerm] = useState(cachedSearchTerm);
    const [selectedResort, setSelectedResort] = useState<Resort | null>(cachedSelectedResort);
    const [sessions, setSessions] = useState<any[]>(cachedSessions);
    const [isLoadingResorts, setIsLoadingResorts] = useState(false);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);
    const [weatherData, setWeatherData] = useState<WeatherForecast | null>(null);
    const [inputFocused, setInputFocused] = useState(false);

    // Cache sync helpers
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

    // Debounce search API call
    useEffect(() => {
        if (searchTerm === lastFetchedSearchTerm) {
            return;
        }

        if (searchTerm.trim().length <= 2) {
            setResortsWithCache([]);
            lastFetchedSearchTerm = "";
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
                    console.error("Error fetching resorts:", response.statusText);
                    showToast(t('failed_fetch_resorts'), 'error');
                }
            } catch (error) {
                console.error("Error fetching resorts:", error);
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
            const sessionsRequest = await api.get(`${API_BASE_URL}/ski-sessions/by-resort`, {
                params: { resort_id: resort.ID },
            });

            const weatherRequest = await api.get<WeatherForecast>(`${API_BASE_URL}/weather`, {
                params: { lat: resort.Latitude, lon: resort.Longitude },
            });

            if (sessionsRequest.status === 200 && weatherRequest.status === 200) {
                setSessionsWithCache(sessionsRequest.data.sessions || []);
                setWeatherData(weatherRequest.data);
            }
        } catch (err) {
            console.error("Error fetching sessions:", err);
            showToast(t('failed_fetch_sessions'), 'error');
            setSessionsWithCache([]);
        } finally {
            setIsLoadingSessions(false);
        }
    };

    const handleSessionClick = (session: any) => {
        if (!selectedResort) return;
        router.navigate({ pathname: '/map', params: { sessionId: session.id, lat: selectedResort.Latitude, lng: selectedResort.Longitude, zoom: 14 } });
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
        const pistes = selectedResort.pistes || [];

        return {
            lifts: selectedResort.total_lifts ?? 0,
            pistes: selectedResort.total_pistes ?? 0,
            distance: selectedResort.distance_km ?? 0,
            country: selectedResort.Country || t('unknown'),
            website: selectedResort.Website || null,
            pistesBreakdown: {
                novice: pistes.filter(p => p.Difficulty?.toLowerCase() === 'novice').length ?? 0,
                easy: pistes.filter(p => p.Difficulty?.toLowerCase() === 'easy').length ?? 0,
                intermediate: pistes.filter(p => p.Difficulty?.toLowerCase() === 'intermediate').length ?? 0,
                advanced: pistes.filter(p => p.Difficulty?.toLowerCase() === 'advanced' || p.Difficulty?.toLowerCase() === 'expert').length ?? 0,
            },
            liftsBreakdown: {
                chair_lift: liftsType?.chair_lift?.count ?? 0,
                drag_lift: liftsType?.drag_lift?.count ?? 0,
                magic_carpet: liftsType?.magic_carpet?.count ?? 0,
                rope_tow: liftsType?.rope_tow?.count ?? 0,
            }
        };
    }, [selectedResort]);

    const renderDetailsContent = () => {
        if (!selectedResort) return null;

        return (
            <SafeAreaView
                edges={['top', 'bottom']}
                style={{ flex: 1, backgroundColor: 'transparent' }}
            >
                <ScrollView style={styles.detailsScrollView}>
                    {/* Header Banner */}
                    <View style={styles.headerBanner}>
                        <View style={{ flex: 1 }}>
                            <View style={styles.countryBadge}>
                                <Globe size={12} color={colors.primaryDark} />
                                <Text style={styles.countryText}>{selectedResort.Country}</Text>
                            </View>
                            <Text style={styles.resortName}>{selectedResort.Name}</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => setSelectedResortWithCache(null)}
                        >
                            <X size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Key Metrics Grid */}
                    <View style={{ marginBottom: SPACING.md }}>
                        <Text style={styles.sectionHeader}>{t('resort_metrics')}</Text>
                        <View style={styles.metricsGrid}>
                            <View style={styles.metricCard}>
                                <Text style={styles.metricLabel}>{t('lifts')}</Text>
                                <Text style={styles.metricValue}>{selectedResortSummary?.lifts}</Text>
                            </View>

                            <View style={styles.metricCard}>
                                <Text style={styles.metricLabel}>{t('distance')}</Text>
                                <Text style={styles.metricValue}>
                                    {selectedResortSummary?.distance.toFixed(1)} <Text style={{ fontSize: 12, color: colors.textSecondary }}>{t('km')}</Text>
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Pistes Breakdown */}
                    {selectedResortSummary && (
                        <View style={{ marginBottom: SPACING.md, width: '100%' }}>
                            <Text style={styles.sectionHeader}>{t('pistes_breakdown')}</Text>
                            <View style={styles.breakdownGrid}>
                                <View style={styles.breakdownCard}>
                                    <View style={[styles.statusDot, { backgroundColor: '#00a859' }]} />
                                    <View>
                                        <Text style={styles.breakdownLabel}>{t('novice')}</Text>
                                        <Text style={styles.breakdownValue}>{t('runs_count', { count: selectedResortSummary.pistesBreakdown.novice })}</Text>
                                    </View>
                                </View>

                                <View style={styles.breakdownCard}>
                                    <View style={[styles.statusDot, { backgroundColor: '#0072bc' }]} />
                                    <View>
                                        <Text style={styles.breakdownLabel}>{t('easy')}</Text>
                                        <Text style={styles.breakdownValue}>{t('runs_count', { count: selectedResortSummary.pistesBreakdown.easy })}</Text>
                                    </View>
                                </View>

                                <View style={styles.breakdownCard}>
                                    <View style={[styles.statusDot, { backgroundColor: '#f0141e' }]} />
                                    <View>
                                        <Text style={styles.breakdownLabel}>{t('intermediate')}</Text>
                                        <Text style={styles.breakdownValue}>{t('runs_count', { count: selectedResortSummary.pistesBreakdown.intermediate })}</Text>
                                    </View>
                                </View>

                                <View style={styles.breakdownCard}>
                                    <View style={[styles.statusDot, { backgroundColor: '#000000', borderWidth: 1, borderColor: colors.border }]} />
                                    <View>
                                        <Text style={styles.breakdownLabel}>{t('expert')}</Text>
                                        <Text style={styles.breakdownValue}>{t('runs_count', { count: selectedResortSummary.pistesBreakdown.advanced })}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Lifts Breakdown */}
                    {selectedResortSummary && (
                        <View style={{ marginBottom: SPACING.md }}>
                            <Text style={styles.sectionHeader}>{t('lifts_breakdown')}</Text>
                            <View style={styles.breakdownGrid}>
                                <View style={styles.breakdownCard}>
                                    <Text style={{ fontSize: 16 }}>🚡</Text>
                                    <View>
                                        <Text style={styles.breakdownLabel}>{t('chair_lifts')}</Text>
                                        <Text style={styles.breakdownValue}>{selectedResortSummary.liftsBreakdown.chair_lift}</Text>
                                    </View>
                                </View>

                                <View style={styles.breakdownCard}>
                                    <Text style={{ fontSize: 16 }}>⛷️</Text>
                                    <View>
                                        <Text style={styles.breakdownLabel}>{t('drag_lifts')}</Text>
                                        <Text style={styles.breakdownValue}>{selectedResortSummary.liftsBreakdown.drag_lift}</Text>
                                    </View>
                                </View>

                                <View style={styles.breakdownCard}>
                                    <Text style={{ fontSize: 16 }}>🛹</Text>
                                    <View>
                                        <Text style={styles.breakdownLabel}>{t('magic_carpets')}</Text>
                                        <Text style={styles.breakdownValue}>{selectedResortSummary.liftsBreakdown.magic_carpet}</Text>
                                    </View>
                                </View>

                                <View style={styles.breakdownCard}>
                                    <Text style={{ fontSize: 16 }}>🪢</Text>
                                    <View>
                                        <Text style={styles.breakdownLabel}>{t('rope_tows')}</Text>
                                        <Text style={styles.breakdownValue}>{selectedResortSummary.liftsBreakdown.rope_tow}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Website CTA */}
                    {selectedResortSummary?.website && (
                        <View style={{ marginBottom: SPACING.md }}>
                            <Text style={styles.sectionHeader}>{t('website')}</Text>
                            <View style={styles.websiteCard}>
                                <View style={styles.websiteLeft}>
                                    <View style={styles.iconContainer}>
                                        <Globe size={20} color={colors.primaryDark} />
                                    </View>
                                    <View>
                                        <Text style={styles.websiteTitle}>{t('resort_website')}</Text>
                                        <Text style={styles.websiteSubtitle}>{t('visit_official_page')}</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    style={styles.websiteButton}
                                    onPress={() => Linking.openURL(selectedResortSummary.website!)}
                                >
                                    <Text style={styles.websiteButtonText}>{t('open')}</Text>
                                    <ExternalLink size={14} color={colors.textOnPrimary} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* Weather Forecast */}
                    {weatherData && (
                        <WeatherForecastDetails data={weatherData} />
                    )}

                    {/* Sessions Log */}
                    <View style={{ marginVertical: SPACING.md }}>
                        <View style={styles.sessionHeaderRow}>
                            <Text style={styles.sectionHeader}>{t('ski_sessions_count', { count: sessions.length })}</Text>
                            {isLoadingSessions && <ActivityIndicator size="small" color={colors.primary} />}
                        </View>

                        {sessions.length > 0 ? (
                            <View style={{ gap: SPACING.sm }}>
                                {sessions.map((session) => (
                                    <TouchableOpacity
                                        key={session.id}
                                        onPress={() => handleSessionClick(session)}
                                        style={styles.sessionItem}
                                    >
                                        <View style={styles.sessionItemLeft}>
                                            <View style={styles.sessionItemRow}>
                                                <View style={styles.sessionDot} />
                                                <Text style={styles.sessionDate}>
                                                    {new Date(session.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                </Text>
                                                <Text style={styles.sessionTime}>
                                                    {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </Text>
                                            </View>
                                            <View style={styles.sessionUserRow}>
                                                <View style={styles.avatarContainer}>
                                                    {session.user?.avatar_url ? (
                                                        <Image
                                                            source={{ uri: session.user?.avatar_url }}
                                                            style={styles.avatarImage}
                                                            resizeMode="cover"
                                                        />) : (
                                                        <Text style={styles.avatarText}>
                                                            {session.user ? (session.user.display_name || `${session.user.first_name} ${session.user.last_name}`.trim() || session.user.email) : t('user')}
                                                        </Text>
                                                    )}
                                                </View>

                                                {session.is_public ? (
                                                    <View style={styles.privacyBadge}>
                                                        <Unlock size={10} color={colors.success} />
                                                        <Text style={styles.publicText}>{t('public')}</Text>
                                                    </View>
                                                ) : (
                                                    <View style={styles.privacyBadge}>
                                                        <Lock size={10} color={colors.warning} />
                                                        <Text style={styles.privateText}>{t('private')}</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <View style={styles.sessionStatsRow}>
                                                <Text style={styles.sessionStatText}>{(session.total_distance / 1000).toFixed(2)} km</Text>
                                                <Text style={styles.sessionStatText}>{(session.max_speed * 3.6).toFixed(1)} km/h</Text>
                                                <Text style={styles.activityBadge}>{session.activity_type === 'ski' ? t('ski') : t('snowboard')}</Text>
                                            </View>
                                        </View>

                                        <ChevronRight size={20} color={colors.primary} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : !isLoadingSessions ? (
                            <View style={styles.noSessionsCard}>
                                <Activity size={32} color={colors.textLight} />
                                <Text style={styles.noSessionsTitle}>{t('no_sessions_recorded')}</Text>
                                <Text style={styles.noSessionsSubtitle}>{t('no_sessions_resort')}</Text>
                            </View>
                        ) : null}
                    </View>

                    {/* Footer Action Bar */}
                    <View style={[styles.footerActions, !isWeb && styles.footerActionsGrid]}>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => {
                                router.navigate({ pathname: '/map', params: { lat: selectedResort.Latitude, lon: selectedResort.Longitude, zoom: 12 } });
                                setTimeout(() => setSelectedResortWithCache(null), 100);
                            }}
                        >
                            <MapIcon size={18} color={colors.textOnPrimary} />
                        </TouchableOpacity>

                        {!isWeb && (
                            <>
                                <TouchableOpacity
                                    style={styles.actionButton}
                                    onPress={() => {
                                        router.navigate({ pathname: '/tracking', params: { lat: selectedResort.Latitude, lng: selectedResort.Longitude, zoom: 12 } });
                                        setTimeout(() => setSelectedResortWithCache(null), 100);
                                    }}
                                >
                                    <Navigation size={18} color={colors.textOnPrimary} />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.actionButton}
                                    onPress={() => setShowOfflineModal(true)}
                                >
                                    <Download size={18} color={colors.textOnPrimary} />
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    };

    return (
        <SafeAreaView
            edges={['top']}
            style={{ flex: 1, backgroundColor: 'transparent' }}
        >
            {(showOfflineModal && isWeb) && (
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
                {/* Search Header Container */}
                <View style={styles.searchHeader}>
                    <Text style={styles.title}>{t('ski_resorts')}</Text>
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
                    </View>
                </View>

                {/* List Body Container */}
                <ScrollView style={styles.resortList}>
                    {resorts.length > 0 && (
                        <View style={styles.matchingResortsContainer}>
                            <Text style={styles.matchingResortsHeader}>
                                {t('matching_resorts', { count: resorts.length })}
                            </Text>
                            <View style={styles.matchingResortsList}>
                                {resorts.map((resort) => {
                                    const isSelected = selectedResort?.ID === resort.ID;
                                    return (
                                        <TouchableOpacity
                                            key={resort.ID}
                                            style={[styles.resortCard, isSelected ? styles.resortCardSelected : styles.resortCardUnselected]}
                                            onPress={() => handleResortSelect(resort)}
                                        >
                                            <View style={styles.resortCardHeader}>
                                                <View>
                                                    <Text style={[styles.resortCardName, isSelected && { color: colors.primaryDark }]}>{resort.Name}</Text>
                                                    <View style={styles.resortCardLocation}>
                                                        <MapPin size={12} color={colors.textSecondary} />
                                                        <Text style={styles.resortCardCountry}>{resort.Country}</Text>
                                                    </View>
                                                </View>
                                                <View style={styles.resortCardBadge}>
                                                    <Text style={styles.resortCardBadgeText}>{t('lifts_count', { count: resort.total_lifts ?? 0 })}</Text>
                                                </View>
                                            </View>

                                            <View style={styles.resortCardFooter}>
                                                <Text style={styles.resortCardFooterText}>{t('km_runs', { distance: resort.distance_km?.toFixed(1) ?? "0.0" })}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
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
                            <Text style={styles.emptyStateSubtitle}>
                                {t('explore_resorts_desc')}
                            </Text>
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

                {/* Modal Detail View for Selected Resort */}
                <Modal
                    visible={!!selectedResort}
                    animationType="slide"
                    onRequestClose={() => setSelectedResortWithCache(null)}
                >
                    <View style={styles.modalContainer}>
                        {renderDetailsContent()}
                    </View>
                </Modal>
            </View>
        </SafeAreaView>
    );
}

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        padding: SPACING.md,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: colors.background,
    },
    searchHeader: {
        marginBottom: SPACING.md,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.textPrimary,
        marginBottom: SPACING.sm,
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