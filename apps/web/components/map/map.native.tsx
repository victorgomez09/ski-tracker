import axios from 'axios';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import {
    Map as NativeMap,
    Camera as NativeCamera,
    GeoJSONSource as NativeGeoJSONSource,
    Layer as NativeLayer,
    Marker as NativeMarker,
    LngLatBounds
} from '@maplibre/maplibre-react-native';

import { API_BASE_URL } from 'constants/constants';
import { useAuth } from 'context/auth.context';
import { Lift, Piste, Resort, ResortDetail } from 'models/ski-resort.model';
import { MapDetailPanel } from './map-detail-panel';
import { ResortDetailPanel } from './resort-detail-panel';
import { LegendDetailPanel } from './legend-detail-panel';
import { CircleHelp, MapPin, X, ArrowLeft, Download } from 'lucide-react-native';
import { useOfflineMaps } from 'hooks/use-offline.hook';
import { OfflineMapsModal } from './offline-maps-panel';

const mapStyleUrl = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

export default function InteractiveSkiMapNative() {
    const searchParams = useLocalSearchParams();
    const isInternalMoveRef = useRef(false);
    const [resorts, setResorts] = useState<ResortDetail[]>([]);
    const [hoveredResortId, setHoveredResortId] = useState<string | null>(null);
    const [selectedLegend, setSelectedLegend] = useState<boolean>(false);
    const [selectedFeature, setSelectedFeature] = useState<Piste | Lift | null>(null);
    const [selectedResort, setSelectedResort] = useState<Resort | ResortDetail | null>(null);
    const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);
    const [trackPoints, setTrackPoints] = useState<any[]>([]);
    const [matchedPisteIds, setMatchedPisteIds] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'runs' | 'elevation' | 'speed'>('runs');
    const [selectedRun, setSelectedRun] = useState<any | null>(null);
    const [hoveredRun, setHoveredRun] = useState<any | null>(null);
    const [sessionDetails, setSessionDetails] = useState<any | null>(null);
    const [showOfflineModal, setShowOfflineModal] = useState(false);
    const {
        packs,
        downloadingPack,
        downloadingProgress,
        downloadRegion,
        deletePack,
    } = useOfflineMaps(mapStyleUrl);

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
                const maxSpd = Math.max(...r.points.map(p => p.speed)) * 3.6;
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
        longitude: parseFloat((searchParams.lon as string) || '-3.971953'),
        latitude: parseFloat((searchParams.lat as string) || '40.797891'),
        zoom: parseInt((searchParams.zoom as string) || '13'),
        bearing: 0,
        pitch: 0
    });
    const { token } = useAuth();

    useEffect(() => {
        if (isInternalMoveRef.current) {
            isInternalMoveRef.current = false;
            return;
        }

        if (searchParams.lat && searchParams.lon) {
            const lat = parseFloat(searchParams.lat as string);
            const lon = parseFloat(searchParams.lon as string);
            if (!isNaN(lat) && !isNaN(lon)) {
                setViewState(prev => ({
                    ...prev,
                    latitude: lat,
                    longitude: lon,
                    zoom: searchParams.zoom ? parseInt(searchParams.zoom as string) : prev.zoom
                }));
            }
        }
    }, [searchParams.lat, searchParams.lon, searchParams.zoom]);

    useEffect(() => {
        const loadSessionData = async () => {
            if (searchParams.sessionId) {
                try {
                    const res = await axios.get(`${API_BASE_URL}/ski-sessions/${searchParams.sessionId}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.status === 200 && res.data) {
                        const session = res.data.data || res.data;
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
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (request.status === 200) {
                        setResorts(request.data);
                    }
                } catch (error) {
                    console.error("Error fetching resorts:", error);
                }
            } else {
                try {
                    const lat = parseFloat((searchParams.lat as string) || '40.797891');
                    const lon = parseFloat((searchParams.lon as string) || '-3.971953');

                    const request = await axios.get<ResortDetail[]>(`${API_BASE_URL}/resorts/nearby`, {
                        params: { lat: lat, lon: lon, radius: 50 },
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (request.status === 200) {
                        setResorts(request.data);
                    }
                } catch (error) {
                    console.error("Error fetching resorts:", error);
                }
            }
        };

        loadInitial();
    }, [searchParams.lat, searchParams.lon, searchParams.zoom, searchParams.minLon, searchParams.minLat, searchParams.maxLon, searchParams.maxLat, token]);

    const pisteLineStyle: any = {
        id: 'piste-lines',
        sourceID: 'pistes-source',
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
            'line-dasharray': [1, 0],
            'line-width': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], 9,
                ['==', ['get', 'id'], hoveredFeatureId || ''], 8,
                ['==', ['get', 'resortId'], selectedResort?.ID || ''], 8,
                ['in', ['get', 'id'], ['literal', matchedPisteIds]], 7,
                5
            ]
        }
    };

    const pisteLabelStyle: any = {
        id: 'piste-labels',
        sourceID: 'pistes-source',
        type: 'symbol',
        layout: {
            'symbol-placement': 'line-center',
            'symbol-spacing': 220,
            'text-field': ['get', 'name'],
            'text-size': 10.5,
            'text-offset': [0, 0.6],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
            'text-optional': true,
            'text-rotation-alignment': 'map',
            'text-max-angle': 30,
            'text-letter-spacing': 0.1,
            'text-anchor': 'center'
        },
        paint: {
            'text-color': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], '#f8fafc',
                '#ffffff'
            ],
            'text-halo-color': '#000000',
            'text-halo-width': 1.5,
            'text-opacity': 0.95
        }
    };

    const pisteDirectionStyle: any = {
        id: 'piste-arrows',
        sourceID: 'piste-direction-source',
        type: 'symbol',
        layout: {
            'symbol-placement': 'point',
            'text-field': '>>',
            'text-size': 11,
            'text-font': ['Open Sans Bold'],
            'text-rotation-alignment': 'map',
            'text-rotate': ['get', 'rotation'],
            'text-anchor': 'center',
            'text-allow-overlap': true,
            'text-ignore-placement': true,
            'text-offset': [0, -0.25]
        },
        paint: {
            'text-color': '#f8fafc',
            'text-halo-color': '#000000',
            'text-halo-width': 1.2,
            'text-opacity': 0.95
        }
    };

    const liftLineStyle: any = {
        id: 'lift-lines',
        sourceID: 'lifts-source',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], '#d500f9',
                ['==', ['get', 'id'], hoveredFeatureId || ''], '#d500f9',
                ['==', ['get', 'resortId'], selectedResort?.ID || ''], '#d500f9',
                '#aa00ff'
            ],
            'line-width': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], 6,
                ['==', ['get', 'id'], hoveredFeatureId || ''], 5,
                ['==', ['get', 'resortId'], selectedResort?.ID || ''], 5,
                3.5
            ],
            'line-dasharray': [2, 1]
        }
    };

    const liftLabelStyle: any = {
        id: 'lift-labels',
        sourceID: 'lifts-source',
        type: 'symbol',
        layout: {
            'symbol-placement': 'line-center',
            'symbol-spacing': 220,
            'text-field': ['get', 'name'],
            'text-size': 9.5,
            'text-offset': [0, -0.7],
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'text-optional': true,
            'text-rotation-alignment': 'map',
            'text-max-angle': 30
        },
        paint: {
            'text-color': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], '#ffffff',
                '#d500f9'
            ],
            'text-halo-color': '#ffffff',
            'text-halo-width': 1
        }
    };

    const trackLineStyle: any = {
        id: 'track-line',
        sourceID: 'track-source',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#ff9100',
            'line-width': 5
        }
    };

    const trackDirectionStyle: any = {
        id: 'track-arrows',
        sourceID: 'track-direction-source',
        type: 'symbol',
        layout: {
            'symbol-placement': 'point',
            'text-field': '>>',
            'text-size': 11,
            'text-font': ['Open Sans Bold'],
            'text-rotation-alignment': 'map',
            'text-rotate': ['get', 'rotation'],
            'text-anchor': 'center',
            'text-allow-overlap': true,
            'text-ignore-placement': true,
            'text-offset': [0, -0.25]
        },
        paint: {
            'text-color': '#ff9100',
            'text-halo-color': '#000000',
            'text-halo-width': 1.2,
            'text-opacity': 0.95
        }
    };

    const highlightedRunLineStyle: any = {
        id: 'highlighted-run-line',
        sourceID: 'highlighted-run-source',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#00e5ff',
            'line-width': 8
        }
    };

    const highlightedRunCaseStyle: any = {
        id: 'highlighted-run-case',
        sourceID: 'highlighted-run-source',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#000000',
            'line-width': 12
        }
    };

    const getFeatureFromEvent = useCallback((e: any): Piste | Lift | undefined => {
        const features = e?.features ?? e?.nativeEvent?.features ?? [];
        if (!Array.isArray(features) || features.length === 0) return undefined;

        const feature = features[0];
        if (!feature?.properties?.id) return undefined;

        const featureId = feature.properties.id;
        for (const resort of resorts) {
            const found = resort.pistes?.find(p => p.ID === featureId) || resort.lifts?.find(l => l.ID === featureId);
            if (found) return found;
        }

        return undefined;
    }, [resorts]);

    const normalizeGeoJSONLine = (geometry: any) => {
        if (!geometry) return null;
        if ((geometry.type === 'LineString' || geometry.type === 'MultiLineString') && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 1) {
            return geometry;
        }
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

    const pistesGeoJSON = useMemo(() => {
        const features = resorts.flatMap(resort =>
            (resort.pistes || []).flatMap(piste => {
                const geometry = normalizeGeoJSONLine(piste.GeometryGeoJSON) || normalizeGeoJSONLine(piste.Waypoints);
                if (!geometry) return [];
                return [{
                    type: 'Feature' as const,
                    properties: {
                        id: piste.ID,
                        resortId: resort.ID,
                        name: piste.Name || 'Piste',
                        difficulty: piste.Difficulty?.toLowerCase() || 'novice',
                        pisteType: piste.PisteType?.toLowerCase() || 'downhill',
                        grooming: piste.Grooming?.toLowerCase() || 'classic'
                    },
                    geometry
                }];
            })
        );
        return { type: 'FeatureCollection' as const, features: features as any };
    }, [resorts]);

    const pisteDirectionGeoJSON = useMemo(() => {
        const features = resorts.flatMap(resort =>
            (resort.pistes || []).flatMap(piste => {
                const geometry = normalizeGeoJSONLine(piste.GeometryGeoJSON) || normalizeGeoJSONLine(piste.Waypoints);
                if (!geometry) return [];

                const coordinates = geometry.type === 'MultiLineString'
                    ? geometry.coordinates.flatMap((segment: any[]) => segment)
                    : geometry.coordinates;

                if (!Array.isArray(coordinates) || coordinates.length < 2) return [];

                const start = coordinates[0];
                const end = coordinates[coordinates.length - 1];
                if (!Array.isArray(start) || !Array.isArray(end)) return [];

                const dx = end[0] - start[0];
                const dy = end[1] - start[1];
                const rotation = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
                const midpoint: [number, number] = [
                    (start[0] + end[0]) / 2,
                    (start[1] + end[1]) / 2,
                ];

                return [{
                    type: 'Feature' as const,
                    properties: {
                        id: piste.ID,
                        resortId: resort.ID,
                        rotation,
                    },
                    geometry: {
                        type: 'Point' as const,
                        coordinates: midpoint,
                    },
                }];
            })
        );

        return { type: 'FeatureCollection' as const, features: features as any };
    }, [resorts]);

    const liftsGeoJSON = useMemo(() => {
        const features = resorts.flatMap(resort =>
            (resort.lifts || []).flatMap(lift => {
                const geometry = normalizeGeoJSONLine(lift.GeometryGeoJSON) || normalizeGeoJSONLine(lift.Waypoints);
                if (!geometry) return [];
                return [{
                    type: 'Feature' as const,
                    properties: {
                        id: lift.ID,
                        resortId: resort.ID,
                        name: lift.Name || 'Lift',
                        liftType: lift.LiftType?.toLowerCase() || 'chair_lift'
                    },
                    geometry
                }];
            })
        );
        return { type: 'FeatureCollection' as const, features: features as any };
    }, [resorts]);

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

    const activeHighlightedRun = hoveredRun || selectedRun;

    const highlightedRunGeoJSON = useMemo(() => {
        if (!activeHighlightedRun || !activeHighlightedRun.points || activeHighlightedRun.points.length === 0) {
            return { type: 'FeatureCollection' as const, features: [] };
        }
        const coordinates = activeHighlightedRun.points.map((p: any) => [p.lon, p.lat]);
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
    }, [activeHighlightedRun]);

    // --- Handlers ---
    const handleNativeFeaturePress = useCallback((e: any) => {
        const found = getFeatureFromEvent(e);
        if (found) setSelectedFeature(found);
    }, [getFeatureFromEvent]);

    const handleNativeMapPress = useCallback((e: any) => {
        const found = getFeatureFromEvent(e);
        if (found) {
            setSelectedFeature(found);
            return;
        }
        setSelectedFeature(null);
    }, [getFeatureFromEvent]);

    const handleNativeRegionDidChange = useCallback((e: any) => {
        const ne = e?.nativeEvent || e;
        if (!ne) return;

        const zoom = ne.zoom ?? ne.properties?.zoom;
        const center = ne.center ?? ne.geometry?.coordinates;
        const bounds = ne.bounds;

        if (center && Array.isArray(center) && center.length >= 2) {
            const [lon, lat] = center;
            setViewState(prev => ({
                ...prev,
                longitude: lon,
                latitude: lat,
                zoom: zoom !== undefined ? Math.round(zoom) : prev.zoom,
            }));

            isInternalMoveRef.current = true;
            let minLon = (lon - 0.1).toString();
            let minLat = (lat - 0.1).toString();
            let maxLon = (lon + 0.1).toString();
            let maxLat = (lat + 0.1).toString();

            if (Array.isArray(bounds) && bounds.length === 2 && Array.isArray(bounds[0]) && Array.isArray(bounds[1])) {
                minLon = bounds[0][0].toString();
                minLat = bounds[0][1].toString();
                maxLon = bounds[1][0].toString();
                maxLat = bounds[1][1].toString();
            } else if (Array.isArray(bounds) && bounds.length === 4) {
                minLon = bounds[0].toString();
                minLat = bounds[1].toString();
                maxLon = bounds[2].toString();
                maxLat = bounds[3].toString();
            } else if (bounds && typeof bounds === 'object' && 'ne' in bounds && 'sw' in bounds) {
                minLon = bounds.sw[0].toString();
                minLat = bounds.sw[1].toString();
                maxLon = bounds.ne[0].toString();
                maxLat = bounds.ne[1].toString();
            }

            router.setParams({
                lat: lat.toString(),
                lon: lon.toString(),
                zoom: zoom ? Math.round(zoom).toString() : '13',
                minLon,
                minLat,
                maxLon,
                maxLat,
            });
        }
    }, []);

    const renderSvgChart = (dataPoints: number[], strokeColor: string, fillColor: string) => {
        if (!dataPoints || dataPoints.length < 2) return null;
        const maxVal = Math.max(...dataPoints, 1);
        const minVal = Math.min(...dataPoints, 0);
        const range = maxVal - minVal || 1;

        const width = 300;
        const height = 100;

        const points = dataPoints.map((val, idx) => {
            const x = (idx / (dataPoints.length - 1)) * width;
            const y = height - ((val - minVal) / range) * (height - 10) - 5;
            return `${x},${y}`;
        });

        const pathD = `M ${points.join(' L ')}`;
        const areaD = `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;

        return (
            <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
                <Defs>
                    <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={fillColor} stopOpacity="0.4" />
                        <Stop offset="1" stopColor={fillColor} stopOpacity="0.0" />
                    </LinearGradient>
                </Defs>
                <Path d={areaD} fill="url(#chartGrad)" />
                <Path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2" />
            </Svg>
        );
    };

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
        <View className="flex-1 w-full h-full bg-slate-950 relative">
            <TouchableOpacity
                onPress={() => setSelectedLegend(true)}
                className="absolute bottom-4 left-4 z-50 bg-slate-800 border border-slate-700 p-3 rounded-md shadow-xl flex-row items-center gap-2"
            >
                <CircleHelp size={18} color="#60a5fa" />
            </TouchableOpacity>

            <TouchableOpacity
                onPress={() => setShowOfflineModal(true)}
                className="bg-slate-800 border border-slate-700 p-3 rounded-md shadow-xl flex-row items-center gap-2"
            >
                <Download size={18} color="#60a5fa" />
                {packs.length > 0 && (
                    <View className="w-2 h-2 rounded-full bg-emerald-500" />
                )}
            </TouchableOpacity>

            {selectedLegend && (
                <LegendDetailPanel onClose={() => setSelectedLegend(false)} />
            )}

            {showOfflineModal && (
                <OfflineMapsModal
                    onClose={() => setShowOfflineModal(false)}
                    packs={packs}
                    downloadingPack={downloadingPack}
                    downloadProgress={downloadingProgress}
                    onDownloadCurrentArea={handleDownloadCurrentView}
                    onDeletePack={deletePack}
                    currentResortName={selectedResort?.Name}
                />
            )}

            {selectedFeature && (
                <MapDetailPanel data={selectedFeature} onClose={() => setSelectedFeature(null)} />
            )}

            {selectedResort && (
                <ResortDetailPanel resort={selectedResort} onClose={() => setSelectedResort(null)} />
            )}

            {searchParams.sessionId && trackPoints.length > 0 && (
                <View className="absolute top-16 left-4 right-4 md:right-auto z-40 bg-slate-900/95 border border-slate-800 rounded-md p-4 md:w-80 max-h-[75vh] shadow-2xl space-y-3">
                    <View className="flex-row justify-between items-center pb-2 border-b border-slate-800">
                        <View>
                            <Text className="font-extrabold text-sm text-white">Session Analyser</Text>
                            <Text className="text-[10px] text-slate-400">
                                {sessionDetails ? `Date: ${new Date(sessionDetails.start_time).toLocaleDateString()}` : ''}
                            </Text>
                        </View>
                        <TouchableOpacity
                            className="p-1.5 bg-slate-800 rounded-full"
                            onPress={() => {
                                setTrackPoints([]);
                                setMatchedPisteIds([]);
                                setSelectedRun(null);
                                setSessionDetails(null);
                                router.setParams({ sessionId: '' });
                            }}
                        >
                            <X size={16} color="#94a3b8" />
                        </TouchableOpacity>
                    </View>

                    {selectedRun ? (
                        <ScrollView className="space-y-3">
                            <TouchableOpacity
                                className="flex-row items-center gap-1 bg-slate-800 px-3 py-1.5 rounded-md self-start mb-2"
                                onPress={() => setSelectedRun(null)}
                            >
                                <ArrowLeft size={14} color="#60a5fa" />
                                <Text className="text-xs font-bold text-blue-400">Back to runs</Text>
                            </TouchableOpacity>

                            <View className="bg-slate-800/80 p-3 rounded-md border border-slate-700">
                                <Text className="font-bold text-xs text-white">Run #{selectedRun.index} Details</Text>
                                <View className="flex-row justify-between mt-2">
                                    <Text className="text-xs text-slate-300">Drop: {selectedRun.verticalDrop.toFixed(0)}m</Text>
                                    <Text className="text-xs text-slate-300">Max Speed: {selectedRun.maxSpeed.toFixed(1)} km/h</Text>
                                </View>
                            </View>

                            <View className="space-y-2 mt-3">
                                <Text className="text-[10px] font-bold text-slate-400 uppercase">Elevation Profile (m)</Text>
                                <View className="bg-slate-800/40 rounded-md p-2 border border-slate-700">
                                    {renderSvgChart(selectedRun.points.map((p: any) => p.altitude), '#3b82f6', '#3b82f6')}
                                </View>

                                <Text className="text-[10px] font-bold text-slate-400 uppercase mt-3">Speed Profile (km/h)</Text>
                                <View className="bg-slate-800/40 rounded-md p-2 border border-slate-700">
                                    {renderSvgChart(selectedRun.points.map((p: any) => p.speed * 3.6), '#ef4444', '#ef4444')}
                                </View>
                            </View>
                        </ScrollView>
                    ) : (
                        <View className="space-y-3">
                            <View className="flex-row bg-slate-800 p-1 rounded-md mb-2">
                                <TouchableOpacity
                                    className={`flex-1 py-1.5 rounded-md items-center ${activeTab === 'runs' ? 'bg-blue-600' : ''}`}
                                    onPress={() => setActiveTab('runs')}
                                >
                                    <Text className={`text-xs font-bold ${activeTab === 'runs' ? 'text-white' : 'text-slate-400'}`}>Runs</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    className={`flex-1 py-1.5 rounded-md items-center ${activeTab === 'elevation' ? 'bg-blue-600' : ''}`}
                                    onPress={() => setActiveTab('elevation')}
                                >
                                    <Text className={`text-xs font-bold ${activeTab === 'elevation' ? 'text-white' : 'text-slate-400'}`}>Elevation</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    className={`flex-1 py-1.5 rounded-md items-center ${activeTab === 'speed' ? 'bg-blue-600' : ''}`}
                                    onPress={() => setActiveTab('speed')}
                                >
                                    <Text className={`text-xs font-bold ${activeTab === 'speed' ? 'text-white' : 'text-slate-400'}`}>Speed</Text>
                                </TouchableOpacity>
                            </View>

                            {activeTab === 'runs' && (
                                <ScrollView className="max-h-64 space-y-2">
                                    <Text className="text-xs font-bold text-slate-400 mb-2">Descent Runs ({detectedRuns.length})</Text>
                                    {detectedRuns.map((run) => (
                                        <TouchableOpacity
                                            key={run.id}
                                            className="bg-slate-800 p-3 rounded-md border border-slate-700 my-1 flex-row justify-between items-center"
                                            onPress={() => setSelectedRun(run)}
                                        >
                                            <View>
                                                <Text className="font-bold text-xs text-white">Run #{run.index}</Text>
                                                <Text className="text-[10px] text-slate-400 mt-0.5">
                                                    Drop: {run.verticalDrop.toFixed(0)}m | Max: {run.maxSpeed.toFixed(1)} km/h
                                                </Text>
                                            </View>
                                            <Text className="text-xs font-bold text-blue-400">Charts →</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            )}

                            {activeTab === 'elevation' && (
                                <View className="bg-slate-800/40 p-2 rounded-md border border-slate-700">
                                    {renderSvgChart(trackPoints.map(p => p.altitude), '#3b82f6', '#3b82f6')}
                                </View>
                            )}

                            {activeTab === 'speed' && (
                                <View className="bg-slate-800/40 p-2 rounded-md border border-slate-700">
                                    {renderSvgChart(trackPoints.map(p => p.speed * 3.6), '#ef4444', '#ef4444')}
                                </View>
                            )}
                        </View>
                    )}
                </View>
            )}

            <NativeMap
                style={{ flex: 1, width: '100%', height: '100%' }}
                mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
                onRegionDidChange={handleNativeRegionDidChange}
                onPress={handleNativeMapPress}
                attribution={false}
                logo={false}
            >
                <NativeCamera
                    zoom={viewState.zoom}
                    center={[viewState.longitude, viewState.latitude]}
                    maxZoom={16}
                />
                {resorts.map((resort) => (
                    <NativeMarker
                        key={resort.ID}
                        id={resort.ID}
                        lngLat={[resort.Longitude, resort.Latitude]}
                        onPress={() => setSelectedResort(resort)}
                    >
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setSelectedResort(resort)}
                            className="flex flex-col items-center justify-center"
                        >
                            {(viewState.zoom >= 10 || hoveredResortId === resort.ID || selectedResort?.ID === resort.ID) && (
                                <Text style={{
                                    fontSize: 11,
                                    fontWeight: 'bold',
                                    color: selectedResort?.ID === resort.ID ? '#3b82f6' : '#ffffff',
                                    textShadowColor: '#000000',
                                    textShadowOffset: { width: 0, height: 0 },
                                    textShadowRadius: 3,
                                    marginBottom: 2
                                }}>
                                    {resort.Name}
                                </Text>
                            )}
                            <View className="w-6 h-6 rounded-full flex items-center justify-center bg-blue-600 border-2 border-white shadow-lg">
                                <MapPin size={14} color="#ffffff" />
                            </View>
                        </TouchableOpacity>
                    </NativeMarker>
                ))}

                {viewState.zoom >= 10 && (
                    <>
                        <NativeGeoJSONSource id="pistes-source" data={pistesGeoJSON} onPress={handleNativeFeaturePress} hitbox={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                            <NativeLayer {...pisteLineStyle} onPress={handleNativeFeaturePress} />
                            <NativeLayer {...pisteLabelStyle} onPress={handleNativeFeaturePress} />
                        </NativeGeoJSONSource>

                        <NativeGeoJSONSource id="piste-direction-source" data={pisteDirectionGeoJSON} onPress={handleNativeFeaturePress} hitbox={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                            <NativeLayer {...pisteDirectionStyle} onPress={handleNativeFeaturePress} />
                        </NativeGeoJSONSource>

                        <NativeGeoJSONSource id="lifts-source" data={liftsGeoJSON} onPress={handleNativeFeaturePress} hitbox={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                            <NativeLayer {...liftLineStyle} onPress={handleNativeFeaturePress} />
                            <NativeLayer {...liftLabelStyle} onPress={handleNativeFeaturePress} />
                        </NativeGeoJSONSource>

                        {trackPoints.length > 0 && (
                            <>
                                <NativeGeoJSONSource id="track-source" data={trackGeoJSON}>
                                    <NativeLayer {...trackLineStyle} />
                                </NativeGeoJSONSource>
                                <NativeGeoJSONSource id="track-direction-source" data={trackDirectionGeoJSON}>
                                    <NativeLayer {...trackDirectionStyle} />
                                </NativeGeoJSONSource>
                                {(hoveredRun || selectedRun) && (
                                    <NativeGeoJSONSource id="highlighted-run-source" data={highlightedRunGeoJSON}>
                                        <NativeLayer {...highlightedRunCaseStyle} />
                                        <NativeLayer {...highlightedRunLineStyle} />
                                    </NativeGeoJSONSource>
                                )}
                            </>
                        )}
                    </>
                )}
            </NativeMap>
        </View>
    );
}
