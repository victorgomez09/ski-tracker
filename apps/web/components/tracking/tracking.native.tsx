import {
    Camera as NativeCamera,
    GeoJSONSource as NativeGeoJSONSource,
    Layer as NativeLayer,
    Map as NativeMap
} from '@maplibre/maplibre-react-native';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import { Activity, CameraIcon, Play, Square, Upload } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';

import { MapDetailPanel } from 'components/map/map-detail-panel';
import { Camera } from 'components/tracking/camera';
import { API_BASE_URL } from 'constants/constants';
import { useAuth } from 'context/auth.context';
import { Lift, Piste, ResortDetail } from 'models/ski-resort.model';
import { clearTrack, getAllPhotos, getAllPoints, initDB } from 'tracking/database';
import { getCurrentLocation, startTracking, stopTracking } from 'tracking/task-manager';
import { ResortDetailPanel } from 'components/map/resort-detail-panel';
import api from 'interceptor/api';
import { User } from 'models/user.model';

const LOCATION_TASK_NAME = 'ski-background-location-task';

export default function InteractiveSkiMapNative() {
    const searchParams = useLocalSearchParams();
    const { token } = useAuth();

    const [resort, setResort] = useState<ResortDetail>({} as ResortDetail);
    const [selectedFeature, setSelectedFeature] = useState<Piste | Lift | null>(null);
    const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);
    const [takePictureMode, setTakePictureMode] = useState(false);

    // --- Tracking status ---
    const [isTracking, setIsTracking] = useState(false);
    const [hasTrackData, setHasTrackData] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [trackPoints, setTrackPoints] = useState<any[]>([]);
    const [isPublic, setIsPublic] = useState(true);
    const [nativeMapStyle, setNativeMapStyle] = useState<any | null>(null);
    const [viewState, setViewState] = useState({
        longitude: parseFloat(searchParams.lng as string || '-3.971953'),
        latitude: parseFloat(searchParams.lat as string || '40.797891'),
        zoom: parseInt(searchParams.zoom as string || '13'),
        bearing: 0,
        pitch: 0
    });

    // --- Database initialization and tracking status on mount ---
    useEffect(() => {
        setupDatabaseAndCheckStatus();
        fetchResortDetails();
    }, []);

    // --- Polling to refresh track points in real-time while recording ---
    useEffect(() => {
        let interval: number;
        if (isTracking) {
            interval = setInterval(() => {
                loadTrackPoints();
            }, 5000);
        }
        return () => clearInterval(interval);
    }, [isTracking]);

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

            const request = await api.get<ResortDetail>(`${API_BASE_URL}/resorts/closeness`, {
                params: { lat: latitude, lon: longitude },
            });
            if (request.status === 200) {
                setResort(request.data);
            }
        } catch (error) {
            console.error("Error fetching resort details:", error);
        }
    };

    // --- Tracking control ---
    const handleToggleTracking = async () => {
        if (isTracking) {
            await stopTracking();
            setIsTracking(false);
            await loadTrackPoints();
        } else {
            const userRequest = await api.get<User>('/users/me');

            if (userRequest.status !== 200) {
                alert("Failed to fetch user details. Please try again.");
                return;
            }
            await startTracking(resort.ID, userRequest.data.time_tracking || 5000);
            setIsTracking(true);
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
                alert("No tracking data to upload.");
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
                alert("Track uploaded successfully to the backend and processed!");
                await clearTrack(db);
                setTrackPoints([]);
                setHasTrackData(false);
            }
        } catch (error) {
            console.error("Error uploading track:", error);
            alert("Error uploading track.");
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
            setViewState(prev => ({
                ...prev,
                longitude: lon,
                latitude: lat,
                zoom: zoom !== undefined ? Math.round(zoom) : prev.zoom,
            }));

            router.setParams({
                lng: lon.toFixed(4),
                lat: lat.toFixed(4),
                zoom: zoom ? Math.round(zoom).toString() : '13'
            });

            if (!Object.keys(resort).length) {
                fetchResortDetails(lon, lat);
            }
        }
    }, [resort]);

    return (
        <View className="w-full h-full relative flex-1 bg-slate-950">
            {/* {takePictureMode && (
                <View className="absolute inset-0 z-50 flex items-center justify-center w-full h-full">
                    <Camera onClose={() => setTakePictureMode(false)} />
                </View>
            )} */}

            {!takePictureMode && (
                <>
                    {selectedFeature && (
                        <MapDetailPanel data={selectedFeature} onClose={() => setSelectedFeature(null)} />
                    )}

                    <View className="grid grid-cols-2 gap-2 absolute bottom-4 left-4 z-50">
                        <TouchableOpacity
                            className={`absolute bottom-4 left-16 z-50 ${isTracking ? 'bg-red-800' : 'bg-slate-800'} border border-slate-700 p-3 rounded-md shadow-md flex-row items-center gap-2`}
                            onPress={handleToggleTracking}
                        >
                            {isTracking ? <Square size={20} color="#ffffff" /> : <Play size={20} color="#ffffff" />}
                        </TouchableOpacity>
                    </View>

                    <View className="absolute bottom-10 right-4 z-40 flex flex-col items-end gap-3">
                        {!isTracking && hasTrackData && (
                            <View className="bg-slate-900/95 border border-slate-800 p-4 rounded-md shadow-md w-72 flex flex-col gap-3">
                                <View className="flex flex-col gap-0.5">
                                    <View className="flex-row items-center gap-1.5">
                                        <Activity size={16} color="#3b82f6" />
                                        <Text className="font-bold text-sm text-white">Session recorded</Text>
                                    </View>
                                    <Text className="text-[11px] text-slate-400">
                                        {trackPoints.length} points recorded at {resort.Name}
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    className="bg-slate-600 p-2 rounded-md items-center flex-row justify-center gap-2"
                                    onPress={handleUploadTrack}
                                    disabled={isLoading}
                                >
                                    <Upload size={14} color="#ffffff" />
                                    <Text className="text-white font-bold text-xs">
                                        {isLoading ? "Uploading..." : "Upload Track"}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* <View className="flex-row gap-2">
                            <TouchableOpacity
                                className={`absolute bottom-4 left-16 z-50 ${isTracking ? 'bg-red-800' : 'bg-slate-800'} border border-slate-700 p-3 rounded-md shadow-md flex-row items-center gap-2`}
                                onPress={handleToggleTracking}
                            >
                                {isTracking ? <Square size={20} color="#ffffff" /> : <Play size={20} color="#ffffff" />}
                            </TouchableOpacity>

                            <TouchableOpacity
                                className="w-12 h-12 rounded-full items-center justify-center shadow-lg bg-blue-600"
                                onPress={() => setTakePictureMode(true)}
                            >
                                <CameraIcon size={20} color="#ffffff" />
                            </TouchableOpacity>
                        </View> */}
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
                                <NativeGeoJSONSource id="pistes-source" data={pistesGeoJSON} onPress={handleNativeFeaturePress}>
                                    <NativeLayer {...pisteLineStyle} />
                                    <NativeLayer {...pisteLabelStyle} />
                                    <NativeLayer {...pisteDirectionStyle} />
                                </NativeGeoJSONSource>

                                <NativeGeoJSONSource id="lifts-source" data={liftsGeoJSON} onPress={handleNativeFeaturePress}>
                                    <NativeLayer {...liftLineStyle} />
                                    <NativeLayer {...liftLabelStyle} />
                                </NativeGeoJSONSource>

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
