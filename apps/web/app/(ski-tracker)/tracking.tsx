import axios from 'axios';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import { Play, Square, Upload } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, LayerProps, MapRef, NavigationControl, Source } from 'react-map-gl/maplibre';
import { Platform } from 'react-native';

import { MapDetailPanel } from 'components/map/map-detail-panel';
import { API_BASE_URL } from 'constants/constants';
import { useAuth } from 'context/auth.context';
import { Lift, Piste, ResortDetail } from 'models/ski-resort.model';
import { clearTrack, getAllPoints, initDB } from 'tracking/database';
import { getCurrentLocation, startTracking, stopTracking } from 'tracking/task-manager';

const LOCATION_TASK_NAME = 'ski-background-location-task';

export default function InteractiveSkiMap() {
    const searchParams = useLocalSearchParams();
    const mapRef = useRef<MapRef>(null);
    const { token } = useAuth();

    const [resort, setResort] = useState<ResortDetail>({} as ResortDetail);
    const [selectedFeature, setSelectedFeature] = useState<Piste | Lift | null>(null);
    const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);

    // --- Tracking status ---
    const [isTracking, setIsTracking] = useState(false);
    const [hasTrackData, setHasTrackData] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [trackPoints, setTrackPoints] = useState<any[]>([]);
    const [viewState, setViewState] = useState({
        longitude: parseFloat(searchParams.lng as string || '-3.971953'),
        latitude: parseFloat(searchParams.lat as string || '40.797891'),
        zoom: parseInt(searchParams.zoom as string || '13'),
        bearing: 0,
        pitch: 0
    });

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

            if (points.length === 0) {
                alert("No tracking data to upload.");
                setIsLoading(false);
                return;
            }

            const resortIdToUse = resort.ID || points[0].resort_id || "sierra-nevada"; // fallback if not set

            // 1. Start session
            const startResponse = await axios.post(`${API_BASE_URL}/ski-sessions`, {
                resortId: resortIdToUse
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

            // 2. Upload points
            const payload = {
                points: points.map(p => ({
                    lat: p.lat,
                    lon: p.lon,
                    altitude: p.alt,
                    speed: p.speed,
                    timestamp: new Date(p.timestamp).toISOString()
                }))
            };

            const pointsResponse = await axios.post(`${API_BASE_URL}/ski-sessions/${sessionId}/points`, payload, {
                headers: {
                    "Content-Type": "application/json",
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
                // Clear after successful upload:
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

    // Style for the user's track line (above the pistes)
    const trackLineStyle: LayerProps = {
        id: 'track-line',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#8e44ad', // purple
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
            'text-color': '#8e44ad', // purple
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
        }
    };

    // --- GeoJSON Data Transformation ---
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
        return { type: 'FeatureCollection' as const, features: pistesFeatures() };
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
        return { type: 'FeatureCollection' as const, features: liftsFeatures() };
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

    // --- Interaction Handlers ---
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
        <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 2.5rem)' }}>
            {selectedFeature && (
                <MapDetailPanel data={selectedFeature} onClose={() => setSelectedFeature(null)} />
            )}

            <div className="absolute bottom-10 right-4 z-1000 flex gap-2">
                <button className="btn btn-primary btn-sm"
                    onClick={handleToggleTracking}
                >
                    <span>
                        {isTracking ? <Square /> : <Play />}
                    </span>
                </button>

                {!isTracking && hasTrackData && (
                    <button className="btn btn-primary btn-sm"
                        onClick={handleUploadTrack}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className="loading loading-spinner"></span>
                        ) : (
                            <Upload />
                        )}
                    </button>
                )}
            </div>

            <Map
                ref={mapRef}
                {...viewState}
                initialViewState={viewState}
                onMouseMove={handleMouseMove}
                onMoveEnd={handleMoveEnd}
                onMouseLeave={handleMouseLeave}
                onClick={handleMapClick}
                // onZoomEnd={fetchResortsWithDetails}
                interactiveLayerIds={['piste-lines', 'lift-lines']}
                style={{ width: '100%', height: 'calc(100vh - 4rem)' }}
                mapStyle="https://tiles.openfreemap.org/styles/liberty"
                mapLib={maplibregl}
                maplibreLogo={false}
                attributionControl={false}
                minZoom={10}
                maxBounds={bounds}
            >
                <NavigationControl position="top-right" />

                {/* --- Detailed Elements (Zoom >= 10) --- */}
                {(viewState?.zoom || Number(searchParams.zoom)) >= 10 && (
                    <>
                        {/* Piste Layer */}
                        <Source id="pistes-source" type="geojson" data={pistesGeoJSON}>
                            <Layer {...pisteLineStyle} />
                            <Layer {...pisteLabelStyle} />
                            <Layer {...pisteDirectionStyle} />
                        </Source>

                        {/* Lift Layer */}
                        <Source id="lifts-source" type="geojson" data={liftsGeoJSON}>
                            <Layer {...liftLineStyle} />
                            <Layer {...liftLabelStyle} />
                        </Source>

                        {/* Track Layer drawn ABOVE the pistes */}
                        {trackPoints.length > 0 && (
                            <Source id="track-source" type="geojson" data={trackGeoJSON}>
                                <Layer {...trackLineStyle} />
                                <Layer {...trackDirectionStyle} />
                            </Source>
                        )}
                    </>
                )}
            </Map>
        </div>
    );
}