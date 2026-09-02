import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
    Camera as NativeCamera,
    GeoJSONSource as NativeGeoJSONSource,
    Layer as NativeLayer,
    Map as NativeMap,
    UserLocation,
    type CameraRef,
    type LngLatBounds,
} from '@maplibre/maplibre-react-native';
import { useTranslation } from 'react-i18next';
import { useNetworkState } from 'expo-network';
import { useIsFocused } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import { useSQLiteContext } from 'expo-sqlite';
import * as Location from 'expo-location';
import { AlertTriangle, MapPin } from 'lucide-react-native';

import { MapDetailPanel } from 'components/map/map-detail-panel';
import { OfflineMapsModal } from 'components/map/offline-maps-panel';
import { CoverageWarningModal } from 'components/tracking/coverage-warning-modal';
import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';
import { useToast } from 'context/toast.context';
import { useOfflineMaps } from 'hooks/use-offline.hook';
import api from 'interceptor/api';
import { Lift, Piste, ResortDetail } from 'models/ski-resort.model';
import { savePhotoToLocalDB } from 'tracking/database';
import { getCurrentLocation } from 'tracking/task-manager';

import { Camera } from './camera';
import { ResortSearchModal } from './resort-search-modal';
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
    liftLabelStyle,
    pisteDirectionStyle,
    pisteLabelStyle,
    trackDirectionStyle,
    trackLineStyle,
} from './map/tracking-map-layers';
import { useLiveStats } from './hooks/use-live-stats';
import { useTrackingSession } from './hooks/use-tracking-session';
import { ResortErrorModal } from './modals/resort-error-modal';
import { UploadSessionModal } from './modals/upload-session-modal';
import { TrackingHUD } from './tracking-hud';
import { TrackingControls } from './tracking-controls';

const DEFAULT_LAT = 0;
const DEFAULT_LON = 0;
const DEFAULT_ZOOM = 13;
const MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

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

    // --- State: Resort & Selection ---
    const [resort, setResort] = useState<ResortDetail>({} as ResortDetail);
    const [selectedFeature, setSelectedFeature] = useState<Piste | Lift | null>(null);
    const [chartHoverPoint, setChartHoverPoint] = useState<[number, number] | null>(null);
    const [takePictureMode, setTakePictureMode] = useState(false);
    const [searchModalVisible, setSearchModalVisible] = useState(false);
    const [isCheckingLocation, setIsCheckingLocation] = useState(false);
    const [resortErrorVisible, setResortErrorVisible] = useState(false);
    const [friendsLocations, setFriendsLocations] = useState<any[]>([]);
    const [hasShownCoverageWarning, setHasShownCoverageWarning] = useState(false);
    const [showCoverageWarningModal, setShowCoverageWarningModal] = useState(false);
    const [locationReady, setLocationReady] = useState(false);
    const [checkingLocation, setCheckingLocation] = useState(true);
    const [showOfflineModal, setShowOfflineModal] = useState(false);

    // --- Camera / Viewport ---
    const initialLat = searchParams.lat ? parseFloat(searchParams.lat as string) : DEFAULT_LAT;
    const initialLng = searchParams.lng ? parseFloat(searchParams.lng as string) : DEFAULT_LON;
    const initialZoom = searchParams.zoom ? parseFloat(searchParams.zoom as string) : DEFAULT_ZOOM;

    const firstViewStateRef = useRef({
        longitude: !isNaN(initialLng) ? initialLng : DEFAULT_LON,
        latitude: !isNaN(initialLat) ? initialLat : DEFAULT_LAT,
        zoom: !isNaN(initialZoom) ? initialZoom : DEFAULT_ZOOM,
    });

    const [viewState, setViewState] = useState({
        longitude: firstViewStateRef.current.longitude,
        latitude: firstViewStateRef.current.latitude,
        zoom: firstViewStateRef.current.zoom,
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
        activityType: 'ski',
    });

    // --- Live Stats Hook ---
    const liveStats = useLiveStats(isTracking, trackPoints, elapsedSeconds);

    // --- Offline Maps Hook ---
    const { packs, downloadingPack, downloadingProgress, downloadRegion, deletePack } =
        useOfflineMaps(MAP_STYLE_URL);

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

    // --- Friends Live Location Polling ---
    useEffect(() => {
        let interval: any;
        if (resort?.ID && !isOffline) {
            const fetchLocations = async () => {
                try {
                    const res = await api.get(`/ski-sessions/live/resort/${resort.ID}`);
                    if (res.status === 200) {
                        setFriendsLocations(res.data || []);
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
    }, [resort?.ID, isOffline]);

    // --- Handlers ---
    const handleSelectResort = async (selected: ResortDetail) => {
        setSearchModalVisible(false);
        setIsCheckingLocation(true);
        try {
            const loc = await getCurrentLocation();
            if (loc && selected.Latitude && selected.Longitude) {
                const dist = getDistanceFromLatLonInKm(
                    loc.coords.latitude,
                    loc.coords.longitude,
                    selected.Latitude,
                    selected.Longitude
                );
                if (dist > 20) {
                    setIsCheckingLocation(false);
                    setResortErrorVisible(true);
                    return;
                }
            }

            setResort(selected);
            if (selected.Latitude && selected.Longitude) {
                cameraRef.current?.easeTo({
                    center: [selected.Longitude, selected.Latitude],
                    zoom: 13,
                    duration: 400,
                });
            }

            const isDownloaded = packs.some((p) => p.name === selected.Name);
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

    if (!isFocused) {
        return <View style={[styles.container, { backgroundColor: colors.background }]} />;
    }

    return (
        <View style={styles.container}>
            {/* Top Bar - Select Resort button */}
            {!takePictureMode && !isTracking && (
                <View style={styles.topBar}>
                    <TouchableOpacity style={styles.resortSelectButton} onPress={() => setSearchModalVisible(true)}>
                        <MapPin size={18} color={colors.primary} />
                        <Text style={styles.resortSelectText}>
                            {resort?.ID ? resort.Name : t('select_resort_to_ski', 'Seleccionar estación para esquiar')}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Modals */}
            <ResortSearchModal
                visible={searchModalVisible}
                onClose={() => setSearchModalVisible(false)}
                onSelect={handleSelectResort}
            />

            <ResortErrorModal
                visible={resortErrorVisible}
                onClose={() => setResortErrorVisible(false)}
            />

            <UploadSessionModal
                visible={showUploadModal}
                onClose={() => setShowUploadModal(false)}
                resortName={resort?.Name}
                pointsCount={trackPoints.length}
                distanceKm={liveStats?.distance ?? 0}
                durationSeconds={elapsedSeconds}
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
                mapStyle={MAP_STYLE_URL}
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
                    initialViewState={{
                        center: [firstViewStateRef.current.longitude, firstViewStateRef.current.latitude],
                        zoom: firstViewStateRef.current.zoom,
                    }}
                />

                {viewState.zoom >= 10 && (
                    <>
                        {resort?.pistes && resort.pistes.length > 0 && (
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

                        {resort?.lifts && resort.lifts.length > 0 && (
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
                                    <NativeLayer {...trackLineStyle} />
                                </NativeGeoJSONSource>
                                {trackPoints.length > 1 && (
                                    <NativeGeoJSONSource id="track-direction-source" data={trackDirectionGeoJSON}>
                                        <NativeLayer {...trackDirectionStyle} />
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
            </NativeMap>

            {/* Overlays & Controls */}
            {!takePictureMode && (
                <>
                    <TrackingHUD stats={liveStats} />

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
            left: SPACING.md,
            right: SPACING.md,
            zIndex: 10,
            flexDirection: 'row',
            justifyContent: 'center',
        },
        resortSelectButton: {
            backgroundColor: colors.background,
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.md,
            borderRadius: BORDER_RADIUS.round,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
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
