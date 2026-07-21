import axios from 'axios';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, LayerProps, MapRef, Marker, NavigationControl, Source, ViewStateChangeEvent } from 'react-map-gl/maplibre';
import { Platform } from 'react-native';
import { Eye, EyeOff, Play, Square, Upload } from 'lucide-react';

import { MapDetailPanel } from 'components/map/map-detail-panel';
import { API_BASE_URL } from 'constants/constants';
import { useAuth } from 'context/auth.context';
import { Lift, Piste, ResortDetail } from 'models/ski-resort.model';
import { clearTrack, getAllPoints, initDB, savePointToLocalDB, TrackPoint } from 'tracking/database';
import { startTracking, stopTracking } from 'tracking/task-manager';

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
    const [showLastTracks, setShowLastTracks] = useState(false);

    const [viewState, setViewState] = useState({
        longitude: parseFloat(searchParams.lng as string || '-3.971953'),
        latitude: parseFloat(searchParams.lat as string || '40.797891'),
        zoom: parseInt(searchParams.zoom as string || '13'),
        bearing: 0,
        pitch: 0
    });

    const range = 0.05;
    const bounds: [number, number, number, number] = [
        viewState.longitude - range,
        viewState.latitude - range,
        viewState.longitude + range,
        viewState.latitude + range
    ];

    // --- Database initialization and tracking status on mount ---
    useEffect(() => {
        setupDatabaseAndCheckStatus();

        const fetchResortDetails = async () => {
            try {
                const request = await axios.get<ResortDetail>(`${API_BASE_URL}/resorts/closeness`, {
                    params: { lat: viewState.latitude, lon: viewState.longitude },
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (request.status === 200) {
                    setResort(request.data);
                }
            } catch (error) {
                console.error("Error fetching resort details:", error);
            }
        };

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
            await startTracking();
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

            const response = await axios.post(`${API_BASE_URL}/track-points`, points, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.status === 200 || response.status === 201) {
                alert("Track uploaded successfully to the backend!");
                // Optional: clear after successful upload:
                // await clearTrack(db);
                // setTrackPoints([]);
                // setHasTrackData(false);
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
            'text-allow-overlap': true,
            'text-ignore-placement': true
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

    const fetchLastTracks = async () => {
        if (showLastTracks) {
            const request = await axios.get<TrackPoint[]>(`${API_BASE_URL}/track-points`, {
                headers: { Authorization: `Bearer ${token}` }
            });
    
            if (request.status === 200) {
                setTrackPoints(request.data);
            }
        } else {
            await loadTrackPoints();
        }
    };

    // --- Interaction Handlers ---
    const handleMouseMove = (event: any) => {
        const map = event.target;
        if (!map.isStyleLoaded() || viewState.zoom < 10) return;
        try {
            const features = map.queryRenderedFeatures(event.point, { layers: ['piste-lines', 'lift-lines'] });
            if (features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                setHoveredFeatureId(features[0].properties.id);
            } else {
                map.getCanvas().style.cursor = '';
                setHoveredFeatureId(null);
            }
        } catch (error) { }
    };

    const handleMouseLeave = (event: any) => {
        event.target.getCanvas().style.cursor = '';
        setHoveredFeatureId(null);
    };

    const handleMapClick = (event: any) => {
        const map = event.target;
        if (!map.isStyleLoaded() || viewState.zoom < 10) return;
        try {
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

        const bounds = map.getBounds();
        const center = map.getCenter();
        const currentZoom = map.getZoom();

        if (center && typeof center.lng === 'number' && typeof center.lat === 'number' && typeof currentZoom === 'number') {
            router.setParams({
                lng: center.lng.toFixed(4),
                lat: center.lat.toFixed(4),
                zoom: currentZoom.toFixed(0)
            });

            // if (currentZoom < 10) {
            //     fetchResortsByBounds(bounds);
            // } else {
            //     fetchResortsWithDetails({ target: map } as ViewStateChangeEvent);
            // }
        }
    }, []);

    // ----- WEB SIMULATION ONLY
    const [isSimulatingWeb, setIsSimulatingWeb] = useState(false);
    const [simStatusText, setSimStatusText] = useState("Start simulation");
    const simulationTimerRef = useRef<number | null>(null);

    // Refs to track the current path and coordinate index during simulation
    const currentPathIndexRef = useRef(0);
    const currentCoordIndexRef = useRef(0);
    const cachedPathsRef = useRef<{ type: 'LIFT' | 'RUN'; coords: [number, number][] }[]>([]);
    const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);

    const handleToggleWebSimulation = async () => {
        const db = await SQLite.openDatabaseAsync('ski_tracker.db');
        setDb(db);

        if (isSimulatingWeb) {
            if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
            setIsSimulatingWeb(false);
            setSimStatusText('Start simulation');
            return;
        }

        if (cachedPathsRef.current.length === 0) {
            const rawLifts: { id: string; coords: [number, number][] }[] = [];
            const rawPistes: { id: string; coords: [number, number][] }[] = [];

            if (resort.lifts && Array.isArray(resort.lifts)) {
                resort.lifts.forEach((lift, idx) => {
                    if (lift.GeometryGeoJSON?.type === 'LineString') {
                        const coords = lift.GeometryGeoJSON.coordinates.map((c: any) => [c[0], c[1]] as [number, number]);
                        if (coords.length > 1) {
                            if (coords[0][1] > coords[coords.length - 1][1]) {
                                coords.reverse();
                            }
                            rawLifts.push({ id: lift.ID || `lift_${idx}`, coords });
                        }
                    }
                });
            }

            if (!resort.pistes || !Array.isArray(resort.pistes)) return;
            resort.pistes
                .filter(p => {
                    const geomType = p.GeometryGeoJSON?.type;
                    return geomType && geomType !== 'Polygon' && geomType !== 'MultiPolygon';
                })
                .forEach((p, idx) => {
                    const geom = p.GeometryGeoJSON;
                    if (geom?.type === 'LineString' && Array.isArray(geom.coordinates)) {
                        const coords = geom.coordinates.map((c: any) => [c[0], c[1]] as [number, number]);
                        if (coords.length > 1) {
                            rawPistes.push({ id: p.ID || `piste_${idx}`, coords });
                        }
                    }
                });

            if (rawLifts.length === 0 || rawPistes.length === 0) {
                alert("Make sure to zoom in on a resort to load the visible pistes and lifts.");
                return;
            }

            const getDistance = (p1: [number, number], p2: [number, number]) => {
                const dx = p1[0] - p2[0];
                const dy = p1[1] - p2[1];
                return Math.sqrt(dx * dx + dy * dy);
            };

            // 3. LOGICAL ROUTE CONSTRUCTION BY PROXIMITY
            const organizedPaths: { type: 'LIFT' | 'RUN'; coords: [number, number][] }[] = [];
            const visitedPistes = new Set<string>();
            const visitedLifts = new Set<string>();

            let currentTrack = rawPistes[0];
            visitedPistes.add(currentTrack.id);
            organizedPaths.push({ type: 'RUN', coords: currentTrack.coords });

            for (let step = 0; step < Math.min(rawPistes.length, 15); step++) {
                const lastPointOfPiste = currentTrack.coords[currentTrack.coords.length - 1];

                let closestLift = null;
                let minLiftDist = Infinity;

                rawLifts.forEach(lift => {
                    if (visitedLifts.has(lift.id)) return;
                    const startPointOfLift = lift.coords[0];
                    const dist = getDistance(lastPointOfPiste, startPointOfLift);
                    if (dist < minLiftDist) {
                        minLiftDist = dist;
                        closestLift = lift;
                    }
                });

                if (!closestLift) break;

                visitedLifts.add((closestLift as any).id);
                organizedPaths.push({ type: 'LIFT', coords: (closestLift as any).coords });

                const lastPointOfLift = (closestLift as any).coords[(closestLift as any).coords.length - 1];

                let closestPiste = null;
                let minPisteDist = Infinity;

                rawPistes.forEach(piste => {
                    if (visitedPistes.has(piste.id)) return;
                    const startPointOfPiste = piste.coords[0];
                    const dist = getDistance(lastPointOfLift, startPointOfPiste);
                    if (dist < minPisteDist) {
                        minPisteDist = dist;
                        closestPiste = piste;
                    }
                });

                if (!closestPiste) break;

                visitedPistes.add((closestPiste as any).id);
                organizedPaths.push({ type: 'RUN', coords: (closestPiste as any).coords });
                currentTrack = closestPiste;
            }

            cachedPathsRef.current = organizedPaths;
            currentPathIndexRef.current = 0;
            currentCoordIndexRef.current = 0;
        }

        setIsSimulatingWeb(true);

        // Initial simulated altitude control
        let simulatedAlt = 2000;

        simulationTimerRef.current = setInterval(async () => {
            try {
                const paths = cachedPathsRef.current;
                const currentPath = paths[currentPathIndexRef.current];

                if (!currentPath || currentPath.coords.length === 0) {
                    currentPathIndexRef.current = 0;
                    currentCoordIndexRef.current = 0;
                    return;
                }

                const targetPoint = currentPath.coords[currentCoordIndexRef.current];
                const currentLon = targetPoint[0];
                const currentLat = targetPoint[1];

                const isLift = currentPath.type === 'LIFT';

                // Simulate altitude and speed variation according to the activity
                if (isLift) {
                    simulatedAlt += 3; // Ascend 3 meters per iteration on the lift
                } else {
                    simulatedAlt -= 4; // Descend 4 meters per iteration on the piste
                }

                const simulatedSpeed = isLift ? 12.5 : 38.0; // approximate km/h
                const simulatedPressure = 1013.25;

                setSimStatusText("Stop simulation");

                await savePointToLocalDB(
                    currentLat,
                    currentLon,
                    simulatedAlt,
                    simulatedSpeed,
                    simulatedPressure,
                    Date.now(),
                    db
                );

                await loadTrackPoints();

                currentCoordIndexRef.current += 1;

                if (currentCoordIndexRef.current >= currentPath.coords.length) {
                    currentPathIndexRef.current = (currentPathIndexRef.current + 1) % paths.length;
                    currentCoordIndexRef.current = 0;
                }

            } catch (err) {
                console.error("Error in simulation:", err);
            }
        }, 300);
    };

    // Clear the simulation timer on unmount
    useEffect(() => {
        return () => {
            if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
        };
    }, []);

    return (
        <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 2.5rem)' }}>
            {selectedFeature && (
                <MapDetailPanel data={selectedFeature} onClose={() => setSelectedFeature(null)} />
            )}

            <div className="absolute bottom-10 left-4 z-1000 flex gap-2">
                <button
                    className="btn btn-primary btn-sm"
                    onClick={fetchLastTracks}
                >
                    <label className="swap">
                        <input type="checkbox" checked={showLastTracks} onChange={() => setShowLastTracks(!showLastTracks)} />

                        <Eye />
                        <EyeOff />
                    </label>
                </button>

                {Platform.OS === 'web' && (
                    <div className="flex gap-2">
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={handleToggleWebSimulation}
                        >
                            {simStatusText}
                        </button>

                        <button className="btn btn-primary btn-sm" onClick={async () => clearTrack(db || await SQLite.openDatabaseAsync('ski_tracker.db'))}>Clear local database</button>
                    </div>
                )}
            </div>

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
                onMove={evt => setViewState(evt.viewState)}
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
                {viewState.zoom >= 10 && (
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