import {
    LngLatBounds,
    Camera as NativeCamera,
    GeoJSONSource as NativeGeoJSONSource,
    Layer as NativeLayer,
    Map as NativeMap
} from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import { Activity, Download, Play, Square, Upload, Camera as CameraIcon, Pause } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MapDetailPanel } from 'components/map/map-detail-panel';
import { OfflineMapsModal } from 'components/map/offline-maps-panel';
import { API_BASE_URL } from 'constants/constants';
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from 'constants/theme';
import { useOfflineMaps } from 'hooks/use-offline.hook';
import api from 'interceptor/api';
import { Lift, Piste, ResortDetail } from 'models/ski-resort.model';
import { User } from 'models/user.model';
import { useTranslation } from 'react-i18next';
import { clearTrack, getAllPhotos, getAllPoints, initDB, savePhotoToLocalDB } from 'tracking/database';
import { getCurrentLocation, startTracking, stopTracking } from 'tracking/task-manager';
import { Camera } from './camera';

const LOCATION_TASK_NAME = 'ski-background-location-task';

export default function InteractiveSkiMapNative() {
    const searchParams = useLocalSearchParams();
    const { t } = useTranslation();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

    const lastInternalParamsRef = useRef<{ lat: string; lon: string; zoom: string } | null>(null);
    const mapStyleUrl = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

    const [resort, setResort] = useState<ResortDetail>({} as ResortDetail);
    const [selectedFeature, setSelectedFeature] = useState<Piste | Lift | null>(null);
    const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);
    const [takePictureMode, setTakePictureMode] = useState(false);

    // --- Tracking status ---
    const [isTracking, setIsTracking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [hasTrackData, setHasTrackData] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [trackPoints, setTrackPoints] = useState<any[]>([]);
    const [isPublic, setIsPublic] = useState(true);
    const [viewState, setViewState] = useState({
        longitude: parseFloat(searchParams.lng as string || '-3.971953'),
        latitude: parseFloat(searchParams.lat as string || '40.797891'),
        zoom: parseFloat(searchParams.zoom as string || '13'),
        bearing: 0,
        pitch: 0
    });
    const [showOfflineModal, setShowOfflineModal] = useState(false);
    const {
        packs,
        downloadingPack,
        downloadingProgress,
        downloadRegion,
        deletePack,
    } = useOfflineMaps(mapStyleUrl);

    useEffect(() => {
        const lastInternal = lastInternalParamsRef.current;
        if (lastInternal &&
            searchParams.lat === lastInternal.lat &&
            searchParams.lng === lastInternal.lon &&
            searchParams.zoom === lastInternal.zoom) {
            return;
        }

        if (searchParams.lat && searchParams.lng) {
            const lat = parseFloat(searchParams.lat as string);
            const lng = parseFloat(searchParams.lng as string);
            if (!isNaN(lat) && !isNaN(lng)) {
                setViewState(prev => ({
                    ...prev,
                    latitude: lat,
                    longitude: lng,
                    zoom: searchParams.zoom ? parseFloat(searchParams.zoom as string) : prev.zoom
                }));
            }
        }
    }, [searchParams.lat, searchParams.lng, searchParams.zoom]);

    // --- Database initialization and tracking status on mount ---
    useEffect(() => {
        setupDatabaseAndCheckStatus();
        fetchResortDetails();
    }, []);

    // --- Polling to refresh track points in real-time while recording ---
    useEffect(() => {
        let interval: number;
        if (isTracking && !isPaused) {
            interval = setInterval(() => {
                loadTrackPoints();
            }, 5000);
        }
        return () => clearInterval(interval);
    }, [isTracking, isPaused]);

    const setupDatabaseAndCheckStatus = async () => {
        try {
            const db = await SQLite.openDatabaseAsync('ski_tracker.db', {useNewConnection: true});
            await initDB(db);

            if (Platform.OS !== 'web') {
                const registered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
                setIsTracking(registered);
            }
            await loadTrackPoints();
        } catch (e) {
            console.error("Error setting up tracking DB:", e);
        }
    };

    const loadTrackPoints = async () => {
        try {
            const db = await SQLite.openDatabaseAsync('ski_tracker.db', {useNewConnection: true});
            const points = await getAllPoints(db);
            setTrackPoints(points);
            setHasTrackData(points.length > 0);
        } catch (e) {
            console.error("Error loading track points:", e);
        }
    };

    // --- Fetchers ---
    const fetchResortDetails = async (lon?: number, lat?: number) => {
        try {
            let latitude = lat ?? searchParams.lat;
            let longitude = lon ?? searchParams.lng;

            if (!latitude || !longitude) {
                const location = await getCurrentLocation();
                if (location) {
                    latitude = location.coords.latitude;
                    longitude = location.coords.longitude;
                }
            }

            if (!latitude || !longitude) {
                // If still no location, check cache
                const cached = await AsyncStorage.getItem('LAST_RESORT_DETAILS');
                if (cached) {
                    setResort(JSON.parse(cached));
                }
                return;
            }

            const request = await api.get<ResortDetail>(`${API_BASE_URL}/resorts/closeness`, {
                params: { lat: latitude, lon: longitude },
            });
            if (request.status === 200) {
                setResort(request.data);
                await AsyncStorage.setItem('LAST_RESORT_DETAILS', JSON.stringify(request.data));
            }
        } catch (error) {
            console.error("Error fetching resort details, trying cache:", error);
            const cached = await AsyncStorage.getItem('LAST_RESORT_DETAILS');
            if (cached) {
                try {
                    setResort(JSON.parse(cached));
                } catch (e) {
                    console.error("Error parsing cached resort details:", e);
                }
            }
        }
    };

    // --- Tracking control ---
    const handleToggleTracking = async () => {
        if (isTracking) {
            await stopTracking();
            setIsTracking(false);
            setIsPaused(false);
            await loadTrackPoints();
        } else {
            let trackingTime = 5000;
            try {
                const userRequest = await api.get<User>('/users/me');
                if (userRequest.status === 200 && userRequest.data) {
                    trackingTime = userRequest.data.time_tracking || 5000;
                    await AsyncStorage.setItem('CACHED_TIME_TRACKING', trackingTime.toString());
                }
            } catch (e) {
                console.warn("Could not fetch user settings for tracking time, loading from cache:", e);
                const cachedTime = await AsyncStorage.getItem('CACHED_TIME_TRACKING');
                if (cachedTime) {
                    trackingTime = parseInt(cachedTime);
                }
            }

            const resortIdToUse = resort.ID || "sierra-nevada";
            try {
                const started = await startTracking(resortIdToUse, trackingTime);
                if (!started) {
                    alert(t('tracking_start_permission_denied'));
                    return;
                }
                setIsTracking(true);
                setIsPaused(false);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                if (message.startsWith('FOREGROUND_SERVICE_MISSING')) {
                    alert(t('tracking_start_foreground_service_required'));
                } else {
                    alert(t('tracking_start_failed'));
                }
            }
        }
    };

    const handleTogglePause = async () => {
        if (!isTracking) return;

        if (isPaused) {
            // Resume tracking updates
            let trackingTime = 5000;
            const cachedTime = await AsyncStorage.getItem('CACHED_TIME_TRACKING');
            if (cachedTime) {
                trackingTime = parseInt(cachedTime);
            }
            const resortIdToUse = resort.ID || "sierra-nevada";
            try {
                const started = await startTracking(resortIdToUse, trackingTime);
                if (started) {
                    setIsPaused(false);
                } else {
                    alert(t('tracking_resume_failed'));
                }
            } catch (err) {
                alert(t('tracking_resume_failed'));
            }
        } else {
            // Pause background location tasks to save battery
            await stopTracking();
            setIsPaused(true);
        }
    };

    // --- Upload track to backend ---
    const handleUploadTrack = async () => {
        setIsLoading(true);
        try {
            const db = await SQLite.openDatabaseAsync('ski_tracker.db', {useNewConnection: true});
            const points = await getAllPoints(db);
            const photos = await getAllPhotos(db);

            if (points.length === 0) {
                alert(t('no_tracking_data'));
                setIsLoading(false);
                return;
            }

            const formData = new FormData();
            const resortIdToUse = resort.ID || points[0].resort_id || "sierra-nevada";

            // 1. Start session
            const startResponse = await api.post(`${API_BASE_URL}/ski-sessions`, {
                resortId: resortIdToUse,
                isPublic: isPublic
            });

            if (startResponse.status !== 201) {
                throw new Error("Failed to start session on backend");
            }

            const sessionId = startResponse.data.sessionId;

            photos.forEach((photo, index) => {
                formData.append('photos', {
                    uri: (photo as any).uri,
                    type: 'image/jpeg',
                    name: `session_photo_${index}.jpg`,
                } as any);
            });

            // 2. Upload points
            const payload = {
                points: points.map(p => ({
                    lat: p.lat,
                    lon: p.lon,
                    altitude: p.alt,
                    speed: p.speed,
                    timestamp: new Date(p.timestamp).toISOString()
                })),
            };

            formData.append('points', JSON.stringify(payload));

            const pointsResponse = await api.post(`${API_BASE_URL}/ski-sessions/${sessionId}/points`, formData);

            if (pointsResponse.status !== 200) {
                throw new Error("Failed to upload points");
            }

            // 3. Finish session
            const finishResponse = await api.post(`${API_BASE_URL}/ski-sessions/${sessionId}/finish`, {});

            if (finishResponse.status === 200 || finishResponse.status === 201) {
                alert(t('track_uploaded_success'));
                await clearTrack(db);
                setTrackPoints([]);
                setHasTrackData(false);
            }
        } catch (error) {
            console.error("Error uploading track:", error);
            alert(t('error_uploading_track'));
        } finally {
            setIsLoading(false);
        }
    };

    // --- Style Layers ---
    const pisteLineStyle: any = {
        id: 'piste-lines',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': [
                'match', ['get', 'difficulty'],
                'novice', '#00e676',
                'easy', '#2979ff',
                'intermediate', '#ff1744',
                'advanced', '#212121',
                '#9e9e9e'
            ],
            'line-width': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], 9,
                ['==', ['get', 'id'], hoveredFeatureId || ''], 8,
                5
            ],
            "line-opacity": 0.4
        }
    };

    const pisteLabelStyle: any = {
        id: 'piste-labels',
        type: 'symbol',
        minzoom: 13,
        layout: {
            'text-field': ['get', 'name'],
            'text-size': 12,
            'symbol-placement': 'line',
            'text-allow-overlap': false
        },
        paint: {
            'text-color': '#d35400',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2
        }
    };

    const pisteDirectionStyle: any = {
        id: 'piste-directions',
        type: 'symbol',
        minzoom: 14,
        layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 150,
            'text-field': '>',
            'text-size': 12,
            'text-rotation-alignment': 'map',
            'text-keep-upright': false,
            'text-allow-overlap': false,
            'text-ignore-placement': false
        },
        paint: {
            'text-color': [
                'match', ['get', 'difficulty'],
                'novice', '#00e676',
                'easy', '#2979ff',
                'intermediate', '#ff1744',
                'advanced', '#212121',
                '#9e9e9e'
            ],
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
        }
    };

    const liftLabelStyle: any = {
        id: 'lift-labels',
        type: 'symbol',
        minzoom: 15,
        layout: {
            'text-field': ['get', 'name'],
            'text-size': 12,
            'symbol-placement': 'line',
            'text-allow-overlap': false
        },
        paint: {
            'text-color': '#d35400',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2
        }
    };

    const liftLineStyle: any = {
        id: 'lift-lines',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#8e44ad',
            'line-width': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], 6,
                ['==', ['get', 'id'], hoveredFeatureId || ''], 5,
                3
            ],
            'line-dasharray': [2, 2]
        }
    };

    const trackLineStyle: any = {
        id: 'track-line',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#8e44ad',
            'line-width': 4,
            'line-opacity': 0.9
        }
    };

    const trackDirectionStyle: any = {
        id: 'track-directions',
        type: 'symbol',
        minzoom: 14,
        layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 150,
            'text-field': '>',
            'text-size': 12,
            'text-rotation-alignment': 'map',
            'text-keep-upright': false,
            'text-allow-overlap': true,
            'text-ignore-placement': true
        },
        paint: {
            'text-color': '#8e44ad',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
        }
    };

    const pistesGeoJSON = useMemo(() => {
        const pistesFeatures = (() => {
            if (!resort.pistes || !Array.isArray(resort.pistes)) return [];
            return resort.pistes
                .filter(p => {
                    const geomType = p.GeometryGeoJSON?.type;
                    return geomType && geomType !== 'Polygon' && geomType !== 'MultiPolygon';
                })
                .map(p => ({
                    type: 'Feature' as const,
                    properties: {
                        id: p.ID,
                        difficulty: p.Difficulty,
                        name: p.Name || `Piste #${p.ID.slice(0, 4)}`,
                        resortName: resort.Name
                    },
                    geometry: p.GeometryGeoJSON
                }));
        });
        return { type: 'FeatureCollection' as const, features: pistesFeatures() as any };
    }, [resort]);

    const liftsGeoJSON = useMemo(() => {
        const liftsFeatures = (() => {
            if (!resort.lifts || !Array.isArray(resort.lifts)) return [];
            return resort.lifts
                .filter(l => {
                    const geomType = l.GeometryGeoJSON?.type;
                    return geomType && geomType !== 'Polygon' && geomType !== 'MultiPolygon';
                })
                .map(l => ({
                    type: 'Feature' as const,
                    properties: {
                        id: l.ID,
                        type: l.LiftType,
                        name: l.Name || `Lift #${l.ID.slice(0, 4)}`,
                        resortName: resort.Name
                    },
                    geometry: l.GeometryGeoJSON
                }));
        });
        return { type: 'FeatureCollection' as const, features: liftsFeatures() as any };
    }, [resort]);

    const trackGeoJSON = useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: trackPoints.length > 1 ? [{
            type: 'Feature' as const,
            properties: {},
            geometry: {
                type: 'LineString' as const,
                coordinates: trackPoints.map(p => [p.lon, p.lat])
            }
        }] : []
    }), [trackPoints]);

    const handleNativeFeaturePress = useCallback((e: any) => {
        const feature = e?.features && e.features[0];
        if (feature && feature.properties?.id) {
            const featureId = feature.properties.id;
            const foundLift = resort.lifts?.find(l => l.ID === featureId);
            if (foundLift) { setSelectedFeature(foundLift); return; }
            const foundPiste = resort.pistes?.find(p => p.ID === featureId);
            if (foundPiste) { setSelectedFeature(foundPiste); return; }
        }
    }, [resort]);

    const handleNativeRegionDidChange = useCallback((e: any) => {
        const ne = e?.nativeEvent || e;
        if (!ne) return;

        const zoom = ne.zoom ?? ne.properties?.zoom;
        const center = ne.center ?? ne.geometry?.coordinates;

        if (center && Array.isArray(center) && center.length >= 2) {
            const [lon, lat] = center;
            const finalZoom = zoom !== undefined ? zoom : 13;

            setViewState(prev => ({
                ...prev,
                longitude: lon,
                latitude: lat,
                zoom: finalZoom,
            }));

            const paramLat = lat.toString();
            const paramLng = lon.toString();
            const paramZoom = finalZoom.toString();

            lastInternalParamsRef.current = { lat: paramLat, lon: paramLng, zoom: paramZoom };

            router.setParams({
                lng: paramLng,
                lat: paramLat,
                zoom: paramZoom
            });

            if (!Object.keys(resort).length) {
                fetchResortDetails(lon, lat);
            }
        }
    }, [resort]);

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

    return (
        <View style={styles.container}>
            {takePictureMode && (
                <View style={styles.cameraOverlay}>
                    <Camera 
                        onClose={() => setTakePictureMode(false)} 
                        onSavePhoto={async (uri) => {
                            try {
                                const db = await SQLite.openDatabaseAsync('ski_tracker.db', {useNewConnection: true});
                                await savePhotoToLocalDB(uri, db);
                            } catch (e) {
                                console.error("Error saving photo locally:", e);
                            }
                        }}
                    />
                </View>
            )}

            {!takePictureMode && (
                <>
                    {selectedFeature && (
                        <MapDetailPanel data={selectedFeature} onClose={() => setSelectedFeature(null)} />
                    )}

                    <View style={styles.floatingControls}>
                        {isTracking && (
                            <TouchableOpacity
                                style={styles.cameraButton}
                                onPress={() => setTakePictureMode(true)}
                            >
                                <CameraIcon size={20} color={colors.textOnPrimary} />
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={[styles.trackingButton, isTracking ? styles.trackingButtonActive : styles.trackingButtonInactive]}
                            onPress={handleToggleTracking}
                        >
                            {isTracking ? <Square size={20} color={colors.textOnPrimary} /> : <Play size={20} color={colors.textOnPrimary} />}
                        </TouchableOpacity>

                        {isTracking && (
                            <TouchableOpacity
                                style={[styles.trackingButton, { backgroundColor: isPaused ? colors.success : colors.warning, borderColor: isPaused ? colors.success : colors.warning }]}
                                onPress={handleTogglePause}
                            >
                                {isPaused ? <Play size={20} color={colors.textOnPrimary} /> : <Pause size={20} color={colors.textOnPrimary} />}
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            onPress={() => setShowOfflineModal(true)}
                            style={styles.offlineButton}
                        >
                            <Download size={18} color={colors.primary} />
                            {packs.length > 0 && (
                                <View style={styles.notificationDot} />
                            )}
                        </TouchableOpacity>
                    </View>

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

                    <View style={styles.panelContainer}>
                        {!isTracking && hasTrackData && (
                            <View style={styles.uploadPanel}>
                                <View style={styles.panelHeader}>
                                    <View style={styles.panelHeaderTitleRow}>
                                        <Activity size={16} color={colors.primary} />
                                        <Text style={styles.panelTitle}>{t('session_recorded')}</Text>
                                    </View>
                                    <Text style={styles.panelSubtitle}>
                                        {t('points_recorded', { count: trackPoints.length, resortName: resort.Name || "Sierra Nevada" })}
                                    </Text>
                                </View>

                                <View style={styles.privacyRow}>
                                    <Text style={styles.privacyLabel}>¿Sesión pública?</Text>
                                    <TouchableOpacity
                                        onPress={() => setIsPublic(!isPublic)}
                                        style={[styles.privacyButton, isPublic ? styles.privacyButtonPublic : styles.privacyButtonPrivate]}
                                    >
                                        <Text style={styles.privacyButtonText}>
                                            {isPublic ? 'Pública' : 'Privada'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity
                                    style={styles.uploadButton}
                                    onPress={handleUploadTrack}
                                    disabled={isLoading}
                                >
                                    <Upload size={14} color={colors.textOnPrimary} />
                                    <Text style={styles.uploadButtonText}>
                                        {isLoading ? t('uploading') : t('upload_track')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    <NativeMap
                        style={{ flex: 1, width: '100%', height: '100%' }}
                        mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
                        onRegionDidChange={handleNativeRegionDidChange}
                        attribution={false}
                        logo={false}
                    >
                        <NativeCamera
                            zoom={viewState.zoom}
                            center={[viewState.longitude, viewState.latitude]}
                            maxZoom={16}
                        />

                        {(viewState?.zoom || Number(searchParams.zoom)) >= 10 && (
                            <>
                                {resort && resort.pistes && (
                                    <NativeGeoJSONSource id="pistes-source" data={pistesGeoJSON} onPress={handleNativeFeaturePress}>
                                        <NativeLayer {...pisteLineStyle} />
                                        <NativeLayer {...pisteLabelStyle} />
                                        <NativeLayer {...pisteDirectionStyle} />
                                    </NativeGeoJSONSource>
                                )}

                                {resort && resort.lifts && (
                                    <NativeGeoJSONSource id="lifts-source" data={liftsGeoJSON} onPress={handleNativeFeaturePress}>
                                        <NativeLayer {...liftLineStyle} />
                                        <NativeLayer {...liftLabelStyle} />
                                    </NativeGeoJSONSource>
                                )}

                                {trackPoints.length > 0 && (
                                    <NativeGeoJSONSource id="track-source" data={trackGeoJSON}>
                                        <NativeLayer {...trackLineStyle} />
                                        <NativeLayer {...trackDirectionStyle} />
                                    </NativeGeoJSONSource>
                                )}
                            </>
                        )}
                    </NativeMap>
                </>
            )}
        </View>
    );
}

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
    container: {
        width: '100%',
        height: '100%',
        position: 'relative',
        flex: 1,
        backgroundColor: colors.background,
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
    floatingControls: {
        flexDirection: 'row',
        gap: SPACING.xs,
        position: 'absolute',
        zIndex: 50,
        bottom: 16,
        right: 16,
    },
    cameraButton: {
        backgroundColor: colors.primary,
        borderColor: colors.primaryDark,
        borderWidth: 1,
        padding: 12,
        borderRadius: BORDER_RADIUS.md,
        ...SHADOWS.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    trackingButton: {
        borderWidth: 1,
        borderColor: colors.border,
        padding: 12,
        borderRadius: BORDER_RADIUS.md,
        ...SHADOWS.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    trackingButtonActive: {
        backgroundColor: colors.danger,
        borderColor: colors.danger,
    },
    trackingButtonInactive: {
        backgroundColor: colors.card,
    },
    offlineButton: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 12,
        borderRadius: BORDER_RADIUS.md,
        ...SHADOWS.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    notificationDot: {
        width: 8,
        height: 8,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.success,
    },
    panelContainer: {
        position: 'absolute',
        bottom: 16,
        left: 16,
        zIndex: 40,
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 12,
    },
    uploadPanel: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        ...SHADOWS.lg,
        width: 288,
        flexDirection: 'column',
        gap: 12,
    },
    panelHeader: {
        flexDirection: 'column',
        gap: 2,
    },
    panelHeaderTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    panelTitle: {
        fontWeight: '700',
        fontSize: 14,
        color: colors.textPrimary,
    },
    panelSubtitle: {
        fontSize: 11,
        color: colors.textSecondary,
    },
    privacyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.border,
        paddingVertical: 8,
    },
    privacyLabel: {
        fontSize: 11,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    privacyButton: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.sm,
    },
    privacyButtonPublic: {
        backgroundColor: colors.success,
    },
    privacyButtonPrivate: {
        backgroundColor: colors.textSecondary,
    },
    privacyButtonText: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.textOnPrimary,
        textTransform: 'uppercase',
    },
    uploadButton: {
        backgroundColor: colors.primary,
        padding: 8,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    uploadButtonText: {
        color: colors.textOnPrimary,
        fontWeight: '700',
        fontSize: 12,
    },
});
