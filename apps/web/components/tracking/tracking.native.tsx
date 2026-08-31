import {
    LngLatBounds,
    Camera as NativeCamera,
    GeoJSONSource as NativeGeoJSONSource,
    Layer as NativeLayer,
    Map as NativeMap,
    UserLocation,
    Marker,
    type CameraRef,
} from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import { useIsFocused } from 'expo-router';
import * as SQLite from 'expo-sqlite';
import * as Location from 'expo-location';
import { useNetworkState } from 'expo-network';
import { Image } from 'expo-image';
import { Activity, MapPin, Camera as CameraIcon, Download, Pause, Play, Square, Upload, Share2, AlertTriangle, X, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, TouchableOpacity, View, Alert, Share, ActivityIndicator, Modal } from 'react-native';

import { MapDetailPanel } from 'components/map/map-detail-panel';
import { OfflineMapsModal } from 'components/map/offline-maps-panel';
import { CoverageWarningModal } from 'components/tracking/coverage-warning-modal';
import { ResortSearchModal } from './resort-search-modal';
import { API_BASE_URL } from 'constants/constants';
import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';
import { useOfflineMaps } from 'hooks/use-offline.hook';
import api from 'interceptor/api';
import { Lift, Piste, ResortDetail } from 'models/ski-resort.model';
import { User } from 'models/user.model';
import { useToast } from 'context/toast.context';
import { clearTrack, getAllPhotos, getAllPoints, initDB, savePhotoToLocalDB, savePointToLocalDB } from 'tracking/database';
import { getCurrentLocation, startTracking, stopTracking } from 'tracking/task-manager';
import { Camera } from './camera';
import { useAuth } from 'context/auth.context';

const LOCATION_TASK_NAME = 'ski-background-location-task';
const DEFAULT_LAT = 0;
const DEFAULT_LON = 0;
const DEFAULT_ZOOM = 13;

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
    const { user } = useAuth();
    const networkState = useNetworkState();
    const isOffline = networkState?.isConnected === false;
    
    const styles = useMemo(() => getStyles(colors), [colors]);
    const cameraRef = useRef<CameraRef>(null);
    const lastInternalParamsRef = useRef<{ lat: string; lon: string; zoom: string } | null>(null);
    const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
    const mapStyleUrl = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

    const [resort, setResort] = useState<ResortDetail>({} as ResortDetail);
    const [selectedFeature, setSelectedFeature] = useState<Piste | Lift | null>(null);
    const [chartHoverPoint, setChartHoverPoint] = useState<[number, number] | null>(null);
    const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);
    const [takePictureMode, setTakePictureMode] = useState(false);
    const [searchModalVisible, setSearchModalVisible] = useState(false);
    const [isCheckingLocation, setIsCheckingLocation] = useState(false);
    const [resortErrorVisible, setResortErrorVisible] = useState(false);

    // --- Tracking status ---
    const [isTracking, setIsTracking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [hasTrackData, setHasTrackData] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [trackPoints, setTrackPoints] = useState<any[]>([]);
    const [friendsLocations, setFriendsLocations] = useState<any[]>([]);
    const [isPublic, setIsPublic] = useState(true);
    const [hasShownCoverageWarning, setHasShownCoverageWarning] = useState(false);
    const [showCoverageWarningModal, setShowCoverageWarningModal] = useState(false);
    const [locationReady, setLocationReady] = useState(false);
    const [checkingLocation, setCheckingLocation] = useState(true);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [showUploadModal, setShowUploadModal] = useState(false);
    
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
            }
        }
    }, [searchParams.lat, searchParams.lng, searchParams.zoom]);

    // --- Database initialization and tracking status on mount ---
    useEffect(() => {
        setupDatabaseAndCheckStatus();
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
    }, []);

    useEffect(() => {
        checkLocationServices();
        const interval = setInterval(checkLocationServices, 3000);
        return () => clearInterval(interval);
    }, [checkLocationServices]);

    // --- Timer for live duration ---
    useEffect(() => {
        let timer: any;
        if (isTracking && !isPaused) {
            timer = setInterval(() => {
                setElapsedSeconds(prev => prev + 1);
            }, 1000);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [isTracking, isPaused]);

    // --- Polling to refresh track points in real-time while recording ---
    useEffect(() => {
        let interval: any;
        if (isTracking && !isPaused) {
            interval = setInterval(() => {
                loadTrackPoints();
            }, 2000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isTracking, isPaused]);

    // --- Periodic upload of live location for friends ---
    useEffect(() => {
        let interval: any;
        if (isTracking && !isPaused && trackPoints.length > 0 && isOffline === false) {
            interval = setInterval(async () => {
                const lastPoint = trackPoints[trackPoints.length - 1];
                if (lastPoint && lastPoint.latitude && lastPoint.longitude && resort && resort.ID) {
                    try {
                        await api.post(`${API_BASE_URL}/users/live-location`, {
                            latitude: lastPoint.latitude,
                            longitude: lastPoint.longitude,
                            resort_id: resort.ID.toString(),
                        });
                    } catch (err) {
                        console.error('Error updating live location:', err);
                    }
                }
            }, 30000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isTracking, isPaused, trackPoints, resort, isOffline]);

    // --- Fetch friends' live locations periodically ---
    useEffect(() => {
        let interval: any;
        if (resort && resort.ID && isOffline === false) {
            const fetchLocations = async () => {
                try {
                    const res = await api.get(`${API_BASE_URL}/friends/live-locations?resort_id=${resort.ID}`);
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
    }, [resort, isOffline]);

    const handleSelectResort = async (selected: ResortDetail) => {
        setSearchModalVisible(false);
        setIsCheckingLocation(true);
        try {
            const loc = await getCurrentLocation();
            if (loc && selected.Latitude && selected.Longitude) {
                const dist = getDistanceFromLatLonInKm(loc.coords.latitude, loc.coords.longitude, selected.Latitude, selected.Longitude);
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

            const isDownloaded = packs.some(p => p.name === selected.Name);
            if (!isDownloaded && !hasShownCoverageWarning) {
                setShowCoverageWarningModal(true);
                setHasShownCoverageWarning(true);
            }
        } catch (err) {
            console.error("Error verifying resort distance:", err);
        } finally {
            setIsCheckingLocation(false);
        }
    };

    const setupDatabaseAndCheckStatus = async () => {
        try {
            const db = await SQLite.openDatabaseAsync('ski_tracker.db');
            await initDB(db);

            if (Platform.OS !== 'web') {
                const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
                setIsTracking(isRunning);
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

    const startForegroundWatcher = async (resortIdToUse: string) => {
        try {
            if (locationWatcherRef.current) {
                locationWatcherRef.current.remove();
                locationWatcherRef.current = null;
            }
            locationWatcherRef.current = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 1000,
                    distanceInterval: 0,
                },
                async (loc) => {
                    try {
                        const db = await SQLite.openDatabaseAsync('ski_tracker.db');
                        await savePointToLocalDB(
                            loc.coords.latitude,
                            loc.coords.longitude,
                            loc.coords.altitude || 0,
                            loc.coords.speed || 0,
                            null,
                            resortIdToUse || null,
                            loc.timestamp,
                            db
                        );
                        const points = await getAllPoints(db);
                        setTrackPoints(points);
                        setHasTrackData(points.length > 0);
                    } catch (err) {
                        console.error("Error saving point in foreground watcher:", err);
                    }
                }
            );
        } catch (err) {
            console.error("Error starting foreground location watcher:", err);
        }
    };

    const stopForegroundWatcher = () => {
        if (locationWatcherRef.current) {
            locationWatcherRef.current.remove();
            locationWatcherRef.current = null;
        }
    };

    // --- Tracking control ---
    const handleToggleTracking = async () => {
        if (isTracking) {
            stopForegroundWatcher();
            await stopTracking();
            setIsTracking(false);
            setIsPaused(false);
            
            const db = await SQLite.openDatabaseAsync('ski_tracker.db');
            const points = await getAllPoints(db);
            setTrackPoints(points);
            setHasTrackData(points.length > 0);
            
            if (points.length > 0) {
                setShowUploadModal(true);
            } else {
                showToast(t('no_points_recorded', 'Sesión detenida sin puntos grabados.'), 'info');
            }
        } else {
            const db = await SQLite.openDatabaseAsync('ski_tracker.db');
            await clearTrack(db);
            setTrackPoints([]);
            setHasTrackData(false);
            setElapsedSeconds(0);
            setShowUploadModal(false);

            let trackingTime = user?.time_tracking || 5000;
            try {
                const cachedTime = await AsyncStorage.getItem('CACHED_TIME_TRACKING');
                if (cachedTime) {
                    trackingTime = parseInt(cachedTime, 10);
                }
            } catch (e) {
                console.warn("Could not load tracking time from cache:", e);
            }

            const resortIdToUse = resort?.ID || "";
            
            // Record initial point immediately
            const initialLoc = await getCurrentLocation();
            if (initialLoc) {
                await savePointToLocalDB(
                    initialLoc.coords.latitude,
                    initialLoc.coords.longitude,
                    initialLoc.coords.altitude || 0,
                    initialLoc.coords.speed || 0,
                    null,
                    resortIdToUse || null,
                    initialLoc.timestamp,
                    db
                );
                const initPoints = await getAllPoints(db);
                setTrackPoints(initPoints);
                setHasTrackData(initPoints.length > 0);
            }

            try {
                const started = await startTracking(resortIdToUse, trackingTime);
                if (!started) {
                    showToast(t('tracking_start_permission_denied'), 'error');
                    return;
                }
                await startForegroundWatcher(resortIdToUse);
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
            const resortIdToUse = resort?.ID || "";
            try {
                const started = await startTracking(resortIdToUse, trackingTime);
                if (started) {
                    await startForegroundWatcher(resortIdToUse);
                    setIsPaused(false);
                } else {
                    showToast(t('tracking_resume_failed'), 'error');
                }
            } catch (err) {
                showToast(t('tracking_resume_failed'), 'error');
            }
        } else {
            stopForegroundWatcher();
            await stopTracking();
            setIsPaused(true);
        }
    };

    const handleDiscardTrack = async () => {
        try {
            const db = await SQLite.openDatabaseAsync('ski_tracker.db');
            await clearTrack(db);
            setTrackPoints([]);
            setHasTrackData(false);
            setShowUploadModal(false);
            setElapsedSeconds(0);
            showToast(t('track_discarded', 'Sesión descartada.'), 'info');
        } catch (e) {
            console.error("Error discarding track:", e);
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
                setShowUploadModal(false);
                return;
            }

            const formData = new FormData();
            const resortIdToUse = resort?.ID || points[0]?.resort_id || "";

            // 1. Start session
            let userTrackingTime = user?.time_tracking || 5000;
            try {
                const userRequest = await api.get<User>('/users/me');
                if (userRequest.status === 200 && userRequest.data) {
                    userTrackingTime = userRequest.data.time_tracking || 5000;
                    await AsyncStorage.setItem('CACHED_TIME_TRACKING', userTrackingTime.toString());
                }
            } catch (e) {
                console.warn("Could not fetch user settings during upload:", e);
            }

            const startPayload: any = {
                isPublic: isPublic
            };
            if (resortIdToUse) {
                startPayload.resortId = resortIdToUse;
            }

            const startResponse = await api.post(`${API_BASE_URL}/ski-sessions`, startPayload);

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
                setShowUploadModal(false);
                setElapsedSeconds(0);
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
                message: t('sos_message', '¡Emergencia / SOS! Ésta es mi ubicación actual: {{url}}', { url })
            });
        } else {
            showToast(t('no_location', 'No se ha podido obtener la ubicación para enviar.'));
        }
    };

    const liveStats = useMemo(() => {
        if (!isTracking) return null;
        const latest = trackPoints.length > 0 ? trackPoints[trackPoints.length - 1] : null;
        
        let totalDistance = 0;
        let maxSpeed = 0;
        for (let i = 1; i < trackPoints.length; i++) {
            const prev = trackPoints[i - 1];
            const curr = trackPoints[i];
            totalDistance += getDistanceFromLatLonInKm(prev.lat, prev.lon, curr.lat, curr.lon);
            if (curr.speed > maxSpeed) maxSpeed = curr.speed;
        }

        return {
            currentSpeed: latest ? latest.speed * 3.6 : 0, // m/s to km/h
            maxSpeed: maxSpeed * 3.6,
            altitude: latest ? latest.alt : 0,
            distance: totalDistance, // in km
            duration: elapsedSeconds
        };
    }, [isTracking, trackPoints, elapsedSeconds]);

    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${s}s`;
    };

    const renderLiveStats = () => {
        if (!isTracking) return null;

        return (
            <View style={styles.liveStatsContainer}>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{liveStats?.currentSpeed.toFixed(1)} <Text style={styles.statUnit}>km/h</Text></Text>
                    <Text style={styles.statLabel}>{t('speed', 'Speed')}</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{liveStats?.altitude.toFixed(0)} <Text style={styles.statUnit}>m</Text></Text>
                    <Text style={styles.statLabel}>{t('altitude', 'Alt')}</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{liveStats?.distance.toFixed(2)} <Text style={styles.statUnit}>km</Text></Text>
                    <Text style={styles.statLabel}>{t('distance', 'Dist')}</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{formatDuration(liveStats?.duration ?? 0)}</Text>
                    <Text style={styles.statLabel}>{t('duration', 'Time')}</Text>
                </View>
            </View>
        );
    };

    const trackGeoJSON = useMemo(() => {
        if (trackPoints.length === 0) return { type: 'FeatureCollection' as const, features: [] };
        let coordinates = trackPoints.map(p => [p.lon, p.lat]);
        if (coordinates.length === 1) {
            coordinates = [coordinates[0], coordinates[0]];
        }
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

    const chartHoverGeoJSON = useMemo(() => {
        if (!chartHoverPoint) return null;
        return {
            type: 'FeatureCollection' as const,
            features: [{
                type: 'Feature' as const,
                properties: {},
                geometry: {
                    type: 'Point' as const,
                    coordinates: chartHoverPoint
                }
            }]
        };
    }, [chartHoverPoint]);

    const chartHoverPointStyle = useMemo(() => ({
        id: 'chart-hover-point-layer',
        type: 'circle' as const,
        style: {
            circleRadius: 8,
            circleColor: 'transparent',
            circleStrokeWidth: 3,
            circleStrokeColor: '#000000',
            circlePitchAlignment: 'map' as const,
        }
    }), []);

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
            if (foundLift) { setChartHoverPoint(null); setSelectedFeature(foundLift); return; }
            const foundPiste = resort.pistes?.find(p => p.ID === featureId);
            if (foundPiste) { setChartHoverPoint(null); setSelectedFeature(foundPiste); return; }
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
            {/* Top Bar - Select Resort button */}
            {!takePictureMode && !isTracking && (
                <View style={styles.topBar}>
                    <TouchableOpacity 
                        style={styles.resortSelectButton} 
                        onPress={() => setSearchModalVisible(true)}
                    >
                        <MapPin size={18} color={colors.primary} />
                        <Text style={styles.resortSelectText}>
                            {resort?.ID ? resort.Name : t('select_resort_to_ski', 'Seleccionar estación para esquiar')}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Resort Search Modal */}
            <ResortSearchModal 
                visible={searchModalVisible} 
                onClose={() => setSearchModalVisible(false)}
                onSelect={handleSelectResort}
            />

            {/* Loading Location Check */}
            {isCheckingLocation && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>{t('checking_location', 'Comprobando ubicación...')}</Text>
                </View>
            )}

            {/* Resort Distance Error Modal */}
            <Modal visible={resortErrorVisible} animationType="fade" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalPanel, Platform.OS === 'web' ? styles.modalPanelWeb : styles.modalPanelMobile]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('not_in_resort_title', 'Estación incorrecta')}</Text>
                            <TouchableOpacity onPress={() => setResortErrorVisible(false)} style={styles.modalCloseButton}>
                                <X size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <View style={{ paddingVertical: SPACING.md }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 15, lineHeight: 22 }}>
                                {t('not_in_resort_message', 'No te encuentras en la estación seleccionada. No se puede iniciar el trackeo para esta estación.')}
                            </Text>
                        </View>
                        <TouchableOpacity 
                            style={{ backgroundColor: colors.primary, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, alignItems: 'center', marginTop: SPACING.xs }}
                            onPress={() => setResortErrorVisible(false)}
                        >
                            <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>{t('ok', 'OK')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Upload Modal */}
            <Modal visible={showUploadModal} animationType="fade" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalPanel, Platform.OS === 'web' ? styles.modalPanelWeb : styles.modalPanelMobile]}>
                        <View style={styles.modalHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Activity size={20} color={colors.primary} />
                                <Text style={styles.modalTitle}>{t('session_summary', 'Resumen de la sesión')}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowUploadModal(false)} style={styles.modalCloseButton}>
                                <X size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <View style={{ marginVertical: SPACING.md, gap: SPACING.sm }}>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>{t('resort_or_activity', 'Estación / Actividad')}:</Text>
                                <Text style={styles.summaryValue}>{resort?.Name || t('free_activity', 'Actividad libre')}</Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>{t('points', 'Puntos grabados')}:</Text>
                                <Text style={styles.summaryValue}>{trackPoints.length}</Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>{t('distance', 'Distancia')}:</Text>
                                <Text style={styles.summaryValue}>{liveStats?.distance ? liveStats.distance.toFixed(2) : '0.00'} km</Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>{t('duration', 'Duración')}:</Text>
                                <Text style={styles.summaryValue}>{formatDuration(elapsedSeconds)}</Text>
                            </View>

                            <View style={styles.privacyRow}>
                                <Text style={styles.privacyLabel}>{t('public_session_question', '¿Sesión pública?')}</Text>
                                <TouchableOpacity
                                    onPress={() => setIsPublic(!isPublic)}
                                    style={[styles.privacyButton, isPublic ? styles.privacyButtonPublic : styles.privacyButtonPrivate]}
                                >
                                    <Text style={styles.privacyButtonText}>
                                        {isPublic ? t('public') : t('private')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs }}>
                            <TouchableOpacity
                                style={styles.discardButton}
                                onPress={handleDiscardTrack}
                                disabled={isLoading}
                            >
                                <Trash2 size={16} color={colors.danger} />
                                <Text style={styles.discardButtonText}>{t('discard', 'Descartar')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.modalUploadButton}
                                onPress={handleUploadTrack}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Upload size={16} color="#FFFFFF" />
                                        <Text style={styles.modalUploadButtonText}>{t('upload_session', 'Subir sesión')}</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

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
                {chartHoverGeoJSON && (
                    <NativeGeoJSONSource id="chart-hover-source" data={chartHoverGeoJSON}>
                        <NativeLayer {...chartHoverPointStyle} />
                    </NativeGeoJSONSource>
                )}

                {friendsLocations.map((friend) => {
                    if (!friend.last_longitude || !friend.last_latitude) return null;
                    return (
                        <Marker
                            key={friend.id}
                            id={`friend-marker-${friend.id}`}
                            lngLat={[friend.last_longitude, friend.last_latitude]}
                        >
                            <View style={styles.friendMarkerContainer}>
                                {friend.avatar_url ? (
                                    <Image
                                        source={{ uri: friend.avatar_url }}
                                        style={styles.friendMarkerAvatar}
                                    />
                                ) : (
                                    <View style={styles.friendMarkerInitialsContainer}>
                                        <Text style={styles.friendMarkerInitials}>
                                            {((friend.display_name || friend.first_name || 'U')[0]).toUpperCase()}
                                        </Text>
                                    </View>
                                )}
                                <View style={styles.friendMarkerNameTag}>
                                    <Text style={styles.friendMarkerNameText} numberOfLines={1}>
                                        {friend.display_name || friend.first_name}
                                    </Text>
                                </View>
                            </View>
                        </Marker>
                    );
                })}
            </NativeMap>

            {!takePictureMode && (
                <>
                    {renderLiveStats()}
                    
                    {selectedFeature && (
                        <MapDetailPanel 
                            data={selectedFeature} 
                            onClose={() => { setSelectedFeature(null); setChartHoverPoint(null); }}
                            onChartPointSelected={setChartHoverPoint}
                        />
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

                        <TouchableOpacity
                            style={[styles.trackingButton, isTracking ? styles.trackingButtonActive : styles.trackingButtonInactive]}
                            onPress={handleToggleTracking}
                        >
                            {isTracking ? <Square size={20} color={colors.textOnPrimary} /> : <Play size={20} color={colors.primary} />}
                        </TouchableOpacity>

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
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.md,
    },
    modalPanel: {
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.xl,
        ...SHADOWS.lg,
        display: 'flex',
    },
    modalPanelWeb: {
        width: 400,
    },
    modalPanelMobile: {
        width: '95%',
        maxWidth: 420,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.textPrimary,
        flex: 1,
    },
    modalCloseButton: {
        padding: SPACING.xs + 2,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.surface,
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
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
    },
    summaryLabel: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    summaryValue: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    discardButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.danger,
        backgroundColor: colors.surface,
    },
    discardButtonText: {
        color: colors.danger,
        fontWeight: 'bold',
        fontSize: 14,
    },
    modalUploadButton: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: BORDER_RADIUS.md,
        backgroundColor: colors.primary,
    },
    modalUploadButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
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
        fontSize: 12,
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
        fontSize: 11,
        fontWeight: '700',
        color: colors.textOnPrimary,
        textTransform: 'uppercase',
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
        zIndex: 20,
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
    friendMarkerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    friendMarkerAvatar: {
        width: 32,
        height: 32,
        borderRadius: BORDER_RADIUS.round,
        borderWidth: 2,
        borderColor: colors.primary,
        backgroundColor: colors.surface,
    },
    friendMarkerInitialsContainer: {
        width: 32,
        height: 32,
        borderRadius: BORDER_RADIUS.round,
        borderWidth: 2,
        borderColor: colors.primary,
        backgroundColor: colors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    friendMarkerInitials: {
        fontSize: 12,
        fontWeight: '800',
        color: colors.primaryDark,
    },
    friendMarkerNameTag: {
        backgroundColor: 'rgba(0,0,0,0.75)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: BORDER_RADIUS.sm,
        marginTop: 2,
    },
    friendMarkerNameText: {
        fontSize: 9,
        color: '#ffffff',
        fontWeight: '600',
    },
});
