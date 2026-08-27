import {
    LngLatBounds,
    Camera as NativeCamera,
    GeoJSONSource as NativeGeoJSONSource,
    Layer as NativeLayer,
    Map as NativeMap,
    UserLocation,
    type CameraRef,
} from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import { useIsFocused } from 'expo-router';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { Activity, Camera as CameraIcon, Download, Pause, Play, Square, Upload, Share2, AlertTriangle } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, TouchableOpacity, View, Alert, Share } from 'react-native';

const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
};

import { MapDetailPanel } from 'components/map/map-detail-panel';
import { OfflineMapsModal } from 'components/map/offline-maps-panel';
import { CoverageWarningModal } from 'components/tracking/coverage-warning-modal';
import { API_BASE_URL } from 'constants/constants';
import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';
import { useOfflineMaps } from 'hooks/use-offline.hook';
import api from 'interceptor/api';
import { Lift, Piste, ResortDetail } from 'models/ski-resort.model';
import { User } from 'models/user.model';
import { useToast } from 'context/toast.context';
import { clearTrack, getAllPhotos, getAllPoints, initDB, savePhotoToLocalDB } from 'tracking/database';
import { getCurrentLocation, startTracking, stopTracking } from 'tracking/task-manager';
import { Camera } from './camera';

const LOCATION_TASK_NAME = 'ski-background-location-task';
const DEFAULT_LAT = 40.797891;
const DEFAULT_LON = -3.971953;
const DEFAULT_ZOOM = 13;

const orientLineDownhill = (coords: any[]): any[] => {
    if (!coords || coords.length < 2) return coords;
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first && last && first.length >= 3 && last.length >= 3) {
        const startElev = first[2];
        const endElev = last[2];
        if (typeof startElev === 'number' && typeof endElev === 'number' && endElev > startElev) {
            return [...coords].reverse();
        }
    }
    return coords;
};

const getOrientedPisteGeometry = (geometry: any): any => {
    if (!geometry || !geometry.coordinates) return null;
    if (geometry.type === 'LineString') {
        return {
            type: 'LineString',
            coordinates: orientLineDownhill(geometry.coordinates)
        };
    } else if (geometry.type === 'MultiLineString') {
        return {
            type: 'MultiLineString',
            coordinates: geometry.coordinates.map((line: any[]) => orientLineDownhill(line))
        };
    }
    return geometry;
};

const normalizeGeoJSONLine = (geometry: any): any => {
    if (!geometry) return null;
    if (Array.isArray(geometry) && geometry.length > 1 && Array.isArray(geometry[0]) && typeof geometry[0][0] === 'number') {
        return { type: 'LineString', coordinates: geometry };
    }
    if (geometry.coordinates && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 1) {
        return {
            type: geometry.type === 'MultiLineString' ? 'MultiLineString' : 'LineString',
            coordinates: geometry.coordinates
        };
    }
    return null;
};

export default function InteractiveSkiMapNative() {
    const searchParams = useLocalSearchParams();
    const { t } = useTranslation();
    const { showToast } = useToast();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

    const cameraRef = useRef<CameraRef>(null);
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
    const [hasShownCoverageWarning, setHasShownCoverageWarning] = useState(false);
    const [showCoverageWarningModal, setShowCoverageWarningModal] = useState(false);
    const [locationReady, setLocationReady] = useState(false);
    const [checkingLocation, setCheckingLocation] = useState(true);
    
    const isFocused = useIsFocused();

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

    const isFetchingRef = useRef(false);

    // --- Fetchers ---
    const fetchResortDetails = useCallback(async (lon?: number, lat?: number) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        try {
            let latitude = lat ?? (searchParams.lat ? parseFloat(searchParams.lat as string) : undefined);
            let longitude = lon ?? (searchParams.lng ? parseFloat(searchParams.lng as string) : undefined);

            if (latitude === undefined || longitude === undefined || isNaN(latitude) || isNaN(longitude)) {
                const location = await getCurrentLocation();
                if (location) {
                    latitude = location.coords.latitude;
                    longitude = location.coords.longitude;
                } else {
                    showToast(t('location_permission_required'), 'info');
                }
            }

            if (latitude === undefined || longitude === undefined || isNaN(latitude) || isNaN(longitude)) {
                const cached = await AsyncStorage.getItem('LAST_RESORT_DETAILS');
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        setResort(parsed);
                        if (parsed.Latitude && parsed.Longitude) {
                            cameraRef.current?.easeTo({
                                center: [parsed.Longitude, parsed.Latitude],
                                zoom: 13,
                                duration: 300,
                            });
                        }
                    } catch (e) {
                        console.error("Error parsing cached resort details:", e);
                    }
                }
                latitude = DEFAULT_LAT;
                longitude = DEFAULT_LON;
            } else if (latitude !== undefined && longitude !== undefined) {
                // If we got real coordinates, move camera to them
                const targetLat = latitude;
                const targetLon = longitude;
                setViewState(prev => ({
                    ...prev,
                    latitude: targetLat,
                    longitude: targetLon,
                    zoom: 13
                }));
                cameraRef.current?.easeTo({
                    center: [targetLon, targetLat],
                    zoom: 13,
                    duration: 400,
                });
            }

            const request = await api.get<ResortDetail>(`${API_BASE_URL}/resorts/closeness`, {
                params: { lat: latitude, lon: longitude },
            });
            if (request.status === 200 && request.data) {
                setResort(request.data);
                await AsyncStorage.setItem('LAST_RESORT_DETAILS', JSON.stringify(request.data));
                if (request.data.Latitude && request.data.Longitude) {
                    cameraRef.current?.easeTo({
                        center: [request.data.Longitude, request.data.Latitude],
                        zoom: 13,
                        duration: 400,
                    });
                }
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
        } finally {
            isFetchingRef.current = false;
        }
    }, [searchParams.lat, searchParams.lng, showToast, t]);

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
            const zoom = searchParams.zoom ? parseFloat(searchParams.zoom as string) : DEFAULT_ZOOM;
            if (!isNaN(lat) && !isNaN(lng)) {
                setViewState(prev => ({
                    ...prev,
                    latitude: lat,
                    longitude: lng,
                    zoom: zoom
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

                fetchResortDetails(lng, lat);
            }
        }
    }, [searchParams.lat, searchParams.lng, searchParams.zoom, fetchResortDetails]);

    // --- Database initialization and tracking status on mount ---
    useEffect(() => {
        setupDatabaseAndCheckStatus();
        fetchResortDetails();
    }, []);

    // --- Enforce Location Services ---
    const hasCenteredMapRef = useRef(false);

    const checkLocationServices = useCallback(async () => {
        try {
            const enabled = await Location.hasServicesEnabledAsync();
            const { status } = await Location.getForegroundPermissionsAsync();
            
            if (enabled && status === 'granted') {
                setLocationReady(true);
                // Center map on user
                if (!hasCenteredMapRef.current) {
                    const location = await getCurrentLocation();
                    if (location) {
                        const { latitude, longitude } = location.coords;
                        setViewState(prev => ({ ...prev, latitude, longitude, zoom: 14 }));
                        try {
                            cameraRef.current?.easeTo({ center: [longitude, latitude], zoom: 14, duration: 1000 });
                            hasCenteredMapRef.current = true;
                        } catch (e) {}
                    }
                }
            } else {
                setLocationReady(false);
                if (status !== 'granted') {
                    await Location.requestForegroundPermissionsAsync();
                }
            }
        } catch (e) {
            setLocationReady(false);
        } finally {
            setCheckingLocation(false);
        }
    }, [getCurrentLocation]);

    useEffect(() => {
        checkLocationServices();
        const interval = setInterval(checkLocationServices, 3000);
        return () => clearInterval(interval);
    }, [checkLocationServices]);

    // --- Coverage warning for offline maps ---
    useEffect(() => {
        if (resort?.ID && resort?.Name && !hasShownCoverageWarning) {
            const isDownloaded = packs.some(p => p.name === resort.Name);
            if (!isDownloaded) {
                setShowCoverageWarningModal(true);
                setHasShownCoverageWarning(true);
            }
        }
    }, [resort, hasShownCoverageWarning, packs]);

    // --- Polling to refresh track points in real-time while recording ---
    useEffect(() => {
        let interval: any;
        if (isTracking && !isPaused) {
            interval = setInterval(() => {
                loadTrackPoints();
            }, 5000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isTracking, isPaused]);

    const setupDatabaseAndCheckStatus = async () => {
        try {
            const db = await SQLite.openDatabaseAsync('ski_tracker.db');
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
            const db = await SQLite.openDatabaseAsync('ski_tracker.db');
            const points = await getAllPoints(db);
            setTrackPoints(points);
            setHasTrackData(points.length > 0);
        } catch (e) {
            console.error("Error loading track points:", e);
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
                    trackingTime = parseInt(cachedTime, 10);
                }
            }

            const resortIdToUse = resort.ID || "";
            try {
                const started = await startTracking(resortIdToUse, trackingTime);
                if (!started) {
                    showToast(t('tracking_start_permission_denied'), 'error');
                    return;
                }
                setIsTracking(true);
                setIsPaused(false);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                if (message.startsWith('FOREGROUND_SERVICE_MISSING')) {
                    showToast(t('tracking_start_foreground_service_required'), 'error');
                } else {
                    showToast(t('tracking_start_failed'), 'error');
                }
            }
        }
    };

    const handleTogglePause = async () => {
        if (!isTracking) return;

        if (isPaused) {
            let trackingTime = 5000;
            const cachedTime = await AsyncStorage.getItem('CACHED_TIME_TRACKING');
            if (cachedTime) {
                trackingTime = parseInt(cachedTime, 10);
            }
            const resortIdToUse = resort.ID || "";
            try {
                const started = await startTracking(resortIdToUse, trackingTime);
                if (started) {
                    setIsPaused(false);
                } else {
                    showToast(t('tracking_resume_failed'), 'error');
                }
            } catch (err) {
                showToast(t('tracking_resume_failed'), 'error');
            }
        } else {
            await stopTracking();
            setIsPaused(true);
        }
    };

    // --- Upload track to backend ---
    const handleUploadTrack = async () => {
        setIsLoading(true);
        try {
            const db = await SQLite.openDatabaseAsync('ski_tracker.db');
            const points = await getAllPoints(db);
            const photos = await getAllPhotos(db);

            if (points.length === 0) {
                showToast(t('no_tracking_data'), 'info');
                setIsLoading(false);
                return;
            }

            const formData = new FormData();
            const resortIdToUse = resort.ID || points[0].resort_id || "";

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
                    uri: (photo as any).file_uri,
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

            const pointsResponse = await api.post(`${API_BASE_URL}/ski-sessions/${sessionId}/points`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            if (pointsResponse.status !== 200) {
                throw new Error("Failed to upload points");
            }

            // 3. Finish session
            const finishResponse = await api.post(`${API_BASE_URL}/ski-sessions/${sessionId}/finish`, {});

            if (finishResponse.status === 200 || finishResponse.status === 201) {
                showToast(t('track_uploaded_success'), 'success');
                await clearTrack(db);
                setTrackPoints([]);
                setHasTrackData(false);
                setIsTracking(false);
            }
        } catch (error) {
            console.error("Error uploading track:", error);
            showToast(t('error_uploading_track'), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // --- Style Layers ---
    const pisteLineStyle: any = {
        id: 'piste-lines',
        sourceID: 'pistes-source',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': [
                'match', ['get', 'difficulty'],
                'novice', '#81c784',
                'easy', '#90caf9',
                'intermediate', '#ef9a9a',
                'advanced', '#757575',
                '#cccccc'
            ],
            'line-dasharray': [1, 0],
            'line-width': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], 7,
                ['==', ['get', 'id'], hoveredFeatureId || ''], 8,
                5
            ]
        }
    };

    const pisteLabelStyle: any = {
        id: 'piste-labels',
        sourceID: 'pistes-source',
        type: 'symbol',
        layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 250,
            'text-field': ['get', 'name'],
            'text-size': 11,
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-letter-spacing': 0.05,
            'text-max-angle': 30,
            'text-keep-upright': false
        },
        paint: {
            'text-color': '#000000',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
            'text-halo-blur': 0.5
        }
    };

    const pisteDirectionStyle: any = {
        id: 'piste-direction-arrows',
        sourceID: 'pistes-source',
        type: 'symbol',
        minZoom: 13,
        layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 80,
            'text-field': '▶',
            'text-size': 10,
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-keep-upright': false,
            'text-allow-overlap': true,
            'text-ignore-placement': true
        },
        paint: {
            'text-color': [
                'match', ['get', 'difficulty'],
                'novice', '#2e7d32',
                'easy', '#1565c0',
                'intermediate', '#c62828',
                'advanced', '#212121',
                '#424242'
            ],
            'text-halo-color': '#ffffff',
            'text-halo-width': 1
        }
    };

    const liftLineStyle: any = {
        id: 'lift-lines',
        sourceID: 'lifts-source',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#424242',
            'line-dasharray': [2, 2],
            'line-width': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], 5,
                ['==', ['get', 'id'], hoveredFeatureId || ''], 5,
                3
            ]
        }
    };

    const liftLabelStyle: any = {
        id: 'lift-labels',
        sourceID: 'lifts-source',
        type: 'symbol',
        layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 300,
            'text-field': ['get', 'name'],
            'text-size': 10,
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-letter-spacing': 0.05,
            'text-max-angle': 30
        },
        paint: {
            'text-color': '#424242',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
        }
    };

    const trackLineStyle: any = {
        id: 'user-track-line',
        sourceID: 'track-source',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#e11d48',
            'line-width': 5,
            'line-opacity': 0.8
        }
    };

    const trackDirectionStyle: any = {
        id: 'track-direction-arrow',
        sourceID: 'track-direction-source',
        type: 'symbol',
        layout: {
            'text-field': '▶',
            'text-size': 14,
            'text-rotate': ['get', 'rotation'],
            'text-rotation-alignment': 'map',
            'text-allow-overlap': true,
            'text-ignore-placement': true
        },
        paint: {
            'text-color': '#e11d48',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
        }
    };

    // --- GeoJSON sources memoization ---
    const pistesGeoJSON = useMemo(() => {
        if (!resort || !resort.pistes) return { type: 'FeatureCollection' as const, features: [] };
        const features = resort.pistes.map(piste => {
            const baseGeom = normalizeGeoJSONLine(piste.GeometryGeoJSON) || normalizeGeoJSONLine(piste.Waypoints);
            if (!baseGeom) return null;
            const geom = getOrientedPisteGeometry(baseGeom);
            if (!geom) return null;
            return {
                type: 'Feature' as const,
                properties: {
                    id: piste.ID,
                    resortId: resort.ID,
                    name: piste.Name || 'Piste',
                    difficulty: piste.Difficulty?.toLowerCase() || 'novice',
                    pisteType: piste.PisteType?.toLowerCase() || 'downhill',
                    grooming: piste.Grooming?.toLowerCase() || 'classic'
                },
                geometry: geom
            };
        }).filter((f): f is NonNullable<typeof f> => Boolean(f));
        return { type: 'FeatureCollection' as const, features: features as any };
    }, [resort]);

    const liftsGeoJSON = useMemo(() => {
        if (!resort || !resort.lifts) return { type: 'FeatureCollection' as const, features: [] };
        const features = resort.lifts.map(lift => {
            const geometry = normalizeGeoJSONLine(lift.GeometryGeoJSON) || normalizeGeoJSONLine(lift.Waypoints);
            if (!geometry) return null;
            return {
                type: 'Feature' as const,
                properties: {
                    id: lift.ID,
                    resortId: resort.ID,
                    name: lift.Name || 'Lift',
                    liftType: lift.LiftType?.toLowerCase() || 'chair_lift'
                },
                geometry
            };
        }).filter((f): f is NonNullable<typeof f> => Boolean(f));
        return { type: 'FeatureCollection' as const, features: features as any };
    }, [resort]);

    const handleSOS = () => {
        if (viewState.latitude && viewState.longitude) {
            const url = `https://www.google.com/maps/search/?api=1&query=${viewState.latitude},${viewState.longitude}`;
            Share.share({
                message: t('sos_message', '¡Emergencia / SOS! Ésta es mi ubicación actual en la montaña: {{url}}', { url })
            });
        } else {
            showToast(t('no_location', 'No se ha podido obtener la ubicación para enviar.'));
        }
    };

    const liveStats = useMemo(() => {
        if (!trackPoints || trackPoints.length === 0) return null;
        const latest = trackPoints[trackPoints.length - 1];
        const first = trackPoints[0];
        const durationSeconds = (latest.timestamp - first.timestamp) / 1000;
        
        let totalDistance = 0;
        let maxSpeed = 0;
        for (let i = 1; i < trackPoints.length; i++) {
            const prev = trackPoints[i - 1];
            const curr = trackPoints[i];
            totalDistance += getDistanceFromLatLonInKm(prev.lat, prev.lon, curr.lat, curr.lon);
            if (curr.speed > maxSpeed) maxSpeed = curr.speed;
        }

        return {
            currentSpeed: latest.speed * 3.6, // m/s to km/h
            maxSpeed: maxSpeed * 3.6,
            altitude: latest.alt,
            distance: totalDistance, // in km
            duration: durationSeconds
        };
    }, [trackPoints]);

    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${s}s`;
    };

    const renderLiveStats = () => {
        if (!isTracking || !liveStats) return null;
        return (
            <View style={styles.liveStatsContainer}>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{liveStats.currentSpeed.toFixed(1)} <Text style={styles.statUnit}>km/h</Text></Text>
                    <Text style={styles.statLabel}>{t('speed', 'Speed')}</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{liveStats.altitude.toFixed(0)} <Text style={styles.statUnit}>m</Text></Text>
                    <Text style={styles.statLabel}>{t('altitude', 'Alt')}</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{liveStats.distance.toFixed(2)} <Text style={styles.statUnit}>km</Text></Text>
                    <Text style={styles.statLabel}>{t('distance', 'Dist')}</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{formatDuration(liveStats.duration)}</Text>
                    <Text style={styles.statLabel}>{t('duration', 'Time')}</Text>
                </View>
            </View>
        );
    };

    const trackGeoJSON = useMemo(() => {
        if (trackPoints.length === 0) return { type: 'FeatureCollection' as const, features: [] };
        const coordinates = trackPoints.map(p => [p.lon, p.lat]);
        return {
            type: 'FeatureCollection' as const,
            features: [{
                type: 'Feature' as const,
                properties: {},
                geometry: {
                    type: 'LineString' as const,
                    coordinates
                }
            }]
        };
    }, [trackPoints]);

    const trackDirectionGeoJSON = useMemo(() => {
        if (trackPoints.length < 2) return { type: 'FeatureCollection' as const, features: [] };

        const coordinates = trackPoints.map(p => [p.lon, p.lat]);
        const start = coordinates[0];
        const end = coordinates[coordinates.length - 1];
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const rotation = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
        const midpoint: [number, number] = [
            (start[0] + end[0]) / 2,
            (start[1] + end[1]) / 2,
        ];

        return {
            type: 'FeatureCollection' as const,
            features: [{
                type: 'Feature' as const,
                properties: { rotation },
                geometry: {
                    type: 'Point' as const,
                    coordinates: midpoint,
                }
            }],
        };
    }, [trackPoints]);

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
            const finalZoom = zoom !== undefined ? zoom : DEFAULT_ZOOM;

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

    if (!isFocused) {
        return <View style={[styles.container, { backgroundColor: colors.background }]} />;
    }

    return (
        <View style={styles.container}>
            {takePictureMode && (
                <View style={styles.cameraOverlay}>
                    <Camera 
                        onClose={() => setTakePictureMode(false)} 
                        onSavePhoto={async (uri) => {
                            try {
                                const db = await SQLite.openDatabaseAsync('ski_tracker.db');
                                await savePhotoToLocalDB(uri, db);
                            } catch (e) {
                                console.error("Error saving photo locally:", e);
                            }
                        }}
                    />
                </View>
            )}

            <NativeMap
                style={{ flex: 1 }}
                mapStyle={mapStyleUrl}
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
                        {resort && resort.pistes && resort.pistes.length > 0 && (
                            <NativeGeoJSONSource id="pistes-source" data={pistesGeoJSON} onPress={handleNativeFeaturePress} hitbox={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                                <NativeLayer {...pisteLineStyle} />
                                <NativeLayer {...pisteLabelStyle} />
                                <NativeLayer {...pisteDirectionStyle} />
                            </NativeGeoJSONSource>
                        )}

                        {resort && resort.lifts && resort.lifts.length > 0 && (
                            <NativeGeoJSONSource id="lifts-source" data={liftsGeoJSON} onPress={handleNativeFeaturePress} hitbox={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                                <NativeLayer {...liftLineStyle} />
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
            </NativeMap>

            {!takePictureMode && (
                <>
                    {renderLiveStats()}
                    
                    {selectedFeature && (
                        <MapDetailPanel data={selectedFeature} onClose={() => setSelectedFeature(null)} />
                    )}

                    <View style={styles.floatingControls}>
                        {isTracking && (
                            <>
                                <TouchableOpacity
                                    style={[styles.cameraButton, { backgroundColor: '#e11d48' }]}
                                    onPress={handleSOS}
                                >
                                    <AlertTriangle size={20} color={colors.textOnPrimary} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.cameraButton, { marginTop: 10 }]}
                                    onPress={() => setTakePictureMode(true)}
                                >
                                    <CameraIcon size={20} color={colors.textOnPrimary} />
                                </TouchableOpacity>
                            </>
                        )}

                        {!hasTrackData && (
                            <TouchableOpacity
                                style={[styles.trackingButton, isTracking ? styles.trackingButtonActive : styles.trackingButtonInactive]}
                                onPress={handleToggleTracking}
                            >
                                {isTracking ? <Square size={20} color={colors.textOnPrimary} /> : <Play size={20} color={colors.primary} />}
                            </TouchableOpacity>
                        )}

                        {isTracking && (
                            <TouchableOpacity
                                style={[styles.trackingButton, { backgroundColor: isPaused ? colors.success : colors.warning, borderColor: isPaused ? colors.success : colors.warning }]}
                                onPress={handleTogglePause}
                            >
                                {isPaused ? <Play size={20} color={colors.textOnPrimary} /> : <Pause size={20} color={colors.textOnPrimary} />}
                            </TouchableOpacity>
                        )}

                        {!hasTrackData && (
                            <TouchableOpacity
                                onPress={() => setShowOfflineModal(true)}
                                style={styles.offlineButton}
                            >
                                <Download size={18} color={colors.primary} />
                                {packs.length > 0 && (
                                    <View style={styles.notificationDot} />
                                )}
                            </TouchableOpacity>
                        )}
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
                                        {t('points_recorded', { count: trackPoints.length, resortName: resort?.Name || "" })}
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

            {!locationReady && !checkingLocation && (
                <View style={[styles.locationOverlay, { backgroundColor: colors.background }]}>
                    <AlertTriangle size={64} color={colors.warning} style={{ marginBottom: SPACING.lg }} />
                    <Text style={[styles.locationOverlayTitle, { color: colors.textPrimary }]}>
                        {t('gps_required', 'GPS Required')}
                    </Text>
                    <Text style={[styles.locationOverlayText, { color: colors.textSecondary }]}>
                        {t('gps_required_desc', 'You must enable device location and grant permissions to the app in order to use the Tracker.')}
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
    liveStatsContainer: {
        position: 'absolute',
        top: 60,
        left: SPACING.md,
        right: SPACING.md,
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.md,
        flexDirection: 'row',
        justifyContent: 'space-between',
        ...SHADOWS.md,
    },
    statBox: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    statUnit: {
        fontSize: 10,
        color: colors.textSecondary,
    },
    statLabel: {
        fontSize: 10,
        color: colors.textSecondary,
        marginTop: 2,
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
