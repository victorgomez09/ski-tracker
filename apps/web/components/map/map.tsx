import axios from 'axios';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, LayerProps, MapRef, Marker, NavigationControl, Source, ViewStateChangeEvent } from 'react-map-gl/maplibre';
import { Area, AreaChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { API_BASE_URL } from 'constants/constants';
import { useAuth } from 'context/auth.context';
import { Lift, Piste, ResortDetail } from 'models/ski-resort.model';
import { MapDetailPanel } from './map-detail-panel';

export default function InteractiveSkiMap() {
    const searchParams = useLocalSearchParams();
    const mapRef = useRef<MapRef>(null);
    const [resorts, setResorts] = useState<ResortDetail[]>([]);
    const [hoveredResortId, setHoveredResortId] = useState<string | null>(null);
    const [selectedFeature, setSelectedFeature] = useState<Piste | Lift | null>(null);
    const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);
    const [trackPoints, setTrackPoints] = useState<any[]>([]);
    const [matchedPisteIds, setMatchedPisteIds] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'runs' | 'elevation' | 'speed'>('runs');
    const [selectedRun, setSelectedRun] = useState<any | null>(null);
    const [sessionDetails, setSessionDetails] = useState<any | null>(null);

    const detectedRuns = useMemo(() => {
        if (trackPoints.length === 0) return [];
        let currentType = 'unknown';
        let currentPoints: any[] = [];
        const result: { type: string; points: any[] }[] = [];

        for (let i = 0; i < trackPoints.length; i++) {
            const p = trackPoints[i];
            let pType = currentType;
            if (i > 0) {
                const prev = trackPoints[i - 1];
                const altDiff = p.altitude - prev.altitude;
                if (altDiff > 0.8) {
                    pType = 'lift';
                } else if (altDiff < -0.8 && p.speed > 1.0) {
                    pType = 'run';
                }
            }
            if (currentType === 'unknown') currentType = pType;

            if (currentType === pType) {
                currentPoints.push(p);
            } else {
                if (currentPoints.length > 0) {
                    result.push({ type: currentType, points: currentPoints });
                }
                currentType = pType;
                currentPoints = [p];
            }
        }
        if (currentPoints.length > 0) {
            result.push({ type: currentType, points: currentPoints });
        }

        return result
            .filter(r => r.type === 'run' && r.points.length > 5)
            .map((r, idx) => {
                const startAlt = r.points[0].altitude;
                const endAlt = r.points[r.points.length - 1].altitude;
                const drop = Math.max(0, startAlt - endAlt);
                const maxSpd = Math.max(...r.points.map(p => p.speed)) * 3.6; // km/h
                return {
                    id: `run-${idx}`,
                    index: idx + 1,
                    points: r.points,
                    verticalDrop: drop,
                    maxSpeed: maxSpd,
                    pointsCount: r.points.length,
                };
            });
    }, [trackPoints]);

    const [viewState, setViewState] = useState({
        longitude: parseFloat(searchParams.lon as string || '-3.971953'),
        latitude: parseFloat(searchParams.lat as string || '40.797891'),
        zoom: parseInt(searchParams.zoom as string || '13'),
        bearing: 0,
        pitch: 0
    });
    const { token } = useAuth();

    useEffect(() => {
        const loadSessionData = async () => {
            if (searchParams.sessionId) {
                try {
                    const res = await axios.get(`${API_BASE_URL}/ski-sessions/${searchParams.sessionId}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.status === 200 && res.data) {
                        const session = res.data.data || res.data; // Handle either wrap or raw
                        setSessionDetails(session);
                        if (session.points && Array.isArray(session.points) && session.points.length > 0) {
                            const parsedPoints = session.points.map((p: any) => {
                                const match = p.geom?.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/i);
                                return {
                                    lat: match ? parseFloat(match[2]) : p.lat,
                                    lon: match ? parseFloat(match[1]) : p.lon,
                                    altitude: p.altitude,
                                    speed: p.speed,
                                    timestamp: p.timestamp
                                };
                            });
                            setTrackPoints(parsedPoints);

                            // Center map on first track point
                            if (parsedPoints.length > 0) {
                                setViewState(prev => ({
                                    ...prev,
                                    longitude: parsedPoints[0].lon,
                                    latitude: parsedPoints[0].lat,
                                    zoom: 14
                                }));
                            }
                        }
                        if (session.runs && Array.isArray(session.runs)) {
                            const ids = session.runs
                                .map((r: any) => r.matched_piste_id)
                                .filter(Boolean);
                            setMatchedPisteIds(ids);
                        }
                    }
                } catch (error) {
                    console.error("Error loading session track on map:", error);
                }
            }
        };
        loadSessionData();
    }, [searchParams.sessionId, token]);

    useEffect(() => {
        const loadInitial = async () => {
            if (Number(searchParams.zoom) < 10) {
                try {
                    const request = await axios.get<ResortDetail[]>(`${API_BASE_URL}/resorts/bbox`, {
                        params: {
                            minLon: searchParams.minLon,
                            minLat: searchParams.minLat,
                            maxLon: searchParams.maxLon,
                            maxLat: searchParams.maxLat
                        },
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    });
                    if (request.status !== 200) {
                        throw new Error(`HTTP error! status: ${request.status}`);
                    }
                    setResorts(request.data);
                } catch (error) {
                    console.error("Error fetching resorts:", error);
                }
            } else {
                try {
                    const lat = parseFloat(searchParams.lat as string || '40.797891');
                    const lon = parseFloat(searchParams.lon as string || '-3.971953');

                    const request = await axios.get<ResortDetail[]>(`${API_BASE_URL}/resorts/nearby`, {
                        params: {
                            lat: lat,
                            lon: lon,
                            radius: 50
                        },
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    });
                    if (request.status !== 200) {
                        throw new Error(`HTTP error! status: ${request.status}`);
                    }
                    setResorts(request.data);
                } catch (error) {
                    console.error("Error fetching resorts:", error);
                }
            }
        }

        loadInitial();
    }, []);

    // --- Layer styles ---
    const pisteLineStyle: LayerProps = {
        id: 'piste-lines',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': [
                'case',
                ['in', ['get', 'id'], ['literal', matchedPisteIds]], '#f1c40f', // yellow for matched pistes
                [
                    'match', ['get', 'difficulty'],
                    'novice', '#00e676',
                    'easy', '#2979ff',
                    'intermediate', '#ff1744',
                    'advanced', '#212121',
                    '#9e9e9e'
                ]
            ],
            // if selected or hovered, increase width
            'line-width': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], 9,
                ['==', ['get', 'id'], hoveredFeatureId || ''], 8,
                ['in', ['get', 'id'], ['literal', matchedPisteIds]], 7, // thicker for matched pistes
                5
            ]
        }
    };

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
    }

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

    // --- Data transformation ---
    const pistesGeoJSON = useMemo(() => {
        const pistesFeatures = resorts.flatMap(r => {
            if (!r.pistes || !Array.isArray(r.pistes)) return [];

            return r.pistes
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
                        resortName: r.Name
                    },
                    geometry: p.GeometryGeoJSON
                }));
        });
        return { type: 'FeatureCollection' as const, features: pistesFeatures };
    }, [resorts]);

    const liftsGeoJSON = useMemo(() => {
        const liftsFeatures = resorts.flatMap(r => {
            if (!r.lifts || !Array.isArray(r.lifts)) return [];

            return r.lifts
                .filter(l => {
                    const geomType = l.GeometryGeoJSON?.type;
                    return geomType && geomType !== 'Polygon' && geomType !== 'MultiPolygon';
                })
                .map(l => ({
                    type: 'Feature' as const,
                    properties: {
                        id: l.ID,
                        type: l.LiftType, // Ej: chairlift, gondola, ski_lift, etc.
                        name: l.Name || `Lift #${l.ID.slice(0, 4)}`,
                        resortName: r.Name
                    },
                    geometry: l.GeometryGeoJSON
                }));
        });
        return { type: 'FeatureCollection' as const, features: liftsFeatures };
    }, [resorts]);

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

    // --- Fetchers ---
    const fetchResortsByBounds = async (bounds: maplibregl.LngLatBounds) => {
        try {
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();

            const request = await axios.get<ResortDetail[]>(`${API_BASE_URL}/resorts/bbox`, {
                params: {
                    minLon: sw.lng,
                    minLat: sw.lat,
                    maxLon: ne.lng,
                    maxLat: ne.lat
                },
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (request.status !== 200) {
                throw new Error(`HTTP error! status: ${request.status}`);
            }
            setResorts(request.data);
        } catch (error) {
            console.error("Error fetching resorts:", error);
        }
    };

    const fetchResortsWithDetails = async (event: ViewStateChangeEvent) => {
        const map = event.target;
        const center = map.getCenter();
        const currentZoom = map.getZoom();

        if (currentZoom > 10) {
            try {
                const lat = center.lat;
                const lon = center.lng;

                const request = await axios.get<ResortDetail[]>(`${API_BASE_URL}/resorts/nearby`, {
                    params: {
                        lat: lat,
                        lon: lon,
                        radius: 50
                    },
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                if (request.status !== 200) {
                    throw new Error(`HTTP error! status: ${request.status}`);
                }
                setResorts(request.data);
            } catch (error) {
                console.error("Error fetching resorts:", error);
            }
        }

        router.setParams({ zoom: currentZoom.toFixed(0) })
    };

    // --- Handler when the user finishes moving/zooming the map ---
    const handleMouseMove = (event: any) => {
        const map = event.target;

        if (!map.isStyleLoaded() || viewState.zoom < 10) return;

        try {
            if (!map.getLayer('piste-lines') || !map.getLayer('lift-lines')) return;
            const features = map.queryRenderedFeatures(event.point, {
                layers: ['piste-lines', 'lift-lines']
            });

            if (features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                setHoveredFeatureId(features[0].properties.id);
            } else {
                map.getCanvas().style.cursor = '';
                setHoveredFeatureId(null);
            }
        } catch (error) {
            // Ignore
        }
    };

    const handleMouseLeave = (event: any) => {
        event.target.getCanvas().style.cursor = '';
        setHoveredFeatureId(null);
    };

    // --- Handler for clicks on map lines ---
    const handleMapClick = (event: any) => {
        const map = event.target;
        if (!map.isStyleLoaded() || viewState.zoom < 10) return;

        try {
            if (!map.getLayer('piste-lines') || !map.getLayer('lift-lines')) return;
            const features = map.queryRenderedFeatures(event.point, {
                layers: ['piste-lines', 'lift-lines']
            });

            if (!features.length) return;

            const clickedFeature = features[0];
            const featureId = clickedFeature.properties.id;
            const isLift = clickedFeature.layer.id === 'lift-lines';

            for (const resort of resorts) {
                if (isLift && resort.lifts) {
                    const foundLift = resort.lifts.find(l => l.ID === featureId);
                    if (foundLift) {
                        setSelectedFeature(foundLift);
                        return;
                    }
                } else if (!isLift && resort.pistes) {
                    const foundPiste = resort.pistes.find(p => p.ID === featureId);
                    if (foundPiste) {
                        setSelectedFeature(foundPiste);
                        return;
                    }
                }
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
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            router.setParams({
                minLon: sw.lng,
                minLat: sw.lat,
                maxLon: ne.lng,
                maxLat: ne.lat,
                lon: center.lng.toFixed(4),
                lat: center.lat.toFixed(4),
                zoom: currentZoom.toFixed(0)
            });

            if (currentZoom < 10) {
                fetchResortsByBounds(bounds);
            } else {
                fetchResortsWithDetails({ target: map } as ViewStateChangeEvent);
            }
        }
    }, []);

    return (
        <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 2.5rem)' }}>
            {/* Pistes and lifts details panel */}
            {selectedFeature && (
                <MapDetailPanel
                    data={selectedFeature}
                    onClose={() => setSelectedFeature(null)}
                />
            )}
            <Map
                ref={mapRef}
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                onMouseMove={handleMouseMove}
                onMoveEnd={handleMoveEnd}
                onMouseLeave={handleMouseLeave}
                onClick={handleMapClick}
                onZoomEnd={fetchResortsWithDetails}
                interactiveLayerIds={['piste-lines', 'lift-lines']}
                style={{ width: '100%', height: 'calc(100vh - 4rem)' }}
                mapStyle="https://tiles.openfreemap.org/styles/liberty"
                mapLib={maplibregl}
                maplibreLogo={false}
                attributionControl={false}
            >
                <NavigationControl position="bottom-right" />

                {/* Pistes Layer */}
                {viewState.zoom >= 10 && (
                    <Source id="pistes-source" type="geojson" data={pistesGeoJSON}>
                        <Layer {...pisteLineStyle} />
                        <Layer {...pisteLabelStyle} />
                    </Source>
                )}

                {/* Resort markers */}
                {viewState.zoom < 10 && resorts.map(resort => (
                    <Marker
                        key={resort.ID}
                        longitude={resort.Longitude}
                        latitude={resort.Latitude}
                        anchor="bottom"
                        onClick={() => {
                            console.log("Estación seleccionada:", resort.Name);
                            setViewState(prev => ({
                                ...prev,
                                longitude: resort.Longitude,
                                latitude: resort.Latitude,
                                zoom: 12
                            }));
                        }}
                    >
                        <div
                            className="resort-marker-container"
                            style={{ cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                            onMouseEnter={() => setHoveredResortId(resort.ID)}
                            onMouseLeave={() => setHoveredResortId(null)}
                        >
                            {hoveredResortId === resort.ID && (
                                <div style={{
                                    backgroundColor: 'white',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    color: '#333',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                    marginBottom: '4px',
                                    whiteSpace: 'nowrap',
                                    zIndex: 10
                                }}>
                                    {resort.Name}
                                </div>
                            )}

                            <div className="resort-marker-dot" style={{
                                background: '#e67e22',
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                border: '2px solid white',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                transition: 'transform 0.2s',
                                transform: hoveredResortId === resort.ID ? 'scale(1.2)' : 'scale(1)'
                            }}></div>
                        </div>
                    </Marker>
                ))}

                {/* 2. Zoom >= 10: Render pistes in detail and also the central or resort marker */}
                {viewState.zoom >= 10 && (
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

            {searchParams.sessionId && trackPoints.length > 0 && (
                <div className="absolute top-4 left-4 z-50 bg-base-100/95 backdrop-blur-md border border-base-300 shadow-2xl rounded-2xl p-4 w-96 max-h-[85vh] overflow-y-auto flex flex-col gap-3">
                    <div className="flex justify-between items-center border-b border-base-300 pb-2">
                        <div>
                            <h3 className="font-bold text-sm text-base-content">Session Analyser</h3>
                            <p className="text-[10px] opacity-70">
                                {sessionDetails ? `Date: ${new Date(sessionDetails.start_time).toLocaleDateString()}` : ''}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="btn btn-xs btn-circle btn-ghost font-bold"
                            onClick={() => {
                                setTrackPoints([]);
                                setMatchedPisteIds([]);
                                setSelectedRun(null);
                                setSessionDetails(null);
                                router.setParams({ sessionId: '' });
                            }}
                        >
                            ✕
                        </button>
                    </div>

                    {selectedRun ? (
                        <div className="space-y-3">
                            <button
                                type="button"
                                className="btn btn-xs btn-secondary"
                                onClick={() => setSelectedRun(null)}
                            >
                                ← Back to list
                            </button>
                            <div className="p-2 bg-base-200 rounded-lg">
                                <h4 className="font-bold text-xs">Run #{selectedRun.index} Details</h4>
                                <div className="grid grid-cols-2 gap-2 mt-1 text-[11px] opacity-80">
                                    <div>Drop: {selectedRun.verticalDrop.toFixed(1)} m</div>
                                    <div>Max Speed: {selectedRun.maxSpeed.toFixed(1)} km/h</div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-[11px] font-semibold opacity-70 uppercase">Elevation Profile (m)</div>
                                <div className="h-32 bg-base-200/50 rounded-lg p-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={selectedRun.points.map((p: any, idx: number) => ({ name: idx, alt: p.altitude }))}>
                                            <XAxis dataKey="name" hide />
                                            <YAxis domain={['dataMin - 10', 'dataMax + 10']} hide />
                                            <Tooltip formatter={(value) => [`${Math.round(Number(value))}m`, 'Altitude']} />
                                            <Area type="monotone" dataKey="alt" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="text-[11px] font-semibold opacity-70 uppercase">Speed Profile (km/h)</div>
                                <div className="h-32 bg-base-200/50 rounded-lg p-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={selectedRun.points.map((p: any, idx: number) => ({ name: idx, speed: p.speed * 3.6 }))}>
                                            <XAxis dataKey="name" hide />
                                            <YAxis hide />
                                            <Tooltip formatter={(value) => [`${Number(value).toFixed(1)} km/h`, 'Speed']} />
                                            <Line type="monotone" dataKey="speed" stroke="#ef4444" strokeWidth={2} dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="tabs tabs-boxed tabs-sm w-full grid grid-cols-3">
                                <button
                                    type="button"
                                    className={`tab ${activeTab === 'runs' ? 'tab-active' : ''}`}
                                    onClick={() => setActiveTab('runs')}
                                >
                                    Runs
                                </button>
                                <button
                                    type="button"
                                    className={`tab ${activeTab === 'elevation' ? 'tab-active' : ''}`}
                                    onClick={() => setActiveTab('elevation')}
                                >
                                    Elevation
                                </button>
                                <button
                                    type="button"
                                    className={`tab ${activeTab === 'speed' ? 'tab-active' : ''}`}
                                    onClick={() => setActiveTab('speed')}
                                >
                                    Speed
                                </button>
                            </div>

                            {activeTab === 'runs' && (
                                <div className="space-y-2">
                                    <div className="text-xs font-semibold opacity-75">Detected Descents ({detectedRuns.length})</div>
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {detectedRuns.map((run) => (
                                            <button
                                                key={run.id}
                                                type="button"
                                                className="w-full text-left p-2.5 rounded-xl bg-base-200 hover:bg-base-300 transition flex justify-between items-center border border-base-300 cursor-pointer"
                                                onClick={() => {
                                                    setSelectedRun(run);
                                                    // Fly/Center map on this run's starting point
                                                    if (run.points.length > 0 && mapRef.current) {
                                                        mapRef.current.getMap().flyTo({
                                                            center: [run.points[0].lon, run.points[0].lat],
                                                            zoom: 15,
                                                            essential: true
                                                        });
                                                    }
                                                }}
                                            >
                                                <div>
                                                    <div className="font-bold text-xs">Run #{run.index}</div>
                                                    <div className="text-[10px] opacity-70 mt-0.5">
                                                        Drop: {run.verticalDrop.toFixed(0)}m | Max Speed: {run.maxSpeed.toFixed(1)} km/h
                                                    </div>
                                                </div>
                                                <span className="text-[11px] text-primary font-medium">Charts →</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'elevation' && (
                                <div className="space-y-2">
                                    <div className="text-xs font-semibold opacity-75">Full Session Elevation (m)</div>
                                    <div className="h-44 bg-base-200/50 rounded-xl p-1">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={trackPoints.map((p, idx) => ({ name: idx, alt: p.altitude }))}>
                                                <XAxis dataKey="name" hide />
                                                <YAxis domain={['dataMin - 20', 'dataMax + 20']} hide />
                                                <Tooltip formatter={(value) => [`${Math.round(Number(value))}m`, 'Altitude']} />
                                                <Area type="monotone" dataKey="alt" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'speed' && (
                                <div className="space-y-2">
                                    <div className="text-xs font-semibold opacity-75">Full Session Speed Profile (km/h)</div>
                                    <div className="h-44 bg-base-200/50 rounded-xl p-1">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={trackPoints.map((p, idx) => ({ name: idx, speed: p.speed * 3.6 }))}>
                                                <XAxis dataKey="name" hide />
                                                <YAxis hide />
                                                <Tooltip formatter={(value) => [`${Number(value).toFixed(1)} km/h`, 'Speed']} />
                                                <Line type="monotone" dataKey="speed" stroke="#ef4444" strokeWidth={2} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}