import axios from 'axios';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import { Activity, CameraIcon, Eye, EyeOff, Play, Square, Upload } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, LayerProps, MapRef, NavigationControl, Source } from 'react-map-gl/maplibre';
import { Platform } from 'react-native';

import { MapDetailPanel } from 'components/map/map-detail-panel';
import { API_BASE_URL } from 'constants/constants';
import { useAuth } from 'context/auth.context';
import { Lift, Piste, ResortDetail } from 'models/ski-resort.model';
import { clearTrack, getAllPhotos, getAllPoints, initDB } from 'tracking/database';
import { getCurrentLocation, startTracking, stopTracking } from 'tracking/task-manager';
import { Camera } from 'components/tracking/camera';

const LOCATION_TASK_NAME = 'ski-background-location-task';

export default function InteractiveSkiMapWeb() {
    const searchParams = useLocalSearchParams();
    const mapRef = useRef<MapRef>(null);
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
    const [viewState, setViewState] = useState({
        longitude: parseFloat(searchParams.lng as string || '-3.971953'),
        latitude: parseFloat(searchParams.lat as string || '40.797891'),
        zoom: parseInt(searchParams.zoom as string || '13'),
        bearing: 0,
        pitch: 0
    });

    // --- Variables ---
    const range = 0.05;
    const bounds: [number, number, number, number] = [
        parseFloat(searchParams.lng as string || '-3.971953') - range,
        parseFloat(searchParams.lat as string || '40.797891') - range,
        parseFloat(searchParams.lng as string || '-3.971953') + range,
        parseFloat(searchParams.lat as string || '40.797891') + range
    ];

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

    // --- Tracking control ---
    const handleToggleTracking = async () => {
        if (Platform.OS === 'web') {
            alert("El tracking en segundo plano solo está disponible en dispositivos móviles.");
            return;
        }

        if (isTracking) {
            await stopTracking();
            setIsTracking(false);
            await loadTrackPoints();
        } else {
            await startTracking(resort.ID);
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
            const startResponse = await axios.post(`${API_BASE_URL}/ski-sessions`, {
                resortId: resortIdToUse,
                isPublic: isPublic
            }, {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                }
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

            const pointsResponse = await axios.post(`${API_BASE_URL}/ski-sessions/${sessionId}/points`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`
                }
            });

            if (pointsResponse.status !== 200) {
                throw new Error("Failed to upload points");
            }

            // 3. Finish session
            const finishResponse = await axios.post(`${API_BASE_URL}/ski-sessions/${sessionId}/finish`, {}, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

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
    const pisteLineStyle: LayerProps = {
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

    const pisteLabelStyle: LayerProps = {
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

    const pisteDirectionStyle: LayerProps = {
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

    const liftLabelStyle: LayerProps = {
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

    const liftLineStyle: LayerProps = {
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

    const trackLineStyle: LayerProps = {
        id: 'track-line',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#8e44ad',
            'line-width': 4,
            'line-opacity': 0.9
        }
    };

    const trackDirectionStyle: LayerProps = {
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

    const handleMouseMove = (event: any) => {
        const map = event.target;
        if (!map.isStyleLoaded() || viewState?.zoom < 10) return;
        try {
            if (!map.getLayer('piste-lines') || !map.getLayer('lift-lines')) return;
            const features = map.queryRenderedFeatures(event.point, { layers: ['piste-lines', 'lift-lines'] });
            if (features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                setHoveredFeatureId(features[0].properties.id);
            } else {
                map.getCanvas().style.cursor = '';
                setHoveredFeatureId(null);
            }

            setViewState(event.viewState);
        } catch (error) { }
    };

    const handleMouseLeave = (event: any) => {
        event.target.getCanvas().style.cursor = '';
        setHoveredFeatureId(null);
    };

    const handleMapClick = (event: any) => {
        const map = event.target;
        if (!map.isStyleLoaded() || viewState?.zoom < 10) return;
        try {
            if (!map.getLayer('piste-lines') || !map.getLayer('lift-lines')) return;
            const features = map.queryRenderedFeatures(event.point, { layers: ['piste-lines', 'lift-lines'] });
            if (!features.length) return;

            const clickedFeature = features[0];
            const featureId = clickedFeature.properties.id;
            const isLift = clickedFeature.layer.id === 'lift-lines';

            if (isLift && resort.lifts) {
                const foundLift = resort.lifts.find(l => l.ID === featureId);
                if (foundLift) { setSelectedFeature(foundLift); return; }
            } else if (!isLift && resort.pistes) {
                const foundPiste = resort.pistes.find(p => p.ID === featureId);
                if (foundPiste) { setSelectedFeature(foundPiste); return; }
            }
        } catch (error) {
            console.error("Error querying features on click:", error);
        }
    };

    const handleMoveEnd = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        const center = map.getCenter();
        const currentZoom = map.getZoom();

        if (center && typeof center.lng === 'number' && typeof center.lat === 'number' && typeof currentZoom === 'number') {
            router.setParams({
                lng: center.lng.toFixed(4),
                lat: center.lat.toFixed(4),
                zoom: currentZoom.toFixed(0)
            });

            if (!Object.keys(resort).length) {
                fetchResortDetails(center.lng, center.lat);
            }
        }
    }, []);

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

            const request = await axios.get<ResortDetail>(`${API_BASE_URL}/resorts/closeness`, {
                params: { lat: latitude, lon: longitude },
                headers: { Authorization: `Bearer ${token}` }
            });
            if (request.status === 200) {
                setResort(request.data);
            }
        } catch (error) {
            console.error("Error fetching resort details:", error);
        }
    };

    return (
        <div className="w-full h-[calc(100vh-4rem)] lg:h-screen relative lg:pl-64">
            {takePictureMode && (
                <div className="absolute inset-0 z-1000 flex items-center justify-center w-full h-full">
                    <Camera onClose={() => setTakePictureMode(false)} />
                </div>
            )}

            {!takePictureMode && (
                <>
                    {selectedFeature && (
                        <MapDetailPanel data={selectedFeature} onClose={() => setSelectedFeature(null)} />
                    )}

                    <div className="absolute bottom-10 right-4 z-1000 flex flex-col items-end gap-3">
                        {!isTracking && hasTrackData && (
                            <div className="bg-base-100/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-base-200 w-72 flex flex-col gap-3 transition-all duration-300">
                                <div className="flex flex-col gap-0.5">
                                    <h4 className="font-bold text-sm text-base-content flex items-center gap-1.5">
                                        <Activity className="w-4 h-4 text-primary animate-pulse" />
                                        Session recorded
                                    </h4>
                                    <p className="text-[11px] text-base-content/60">
                                        {trackPoints.length} points recorded at {resort.Name}
                                    </p>
                                </div>

                                <div className="divider my-0"></div>

                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-base-content flex items-center gap-1">
                                            {isPublic ? <Eye className="w-3.5 h-3.5 text-success" /> : <EyeOff className="w-3.5 h-3.5 text-base-content/40" />}
                                            Privacy
                                        </span>
                                        <input
                                            type="checkbox"
                                            className="toggle toggle-sm toggle-primary"
                                            checked={isPublic}
                                            onChange={(e) => setIsPublic(e.target.checked)}
                                        />
                                    </div>
                                    <span className="text-[10px] text-base-content/50 leading-tight">
                                        {isPublic
                                            ? "Public: visible to everyone in the resort details."
                                            : "Private: only you can see it in the resort details."
                                        }
                                    </span>
                                </div>

                                <div className="flex gap-2 mt-1">
                                    <button
                                        className="btn btn-primary btn-sm flex-1 font-bold gap-1.5 shadow"
                                        onClick={handleUploadTrack}
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <span className="loading loading-spinner loading-xs"></span>
                                        ) : (
                                            <>
                                                <Upload className="w-3.5 h-3.5" />
                                                Upload
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button className={`btn btn-circle shadow-lg ${isTracking ? 'btn-error animate-pulse' : 'btn-primary'}`}
                                onClick={handleToggleTracking}
                            >
                                {isTracking ? <Square className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white fill-white" />}
                            </button>

                            <button className="btn btn-circle shadow-lg btn-primary"
                                onClick={() => setTakePictureMode(true)}
                            >
                                <CameraIcon className="w-5 h-5 text-white" />
                            </button>
                        </div>
                    </div>

                    <Map
                        ref={mapRef}
                        {...viewState}
                        initialViewState={viewState}
                        onMouseMove={handleMouseMove}
                        onMoveEnd={handleMoveEnd}
                        onMouseLeave={handleMouseLeave}
                        onClick={handleMapClick}
                        interactiveLayerIds={['piste-lines', 'lift-lines']}
                        style={{ width: '100%', height: '100%' }}
                        mapStyle="https://tiles.openfreemap.org/styles/liberty"
                        mapLib={maplibregl}
                        maplibreLogo={false}
                        attributionControl={false}
                        minZoom={10}
                        maxBounds={bounds}
                    >
                        <NavigationControl position="top-right" />

                        {(viewState?.zoom || Number(searchParams.zoom)) >= 10 && (
                            <>
                                <Source id="pistes-source" type="geojson" data={pistesGeoJSON}>
                                    <Layer {...pisteLineStyle} />
                                    <Layer {...pisteLabelStyle} />
                                    <Layer {...pisteDirectionStyle} />
                                </Source>

                                <Source id="lifts-source" type="geojson" data={liftsGeoJSON}>
                                    <Layer {...liftLineStyle} />
                                    <Layer {...liftLabelStyle} />
                                </Source>

                                {trackPoints.length > 0 && (
                                    <Source id="track-source" type="geojson" data={trackGeoJSON}>
                                        <Layer {...trackLineStyle} />
                                        <Layer {...trackDirectionStyle} />
                                    </Source>
                                )}
                            </>
                        )}
                    </Map>
                </>
            )}
        </div>
    );
}
