import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
    Camera as NativeCamera,
    GeoJSONSource as NativeGeoJSONSource,
    Layer as NativeLayer,
    Map as NativeMap,
    RasterDEMSource as NativeRasterDEMSource,
    RasterSource as NativeRasterSource,
    UserLocation,
    type CameraRef,
    type LngLatBounds,
} from '@maplibre/maplibre-react-native';
import { useTranslation } from 'react-i18next';
import { useNetworkState } from 'expo-network';
import { useIsFocused } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import { useSQLiteContext } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { AlertTriangle, ChevronDown, Clock, Compass, Flag, Ghost, Layers, MapPin, WifiOff } from 'lucide-react-native';

import { useAuth } from 'context/auth.context';
import { socialService } from 'services/social.service';
import { meetingPointService } from 'services/meeting-point.service';
import { MeetingPoint } from 'models/meeting-point.model';

import { MapDetailPanel } from 'components/map/map-detail-panel';
import { MapStyleSelectorModal } from 'components/map/map-style-selector-modal';
import { OfflineMapsModal } from 'components/map/offline-maps-panel';
import { CoverageWarningModal } from 'components/tracking/coverage-warning-modal';
import { MeetingPointMarker } from 'components/map/meeting-point-marker';
import { MeetingPointDetailPanel } from 'components/map/meeting-point-detail-panel';
import { CreateMeetingPointModal } from 'components/map/create-meeting-point-modal';
import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';
import { DEFAULT_STYLE_BY_ACTIVITY, getMapStyleValue, MAP_STYLE_STORAGE_KEY, MapStyleId } from 'constants/map-styles';
import { useToast } from 'context/toast.context';
import { useOfflineMaps } from 'hooks/use-offline.hook';
import api from 'interceptor/api';
import { Lift, Piste, ResortDetail } from 'models/ski-resort.model';
import { ActivityType, ACTIVITY_CONFIGS } from 'models/activity.model';
import { savePhotoToLocalDB } from 'tracking/database';
import { getCurrentLocation } from 'tracking/task-manager';
import { offlineResortService } from 'services/offline-resort.service';
import { evaluateLiftClosureAlert } from 'utils/lift-closure.util';

import { Camera } from './camera';
import { ResortSearchModal } from './resort-search-modal';
import { ActivitySelectorModal } from './modals/activity-selector-modal';
import { FriendMarker } from './map/friend-marker';
import {
    buildChartHoverGeoJSON,
    buildLiftsGeoJSON,
    buildPistesGeoJSON,
    buildTrackDirectionGeoJSON,
    buildTrackGeoJSON,
    chartHoverPointStyle,
    getDistanceFromLatLonInKm,
    getLiftLineStyle,
    getPisteLineStyle,
    getTrackDirectionStyle,
    getTrackLineStyle,
    liftLabelStyle,
    pisteDirectionStyle,
    pisteLabelStyle,
} from './map/tracking-map-layers';
import { useLiveStats } from './hooks/use-live-stats';
import { useTrackingSession } from './hooks/use-tracking-session';
import { UploadSessionModal } from './modals/upload-session-modal';
import { TrackingHUD } from './tracking-hud';
import { TrackingControls } from './tracking-controls';
import { OledBlackHud } from './oled-black-hud';
import { useBatteryOptimizer } from 'hooks/use-battery-optimizer.hook';

const DEFAULT_LAT = 0;
const DEFAULT_LON = 0;
const DEFAULT_ZOOM = 13;

export default function InteractiveSkiMapNative() {
    const searchParams = useLocalSearchParams();
    const { t } = useTranslation();
    const db = useSQLiteContext();
    const { showToast } = useToast();
    const colors = useThemeColors();
    const networkState = useNetworkState();
    const isOffline = networkState?.isConnected === false;
    const isFocused = useIsFocused();

    const styles = useMemo(() => getStyles(colors), [colors]);
    const cameraRef = useRef<CameraRef>(null);
    const lastInternalParamsRef = useRef<{ lat: string; lon: string; zoom: string } | null>(null);

    // --- State: Resort, Activity & Selection ---
    const [resort, setResort] = useState<ResortDetail>({} as ResortDetail);
    const [activityType, setActivityType] = useState<ActivityType>('ski');
    const [mapStyleId, setMapStyleId] = useState<MapStyleId>('outdoor');
    const [showMapStyleModal, setShowMapStyleModal] = useState(false);
    const [is3DMode, setIs3DMode] = useState(false);
    const [activityModalVisible, setActivityModalVisible] = useState(false);
    const [selectedFeature, setSelectedFeature] = useState<Piste | Lift | null>(null);
    const [chartHoverPoint, setChartHoverPoint] = useState<[number, number] | null>(null);
    const [takePictureMode, setTakePictureMode] = useState(false);
    const [searchModalVisible, setSearchModalVisible] = useState(false);
    const [isCheckingLocation, setIsCheckingLocation] = useState(false);
    const [friendsLocations, setFriendsLocations] = useState<any[]>([]);
    const [hasShownCoverageWarning, setHasShownCoverageWarning] = useState(false);
    const [showCoverageWarningModal, setShowCoverageWarningModal] = useState(false);
    const [locationReady, setLocationReady] = useState(false);
    const [checkingLocation, setCheckingLocation] = useState(true);
    const [showOfflineModal, setShowOfflineModal] = useState(false);

    // Ghost Mode State (5.3)
    const { user: currentUser, updateUser } = useAuth();
    const [isGhostMode, setIsGhostMode] = useState<boolean>(currentUser?.ghost_mode || false);

    useEffect(() => {
        if (currentUser?.ghost_mode !== undefined) {
            setIsGhostMode(currentUser.ghost_mode);
        }
    }, [currentUser?.ghost_mode]);

    const toggleGhostMode = useCallback(async () => {
        const nextVal = !isGhostMode;
        setIsGhostMode(nextVal);
        try {
            await socialService.setGhostMode(nextVal);
            if (currentUser) {
                updateUser({ ...currentUser, ghost_mode: nextVal });
            }
            showToast(
                nextVal
                    ? t('ghost_mode_enabled_toast', 'Modo Fantasma activado: estás oculto para tus amigos en el mapa')
                    : t('ghost_mode_disabled_toast', 'Modo Fantasma desactivado: tu ubicación vuelve a ser visible'),
                'info'
            );
        } catch (err) {
            console.error('Failed to toggle ghost mode:', err);
            setIsGhostMode(!nextVal);
            showToast(t('ghost_mode_failed', 'Error al cambiar Modo Fantasma'), 'error');
        }
    }, [isGhostMode, currentUser, updateUser, showToast, t]);

    // Battery & Thermal Optimization State (Phase 7)
    const {
        oledPureBlackEnabled,
        toggleOledPureBlack,
        setOledPureBlack,
        extremeColdMode,
        batteryLevel,
    } = useBatteryOptimizer();

    // Meeting Points State (2.3)
    const [meetingPoints, setMeetingPoints] = useState<MeetingPoint[]>([]);
    const [selectedMeetingPoint, setSelectedMeetingPoint] = useState<MeetingPoint | null>(null);
    const [showCreateMeetingPointModal, setShowCreateMeetingPointModal] = useState(false);

    const fetchMeetingPoints = useCallback(async () => {
        if (isOffline) return;
        try {
            const data = await meetingPointService.list(resort?.ID);
            setMeetingPoints(data || []);
        } catch (err) {
            console.error('Failed to fetch meeting points:', err);
        }
    }, [resort?.ID, isOffline]);

    useEffect(() => {
        fetchMeetingPoints();
        const interval = setInterval(fetchMeetingPoints, 20000);
        return () => clearInterval(interval);
    }, [fetchMeetingPoints]);

    const handleDeleteMeetingPoint = useCallback(async (point: MeetingPoint) => {
        try {
            await meetingPointService.delete(point.id);
            setMeetingPoints((prev) => prev.filter((p) => p.id !== point.id));
            setSelectedMeetingPoint(null);
            showToast(t('meeting_point_deleted_success', 'Punto de encuentro eliminado'), 'success');
        } catch (err) {
            console.error('Failed to delete meeting point:', err);
            showToast(t('failed_delete_meeting_point', 'Error al eliminar punto de encuentro'), 'error');
        }
    }, [showToast, t]);

    const currentConfig = useMemo(() => ACTIVITY_CONFIGS[activityType] || ACTIVITY_CONFIGS.ski, [activityType]);

    const toggle3DMode = useCallback(() => {
        setIs3DMode((prev) => {
            const next = !prev;
            const targetPitch = next ? 55 : 0;
            setViewState((v) => {
                try {
                    cameraRef.current?.easeTo({
                        center: [v.longitude, v.latitude],
                        pitch: targetPitch,
                        bearing: next ? v.bearing : 0,
                        duration: 600,
                    });
                } catch {}
                return { ...v, pitch: targetPitch, bearing: next ? v.bearing : 0 };
            });
            return next;
        });
    }, []);

    // Load saved activity and map style preferences on mount
    useEffect(() => {
        const loadPreferences = async () => {
            try {
                const [savedActivity, savedMapStyle, activeResortId, activeActivityType] = await Promise.all([
                    AsyncStorage.getItem('LAST_SELECTED_ACTIVITY'),
                    AsyncStorage.getItem(MAP_STYLE_STORAGE_KEY),
                    AsyncStorage.getItem('ACTIVE_RESORT_ID'),
                    AsyncStorage.getItem('ACTIVE_ACTIVITY_TYPE'),
                ]);
                const preferredActivity = activeActivityType || savedActivity;
                if (preferredActivity && preferredActivity in ACTIVITY_CONFIGS) {
                    setActivityType(preferredActivity as ActivityType);
                    if (!savedMapStyle) {
                        setMapStyleId(DEFAULT_STYLE_BY_ACTIVITY[preferredActivity as ActivityType] || 'outdoor');
                    }
                }
                if (savedMapStyle && ['outdoor', 'topo', 'satellite', 'streets', 'dark'].includes(savedMapStyle)) {
                    setMapStyleId(savedMapStyle as MapStyleId);
                }
                if (activeResortId) {
                    try {
                        const res = await api.get<ResortDetail>(`/resorts/by-id/${activeResortId}`);
                        if (res.status === 200 && res.data) {
                            setResort(res.data);
                        }
                    } catch (e) {
                        console.warn('Could not fetch active resort details, trying offline storage:', e);
                        const offlineResort = await offlineResortService.getOfflineResort(activeResortId);
                        if (offlineResort) {
                            setResort(offlineResort);
                        }
                    }
                }
            } catch {}
        };
        loadPreferences();
    }, []);

    const handleSelectActivity = useCallback(async (selected: ActivityType) => {
        setActivityType(selected);
        try {
            await AsyncStorage.setItem('LAST_SELECTED_ACTIVITY', selected);
            const savedStyle = await AsyncStorage.getItem(MAP_STYLE_STORAGE_KEY);
            if (!savedStyle) {
                setMapStyleId(DEFAULT_STYLE_BY_ACTIVITY[selected] || 'outdoor');
            }
        } catch {}

        const config = ACTIVITY_CONFIGS[selected];
        if (config.requiresResort) {
            if (!resort?.ID) {
                setSearchModalVisible(true);
            }
        } else {
            setResort({} as ResortDetail);
        }
    }, [resort?.ID]);

    // --- Camera / Viewport ---
    const initialLat = searchParams.lat ? parseFloat(searchParams.lat as string) : DEFAULT_LAT;
    const initialLng = searchParams.lng ? parseFloat(searchParams.lng as string) : DEFAULT_LON;
    const initialZoom = searchParams.zoom ? parseFloat(searchParams.zoom as string) : DEFAULT_ZOOM;

    const initialCenter = useMemo<[number, number]>(() => [
        !isNaN(initialLng) ? initialLng : DEFAULT_LON,
        !isNaN(initialLat) ? initialLat : DEFAULT_LAT,
    ], [initialLng, initialLat]);

    const initialZoomVal = useMemo(() => (!isNaN(initialZoom) ? initialZoom : DEFAULT_ZOOM), [initialZoom]);

    const initialViewState = useMemo(() => ({
        center: initialCenter,
        zoom: initialZoomVal,
    }), [initialCenter, initialZoomVal]);

    const [viewState, setViewState] = useState({
        longitude: initialCenter[0],
        latitude: initialCenter[1],
        zoom: initialZoomVal,
        bearing: 0,
        pitch: 0,
    });

    // --- Tracking Engine Hook ---
    const {
        isTracking,
        isPaused,
        hasTrackData,
        isLoading,
        isStartingTracking,
        trackPoints,
        elapsedSeconds,
        showUploadModal,
        isPublic,
        setShowUploadModal,
        setIsPublic,
        toggleTracking,
        togglePause,
        discardTrack,
        uploadTrack,
    } = useTrackingSession({
        db,
        resortId: resort?.ID,
        activityType,
    });

    const hasPromptedColdWarningRef = useRef(false);
    useEffect(() => {
        if (isTracking && batteryLevel <= 20 && !hasPromptedColdWarningRef.current) {
            hasPromptedColdWarningRef.current = true;
            showToast(
                t('low_battery_cold_alert', 'Batería baja ({{level}}%). Activa Modo Frío Extremo / OLED para prevenir apagados por bajas temperaturas.', { level: batteryLevel }),
                'info',
                12000
            );
        }
    }, [isTracking, batteryLevel, showToast, t]);

    // --- Live Stats Hook ---
    const liveStats = useLiveStats(isTracking, trackPoints, elapsedSeconds);

    // --- Offline Maps Hook ---
    const { packs, downloadingPack, downloadingProgress, downloadRegion, deletePack } =
        useOfflineMaps(getMapStyleValue(mapStyleId) as any);

    // --- React to SearchParams URL updates ---
    useEffect(() => {
        const lastInternal = lastInternalParamsRef.current;
        if (
            lastInternal &&
            searchParams.lat === lastInternal.lat &&
            searchParams.lng === lastInternal.lon &&
            searchParams.zoom === lastInternal.zoom
        ) {
            return;
        }

        if (searchParams.lat && searchParams.lng) {
            const lat = parseFloat(searchParams.lat as string);
            const lng = parseFloat(searchParams.lng as string);
            const zoom = searchParams.zoom ? parseFloat(searchParams.zoom as string) : DEFAULT_ZOOM;
            if (!isNaN(lat) && !isNaN(lng)) {
                setViewState((prev) => ({
                    ...prev,
                    latitude: lat,
                    longitude: lng,
                    zoom: zoom,
                }));

                try {
                    cameraRef.current?.easeTo({
                        center: [lng, lat],
                        zoom: zoom,
                        duration: 300,
                    });
                } catch {
                    // Camera not ready yet
                }
            }
        }
    }, [searchParams.lat, searchParams.lng, searchParams.zoom]);

    // --- Location Permission & Center Map ---
    const hasCenteredMapRef = useRef(false);

    const checkLocationServices = useCallback(async () => {
        try {
            const enabled = await Location.hasServicesEnabledAsync();
            const { status } = await Location.getForegroundPermissionsAsync();

            if (enabled && status === 'granted') {
                setLocationReady(true);
                if (!hasCenteredMapRef.current) {
                    const location = await getCurrentLocation();
                    if (location) {
                        const { latitude, longitude } = location.coords;
                        setViewState((prev) => ({ ...prev, latitude, longitude, zoom: 14 }));
                        try {
                            cameraRef.current?.easeTo({ center: [longitude, latitude], zoom: 14, duration: 1000 });
                            hasCenteredMapRef.current = true;
                        } catch {}
                    }
                }
            } else {
                setLocationReady(false);
                if (status !== 'granted') {
                    await Location.requestForegroundPermissionsAsync();
                }
            }
        } catch {
            setLocationReady(false);
        } finally {
            setCheckingLocation(false);
        }
    }, []);

    useEffect(() => {
        checkLocationServices();
        const interval = setInterval(checkLocationServices, 3000);
        return () => clearInterval(interval);
    }, [checkLocationServices]);

    // --- 3D Camera Follow Mode during Active Tracking ---
    useEffect(() => {
        if (isTracking && is3DMode && trackPoints.length >= 2) {
            const last = trackPoints[trackPoints.length - 1];
            const prev = trackPoints[trackPoints.length - 2];
            const dx = last.lon - prev.lon;
            const dy = last.lat - prev.lat;
            if (Math.abs(dx) > 0.00002 || Math.abs(dy) > 0.00002) {
                const calculatedBearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
                try {
                    cameraRef.current?.easeTo({
                        center: [last.lon, last.lat],
                        bearing: calculatedBearing,
                        pitch: 55,
                        duration: 800,
                    });
                } catch {}
            }
        }
    }, [isTracking, is3DMode, trackPoints]);

    // --- Friends Live Location Polling ---
    useEffect(() => {
        let interval: any;
        if (currentConfig.requiresResort && resort?.ID && !isOffline) {
            const fetchLocations = async () => {
                try {
                    const res = await api.get('/friends/live-locations', {
                        params: { resort_id: resort.ID },
                    });
                    if (res.status === 200 && res.data) {
                        setFriendsLocations(res.data.data || res.data || []);
                    }
                } catch (err) {
                    console.error('Failed to fetch friends live locations:', err);
                }
            };
            fetchLocations();
            interval = setInterval(fetchLocations, 15000);
        } else {
            setFriendsLocations([]);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [currentConfig.requiresResort, resort?.ID, isOffline]);

    // --- Lift Closure Alert Status (1.3) ---
    const liftClosureStatus = useMemo(() => {
        if (!currentConfig.requiresResort || !resort?.lifts || resort.lifts.length === 0) {
            return { alertActive: false, message: '', urgent: false, closingTimeStr: '', recommendedDepartureStr: '' };
        }
        return evaluateLiftClosureAlert(resort.lifts, resort);
    }, [currentConfig.requiresResort, resort?.lifts, resort]);

    // --- Handlers ---
    const handleSelectResort = async (selected: ResortDetail) => {
        setSearchModalVisible(false);
        setIsCheckingLocation(true);
        try {
            let fullResort = selected;
            if (!selected.pistes || selected.pistes.length === 0) {
                const offline = await offlineResortService.getOfflineResort(selected.ID);
                if (offline) {
                    fullResort = offline;
                } else if (!isOffline) {
                    try {
                        const res = await api.get<ResortDetail>(`/resorts/by-id/${selected.ID}`);
                        if (res.status === 200 && res.data) {
                            fullResort = res.data;
                        }
                    } catch {}
                }
            }

            const loc = await getCurrentLocation();
            if (loc && fullResort.Latitude && fullResort.Longitude) {
                const dist = getDistanceFromLatLonInKm(
                    loc.coords.latitude,
                    loc.coords.longitude,
                    fullResort.Latitude,
                    fullResort.Longitude
                );
                // Informative notice without blocking geographic tracking
                if (dist > 20) {
                    showToast(
                        t('resort_distance_notice', 'Estás a {{km}} km de la estación seleccionada', {
                            km: Math.round(dist),
                        }),
                        'info'
                    );
                }
            }

            setResort(fullResort);
            await AsyncStorage.setItem('LAST_ACTIVE_RESORT_ID', fullResort.ID);

            if (fullResort.Latitude && fullResort.Longitude) {
                cameraRef.current?.easeTo({
                    center: [fullResort.Longitude, fullResort.Latitude],
                    zoom: 13,
                    duration: 400,
                });
            }

            const isDownloaded =
                (await offlineResortService.isResortOffline(fullResort.ID)) ||
                packs.some((p) => p.name === fullResort.Name);
            if (!isDownloaded && !hasShownCoverageWarning) {
                setShowCoverageWarningModal(true);
                setHasShownCoverageWarning(true);
            }
        } catch (err) {
            console.error('Error verifying resort distance:', err);
        } finally {
            setIsCheckingLocation(false);
        }
    };

    const handleSOS = () => {
        if (viewState.latitude && viewState.longitude) {
            const url = `https://www.google.com/maps/search/?api=1&query=${viewState.latitude},${viewState.longitude}`;
            Share.share({
                message: t('sos_message', '¡Emergencia / SOS! Ésta es mi ubicación actual: {{url}}', { url }),
            });
        } else {
            showToast(t('no_location', 'No se ha podido obtener la ubicación para enviar.'));
        }
    };

    const handleNativeFeaturePress = useCallback(
        (e: any) => {
            const feature = e?.features && e.features[0];
            if (feature && feature.properties?.id) {
                const featureId = feature.properties.id;
                const foundLift = resort.lifts?.find((l) => l.ID === featureId);
                if (foundLift) {
                    setChartHoverPoint(null);
                    setSelectedFeature(foundLift);
                    return;
                }
                const foundPiste = resort.pistes?.find((p) => p.ID === featureId);
                if (foundPiste) {
                    setChartHoverPoint(null);
                    setSelectedFeature(foundPiste);
                    return;
                }
            }
        },
        [resort]
    );

    const handleNativeRegionDidChange = useCallback((e: any) => {
        const ne = e?.nativeEvent || e;
        if (!ne) return;

        const zoom = ne.zoom ?? ne.properties?.zoom;
        const center = ne.center ?? ne.geometry?.coordinates;

        if (center && Array.isArray(center) && center.length >= 2) {
            const [lon, lat] = center;
            const finalZoom = zoom !== undefined ? zoom : DEFAULT_ZOOM;

            setViewState((prev) => ({
                ...prev,
                longitude: lon,
                latitude: lat,
                zoom: finalZoom,
            }));

            lastInternalParamsRef.current = {
                lat: lat.toString(),
                lon: lon.toString(),
                zoom: finalZoom.toString(),
            };
        }
    }, []);

    const handleDownloadCurrentView = (customName: string) => {
        const delta = 0.08;
        const bounds: LngLatBounds = [
            viewState.longitude - delta,
            viewState.latitude - delta,
            viewState.longitude + delta,
            viewState.latitude + delta,
        ];
        downloadRegion(customName, bounds, 10, 16);
    };

    // --- GeoJSON Sources Memoization ---
    const pistesGeoJSON = useMemo(() => buildPistesGeoJSON(resort), [resort]);
    const liftsGeoJSON = useMemo(() => buildLiftsGeoJSON(resort), [resort]);
    const trackGeoJSON = useMemo(() => buildTrackGeoJSON(trackPoints), [trackPoints]);
    const trackDirectionGeoJSON = useMemo(() => buildTrackDirectionGeoJSON(trackPoints), [trackPoints]);
    const chartHoverGeoJSON = useMemo(() => buildChartHoverGeoJSON(chartHoverPoint), [chartHoverPoint]);

    // --- Dynamic Layer Styles ---
    const dynamicPisteLineStyle = useMemo(() => getPisteLineStyle(selectedFeature?.ID), [selectedFeature?.ID]);
    const dynamicLiftLineStyle = useMemo(() => getLiftLineStyle(selectedFeature?.ID), [selectedFeature?.ID]);
    const dynamicTrackLineStyle = useMemo(() => getTrackLineStyle(activityType), [activityType]);
    const dynamicTrackDirectionStyle = useMemo(() => getTrackDirectionStyle(activityType), [activityType]);

    if (!isFocused) {
        return <View style={[styles.container, { backgroundColor: colors.background }]} />;
    }

    if (oledPureBlackEnabled && isTracking) {
        return (
            <OledBlackHud
                stats={liveStats}
                isTracking={isTracking}
                isPaused={isPaused}
                activityType={activityType}
                onTogglePause={togglePause}
                onStopTracking={toggleTracking}
                onExitOledMode={() => setOledPureBlack(false)}
            />
        );
    }

    return (
        <View style={styles.container}>
            {/* Top Bar - Activity, Resort & Layer Selectors */}
            {(!takePictureMode || !isTracking) && (
                <View style={styles.topBar}>
                    <View style={styles.topBarLeft}>
                        {/* Activity Selector Button */}
                        <TouchableOpacity
                            style={[
                                styles.topBarButton,
                                isTracking && styles.topBarButtonTracking
                            ]}
                            onPress={() => !isTracking && setActivityModalVisible(true)}
                            activeOpacity={isTracking ? 1 : 0.7}
                            disabled={isTracking}
                        >
                            <Text style={styles.activityEmoji}>{currentConfig.icon}</Text>
                            <Text style={styles.topBarButtonText} numberOfLines={1}>
                                {t(currentConfig.labelKey, currentConfig.defaultLabel)}
                            </Text>
                            {!isTracking && <ChevronDown size={12} color={colors.textSecondary} style={{ marginLeft: 2 }} />}
                        </TouchableOpacity>

                        {/* Resort Selector Button if required, otherwise Free Mode badge */}
                        {currentConfig.requiresResort ? (
                            <TouchableOpacity
                                style={[
                                    styles.topBarButton,
                                    styles.resortButton,
                                    isTracking && styles.topBarButtonTracking
                                ]}
                                onPress={() => !isTracking && setSearchModalVisible(true)}
                                activeOpacity={isTracking ? 1 : 0.7}
                                disabled={isTracking}
                            >
                                <MapPin size={13} color={colors.primary} />
                                <Text style={styles.topBarButtonText} numberOfLines={1}>
                                    {resort?.ID ? resort.Name : t('select_resort_to_ski', 'Seleccionar')}
                                </Text>
                                {!isTracking && <ChevronDown size={12} color={colors.textSecondary} style={{ marginLeft: 2 }} />}
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.freeModeBadge}>
                                <Compass size={13} color={colors.success || '#10b981'} />
                                <Text style={[styles.freeModeText, { color: colors.success || '#10b981' }]} numberOfLines={1}>
                                    {t('free_mode', 'Libre')}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.topBarRight}>
                        {/* Meeting Point Button (2.3) */}
                        <TouchableOpacity
                            style={[
                                styles.layerButton,
                                meetingPoints.length > 0 && { borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.12)' }
                            ]}
                            onPress={() => setShowCreateMeetingPointModal(true)}
                            activeOpacity={0.7}
                        >
                            <Flag size={18} color={meetingPoints.length > 0 ? '#f59e0b' : colors.textPrimary} />
                        </TouchableOpacity>

                        {/* Ghost Mode Toggle Button (5.3) */}
                        <TouchableOpacity
                            style={[
                                styles.layerButton,
                                isGhostMode && { backgroundColor: '#334155', borderColor: '#475569' }
                            ]}
                            onPress={toggleGhostMode}
                            activeOpacity={0.7}
                        >
                            <Ghost size={18} color={isGhostMode ? '#38bdf8' : colors.textPrimary} />
                        </TouchableOpacity>

                        {/* Map Layers Selector Button */}
                        <TouchableOpacity
                            style={styles.layerButton}
                            onPress={() => setShowMapStyleModal(true)}
                            activeOpacity={0.7}
                        >
                            <Layers size={18} color={colors.textPrimary} />
                        </TouchableOpacity>

                        {/* 2D / 3D Mode Toggle Button */}
                        <TouchableOpacity
                            style={[
                                styles.layerButton,
                                is3DMode && { backgroundColor: colors.primary, borderColor: colors.primary }
                            ]}
                            onPress={toggle3DMode}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.dimToggleText, is3DMode && { color: '#FFFFFF' }]}>
                                {is3DMode ? '3D' : '2D'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Offline, Ghost Mode and Closure Status Banners */}
            {!takePictureMode && (
                <View style={styles.statusBannersContainer} pointerEvents="box-none">
                    {isGhostMode && (
                        <View style={styles.ghostBanner}>
                            <Ghost size={12} color="#38bdf8" />
                            <Text style={styles.ghostBannerText}>
                                {t('ghost_mode_active', 'Modo Fantasma activo (oculto en el mapa)')}
                            </Text>
                        </View>
                    )}

                    {isOffline && (
                        <View style={styles.offlineBanner}>
                            <WifiOff size={12} color="#b45309" />
                            <Text style={styles.offlineBannerText}>
                                {t('offline_slopes_ready', 'Modo 100% Offline activo')}
                            </Text>
                        </View>
                    )}

                    {liftClosureStatus.alertActive && (
                        <View style={[styles.liftClosureBanner, liftClosureStatus.urgent && styles.liftClosureBannerUrgent]}>
                            <Clock size={13} color={liftClosureStatus.urgent ? '#dc2626' : '#b45309'} />
                            <Text style={[styles.liftClosureText, liftClosureStatus.urgent && styles.liftClosureTextUrgent]} numberOfLines={2}>
                                {liftClosureStatus.message}
                            </Text>
                        </View>
                    )}
                </View>
            )}

            {/* Modals */}
            <ActivitySelectorModal
                visible={activityModalVisible}
                onClose={() => setActivityModalVisible(false)}
                selectedActivity={activityType}
                onSelect={handleSelectActivity}
            />

            <MapStyleSelectorModal
                visible={showMapStyleModal}
                onClose={() => setShowMapStyleModal(false)}
                selectedStyle={mapStyleId}
                onSelect={async (newStyle) => {
                    setMapStyleId(newStyle);
                    try {
                        await AsyncStorage.setItem(MAP_STYLE_STORAGE_KEY, newStyle);
                    } catch {}
                }}
            />

            <ResortSearchModal
                visible={searchModalVisible}
                onClose={() => setSearchModalVisible(false)}
                onSelect={handleSelectResort}
            />

            <UploadSessionModal
                visible={showUploadModal}
                onClose={() => setShowUploadModal(false)}
                resortName={resort?.Name}
                activityType={activityType}
                pointsCount={trackPoints.length}
                distanceKm={liveStats?.distance ?? 0}
                durationSeconds={elapsedSeconds}
                elevationGain={liveStats?.elevationGain}
                maxSpeed={liveStats?.maxSpeed}
                avgSpeed={liveStats?.avgSpeed}
                isPublic={isPublic}
                onTogglePublic={() => setIsPublic(!isPublic)}
                onDiscard={discardTrack}
                onUpload={uploadTrack}
                isLoading={isLoading}
            />

            {/* Loading Location Check */}
            {isCheckingLocation && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>{t('checking_location', 'Comprobando ubicación...')}</Text>
                </View>
            )}

            {/* Camera View */}
            {takePictureMode && (
                <View style={styles.cameraOverlay}>
                    <Camera
                        onClose={() => setTakePictureMode(false)}
                        onSavePhoto={async (uri) => {
                            try {
                                await savePhotoToLocalDB(uri, db);
                            } catch (e) {
                                showToast('Error saving photo locally: ' + e, 'error');
                            }
                        }}
                    />
                </View>
            )}

            {/* Native Map */}
            <NativeMap
                style={{ flex: 1 }}
                mapStyle={getMapStyleValue(mapStyleId) as any}
                onRegionDidChange={handleNativeRegionDidChange}
                attribution={false}
                logo={false}
                androidView="texture"
            >
                <UserLocation heading={true} />
                <NativeCamera
                    ref={cameraRef}
                    minZoom={10}
                    maxZoom={17}
                    pitch={viewState.pitch}
                    bearing={viewState.bearing}
                    initialViewState={initialViewState}
                />

                <NativeRasterDEMSource
                    id="maplibre-dem"
                    tiles={['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']}
                    encoding="terrarium"
                    tileSize={256}
                    maxzoom={14}
                />

                <NativeRasterSource
                    id="terrain-hillshade-source"
                    tiles={[
                        'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
                    ]}
                    tileSize={256}
                    maxzoom={17}
                >
                    <NativeLayer
                        id="terrain-hillshade-layer"
                        type="raster"
                        style={{
                            rasterOpacity: is3DMode ? 0.38 : 0.18,
                        }}
                    />
                </NativeRasterSource>

                {viewState.zoom >= 10 && (
                    <>
                        {currentConfig.requiresResort && resort?.pistes && resort.pistes.length > 0 && (
                            <NativeGeoJSONSource
                                id="pistes-source"
                                data={pistesGeoJSON}
                                onPress={handleNativeFeaturePress}
                                hitbox={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            >
                                <NativeLayer {...dynamicPisteLineStyle} />
                                <NativeLayer {...pisteLabelStyle} />
                                <NativeLayer {...pisteDirectionStyle} />
                            </NativeGeoJSONSource>
                        )}

                        {currentConfig.requiresResort && resort?.lifts && resort.lifts.length > 0 && (
                            <NativeGeoJSONSource
                                id="lifts-source"
                                data={liftsGeoJSON}
                                onPress={handleNativeFeaturePress}
                                hitbox={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            >
                                <NativeLayer {...dynamicLiftLineStyle} />
                                <NativeLayer {...liftLabelStyle} />
                            </NativeGeoJSONSource>
                        )}

                        {trackPoints.length > 0 && (
                            <>
                                <NativeGeoJSONSource id="track-source" data={trackGeoJSON}>
                                    <NativeLayer {...dynamicTrackLineStyle} />
                                </NativeGeoJSONSource>
                                {trackPoints.length > 1 && (
                                    <NativeGeoJSONSource id="track-direction-source" data={trackDirectionGeoJSON}>
                                        <NativeLayer {...dynamicTrackDirectionStyle} />
                                    </NativeGeoJSONSource>
                                )}
                            </>
                        )}
                    </>
                )}

                {chartHoverGeoJSON && (
                    <NativeGeoJSONSource id="chart-hover-source" data={chartHoverGeoJSON}>
                        <NativeLayer {...chartHoverPointStyle} />
                    </NativeGeoJSONSource>
                )}

                {friendsLocations.map((friend) => (
                    <FriendMarker key={friend.id} friend={friend} />
                ))}

                {meetingPoints.map((point) => (
                    <MeetingPointMarker
                        key={point.id}
                        point={point}
                        onPress={(p) => setSelectedMeetingPoint(p)}
                    />
                ))}
            </NativeMap>

            {/* Overlays & Controls */}
            {!takePictureMode && (
                <>
                    <TrackingHUD
                        stats={liveStats}
                        activityType={activityType}
                        speedUnit={currentConfig.speedUnit}
                        onToggleOled={toggleOledPureBlack}
                    />

                    {selectedMeetingPoint && (
                        <MeetingPointDetailPanel
                            point={selectedMeetingPoint}
                            userLocation={
                                trackPoints.length > 0
                                    ? { latitude: trackPoints[trackPoints.length - 1].lat, longitude: trackPoints[trackPoints.length - 1].lon }
                                    : { latitude: viewState.latitude, longitude: viewState.longitude }
                            }
                            onClose={() => setSelectedMeetingPoint(null)}
                            onNavigate={(p) => {
                                try {
                                    cameraRef.current?.easeTo({
                                        center: [p.longitude, p.latitude],
                                        zoom: 15,
                                        duration: 1000,
                                    });
                                } catch {}
                                showToast(
                                    t('navigating_to_meeting_point', 'Centrando mapa en {{title}}', { title: p.title }),
                                    'info'
                                );
                            }}
                            onDelete={handleDeleteMeetingPoint}
                        />
                    )}

                    {showCreateMeetingPointModal && (
                        <CreateMeetingPointModal
                            visible={showCreateMeetingPointModal}
                            resortId={resort?.ID || 'general'}
                            resortName={resort?.Name}
                            initialCoords={{
                                latitude:
                                    trackPoints.length > 0
                                        ? trackPoints[trackPoints.length - 1].lat
                                        : viewState.latitude,
                                longitude:
                                    trackPoints.length > 0
                                        ? trackPoints[trackPoints.length - 1].lon
                                        : viewState.longitude,
                            }}
                            onClose={() => setShowCreateMeetingPointModal(false)}
                            onCreated={(p) => {
                                setMeetingPoints((prev) => [p, ...prev]);
                                setSelectedMeetingPoint(p);
                            }}
                        />
                    )}

                    {selectedFeature && (
                        <MapDetailPanel
                            data={selectedFeature}
                            onClose={() => {
                                setSelectedFeature(null);
                                setChartHoverPoint(null);
                            }}
                            onChartPointSelected={setChartHoverPoint}
                        />
                    )}

                    <TrackingControls
                        isTracking={isTracking}
                        isPaused={isPaused}
                        isStartingTracking={isStartingTracking}
                        hasTrackData={hasTrackData}
                        hasOfflinePacks={packs.length > 0}
                        isOledActive={oledPureBlackEnabled}
                        onToggleOled={toggleOledPureBlack}
                        onToggleTracking={toggleTracking}
                        onTogglePause={togglePause}
                        onSOS={handleSOS}
                        onOpenCamera={() => setTakePictureMode(true)}
                        onOpenOfflineModal={() => setShowOfflineModal(true)}
                    />

                    {showOfflineModal && (
                        <OfflineMapsModal
                            onClose={() => setShowOfflineModal(false)}
                            packs={packs}
                            downloadingPack={downloadingPack}
                            downloadProgress={downloadingProgress}
                            onDownloadCurrentArea={handleDownloadCurrentView}
                            onDeletePack={deletePack}
                            currentResortName={resort?.Name}
                            currentResortId={resort?.ID}
                            mapStyleUrl={getMapStyleValue(mapStyleId) as string}
                        />
                    )}
                </>
            )}

            {showCoverageWarningModal && resort?.Name && (
                <CoverageWarningModal
                    resortName={resort.Name}
                    onDismiss={() => setShowCoverageWarningModal(false)}
                    onDownload={() => {
                        setShowCoverageWarningModal(false);
                        setShowOfflineModal(true);
                    }}
                />
            )}

            {/* GPS Required Overlay */}
            {!locationReady && !checkingLocation && (
                <View style={[styles.locationOverlay, { backgroundColor: colors.background }]}>
                    <AlertTriangle size={64} color={colors.warning} style={{ marginBottom: SPACING.lg }} />
                    <Text style={[styles.locationOverlayTitle, { color: colors.textPrimary }]}>
                        {t('gps_required', 'GPS Required')}
                    </Text>
                    <Text style={[styles.locationOverlayText, { color: colors.textSecondary }]}>
                        {t(
                            'gps_required_desc',
                            'You must enable device location and grant permissions to the app in order to use the Tracker.'
                        )}
                    </Text>
                    <TouchableOpacity
                        style={[styles.locationOverlayButton, { backgroundColor: colors.primary }]}
                        onPress={checkLocationServices}
                    >
                        <Text style={[styles.locationOverlayButtonText, { color: colors.textOnPrimary }]}>
                            {t('check_again', 'Check Again')}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const getStyles = (colors: typeof LIGHT_COLORS) =>
    StyleSheet.create({
        container: {
            width: '100%',
            height: '100%',
            position: 'relative',
            flex: 1,
            backgroundColor: colors.background,
        },
        topBar: {
            position: 'absolute',
            top: SPACING.xl,
            left: SPACING.sm,
            right: SPACING.sm,
            zIndex: 10,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        statusBannersContainer: {
            position: 'absolute',
            top: SPACING.xl + 46,
            left: SPACING.sm,
            right: SPACING.sm,
            zIndex: 9,
            gap: 6,
        },
        offlineBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#fef3c7',
            paddingVertical: 4,
            paddingHorizontal: 9,
            borderRadius: BORDER_RADIUS.md,
            borderWidth: 1,
            borderColor: '#fde68a',
            ...SHADOWS.sm,
            alignSelf: 'flex-start',
        },
        offlineBannerText: {
            fontSize: 11,
            fontWeight: '700',
            color: '#b45309',
        },
        ghostBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#1e293b',
            paddingVertical: 4,
            paddingHorizontal: 9,
            borderRadius: BORDER_RADIUS.md,
            borderWidth: 1,
            borderColor: '#334155',
            ...SHADOWS.sm,
            alignSelf: 'flex-start',
        },
        ghostBannerText: {
            fontSize: 11,
            fontWeight: '700',
            color: '#f1f5f9',
        },
        liftClosureBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#fffbeb',
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: BORDER_RADIUS.md,
            borderWidth: 1,
            borderColor: '#f59e0b',
            ...SHADOWS.sm,
        },
        liftClosureBannerUrgent: {
            backgroundColor: '#fef2f2',
            borderColor: '#ef4444',
        },
        liftClosureText: {
            fontSize: 11,
            fontWeight: '600',
            color: '#92400e',
            flex: 1,
        },
        liftClosureTextUrgent: {
            color: '#b91c1c',
        },
        topBarLeft: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            flex: 1,
            marginRight: 6,
            overflow: 'hidden',
        },
        topBarRight: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
        },
        topBarButton: {
            backgroundColor: colors.surface,
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: SPACING.xs + 2,
            paddingHorizontal: SPACING.sm + 2,
            borderRadius: BORDER_RADIUS.round,
            ...SHADOWS.sm,
            borderWidth: 1,
            borderColor: colors.border,
            flexShrink: 1,
            height: 38,
        },
        resortButton: {
            maxWidth: 150,
        },
        topBarButtonTracking: {
            backgroundColor: colors.surface,
            borderColor: colors.primary + '50',
        },
        topBarButtonText: {
            marginLeft: SPACING.xs,
            fontSize: 12,
            fontWeight: '600',
            color: colors.textPrimary,
            flexShrink: 1,
        },
        activityEmoji: {
            fontSize: 14,
        },
        freeModeBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            paddingVertical: SPACING.xs + 2,
            paddingHorizontal: SPACING.sm,
            borderRadius: BORDER_RADIUS.round,
            borderWidth: 1,
            borderColor: colors.border,
            ...SHADOWS.sm,
            gap: 4,
            height: 38,
        },
        freeModeText: {
            fontSize: 11,
            fontWeight: '600',
        },
        layerButton: {
            backgroundColor: colors.surface,
            padding: SPACING.xs,
            borderRadius: BORDER_RADIUS.round,
            ...SHADOWS.sm,
            borderWidth: 1,
            borderColor: colors.border,
            justifyContent: 'center',
            alignItems: 'center',
            width: 38,
            height: 38,
        },
        dimToggleText: {
            fontSize: 12,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        resortSelectButton: {
            backgroundColor: colors.surface,
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.md,
            borderRadius: BORDER_RADIUS.round,
            ...SHADOWS.sm,
            borderWidth: 1,
            borderColor: colors.border,
        },
        resortSelectText: {
            marginLeft: SPACING.sm,
            fontSize: 14,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        cameraOverlay: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
        },
        loadingOverlay: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            justifyContent: 'center',
            alignItems: 'center',
        },
        loadingText: {
            marginTop: SPACING.md,
            fontSize: 16,
            fontWeight: 'bold',
            color: '#FFFFFF',
        },
        locationOverlay: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            padding: SPACING.xl,
            zIndex: 9999,
        },
        locationOverlayTitle: {
            fontSize: 24,
            fontWeight: 'bold',
            marginBottom: SPACING.md,
            textAlign: 'center',
        },
        locationOverlayText: {
            fontSize: 16,
            textAlign: 'center',
            marginBottom: SPACING.xl,
            lineHeight: 24,
        },
        locationOverlayButton: {
            paddingVertical: SPACING.md,
            paddingHorizontal: SPACING.xl,
            borderRadius: BORDER_RADIUS.md,
            ...SHADOWS.md,
        },
        locationOverlayButtonText: {
            fontSize: 16,
            fontWeight: 'bold',
        },
    });
