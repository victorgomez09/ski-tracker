import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import maplibregl from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, LayerProps, MapRef, Marker, NavigationControl, Source, ViewStateChangeEvent } from 'react-map-gl/maplibre';
import { CircleQuestionMark } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import 'maplibre-gl/dist/maplibre-gl.css';

import { API_BASE_URL } from 'constants/constants';
import { useAuth } from 'context/auth.context';
import { Lift, Piste, Resort, ResortDetail } from 'models/ski-resort.model';
import { useThemeColors, COLORS, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from '../../constants/theme';
import { MapDetailPanel } from './map-detail-panel';
import { ResortDetailPanel } from './resort-detail-panel';
import { LegendDetailPanel } from './legend-detail-panel';
import api from 'interceptor/api';
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const getOrientedDownhillSegments = (geometry: any): any[] => {
    if (!geometry || !geometry.coordinates) return [];
    
    const segments: any[] = [];
    const createSegmentFeature = (coords: any[]) => {
        if (coords.length < 2) return null;
        const first = coords[0];
        const last = coords[1];
        let finalCoords = coords;
        if (first && last && first.length >= 3 && last.length >= 3) {
            const startElev = first[2];
            const endElev = last[2];
            if (typeof startElev === 'number' && typeof endElev === 'number' && endElev > startElev) {
                finalCoords = [last, first];
            }
        }
        return {
            type: 'LineString',
            coordinates: finalCoords
        };
    };

    if (geometry.type === 'LineString') {
        const coords = geometry.coordinates;
        for (let i = 0; i < coords.length - 1; i++) {
            const segment = createSegmentFeature([coords[i], coords[i + 1]]);
            if (segment) segments.push(segment);
        }
    } else if (geometry.type === 'MultiLineString') {
        const lines = geometry.coordinates;
        for (const line of lines) {
            for (let i = 0; i < line.length - 1; i++) {
                const segment = createSegmentFeature([line[i], line[i + 1]]);
                if (segment) segments.push(segment);
            }
        }
    }
    return segments;
};

interface GenericChartDatum {
    distance: number;
    elevation: number;
    speed: number;
    slopePct: number;
    slopeDeg: number;
}

const computeChartData = (points: any[]) => {
    if (!points || points.length === 0) return [];
    let cumulativeDistance = 0;
    return points.map((p, idx) => {
        if (idx > 0) {
            const prev = points[idx - 1];
            cumulativeDistance += getDistance(prev.lat, prev.lon, p.lat, p.lon);
        }
        const prevPoint = idx > 0 ? points[idx - 1] : p;
        const elevDiff = p.altitude - prevPoint.altitude;
        const distDiff = idx > 0 ? getDistance(prevPoint.lat, prevPoint.lon, p.lat, p.lon) * 1000 : 0; // meters
        const slopePct = distDiff > 0.1 ? Math.round((elevDiff / distDiff) * 100 * 10) / 10 : 0;
        const slopeDeg = Math.round(Math.atan(Math.abs(slopePct) / 100) * (180 / Math.PI));

        return {
            distance: cumulativeDistance, // in km
            elevation: Math.round(p.altitude),
            speed: p.speed * 3.6, // km/h
            slopePct,
            slopeDeg,
        };
    });
};

const getSlopeColor = (slopePct: number) => {
    const absSlope = Math.abs(slopePct);
    if (absSlope < 15) return '#00a859';
    if (absSlope < 25) return '#0072bc';
    if (absSlope < 40) return '#f0141e';
    return '#000000';
};

const WebChart: React.FC<{
    data: GenericChartDatum[];
    yKey: 'elevation' | 'speed';
    height: number;
    selectedIndex: number | null;
    onSelectIndex: (index: number) => void;
    colors: typeof LIGHT_COLORS;
    strokeColor?: string;
}> = ({ data, yKey, height, selectedIndex, onSelectIndex, colors, strokeColor }) => {
    const [containerWidth, setContainerWidth] = useState<number>(0);

    if (!data || data.length === 0) return null;

    const minVal = Math.min(...data.map(d => d[yKey]));
    const maxVal = Math.max(...data.map(d => d[yKey]));
    const maxDist = Math.max(...data.map(d => d.distance)) || 1;
    const valRange = maxVal - minVal || 1;

    const padding = { top: 10, bottom: 25, left: 40, right: 15 };
    const svgWidth = containerWidth > 0 ? containerWidth : 500;
    const svgHeight = height;

    const chartW = svgWidth - padding.left - padding.right;
    const chartH = svgHeight - padding.top - padding.bottom;
    const bottomY = padding.top + chartH;

    const points = data.map((d) => {
        const x = padding.left + (d.distance / maxDist) * chartW;
        const y = padding.top + chartH - ((d[yKey] - minVal) / valRange) * chartH;
        return { x, y, ...d };
    });

    return (
        <div 
            style={{ height, width: '100%' }} 
            ref={(el) => {
                if (el) {
                    const w = el.getBoundingClientRect().width;
                    if (w > 0 && Math.abs(w - containerWidth) > 1) {
                        setContainerWidth(w);
                    }
                }
            }}
        >
            {containerWidth > 0 && (
                <svg 
                    width="100%" 
                    height="100%" 
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
                    style={{ overflow: 'visible' }}
                >
                    {[0, 0.5, 1].map((ratio, i) => {
                        const y = padding.top + chartH * ratio;
                        const val = Math.round(maxVal - ratio * valRange);
                        const unit = yKey === 'elevation' ? 'm' : ' km/h';
                        return (
                            <g key={i}>
                                <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke={colors.border} strokeDasharray="3,3" strokeWidth="1" />
                                <text x={padding.left - 5} y={y + 3} fill={colors.textSecondary} fontSize="10" textAnchor="end">{val}{unit}</text>
                            </g>
                        );
                    })}

                    {points.map((p, idx) => {
                        if (idx === points.length - 1) return null;
                        const nextP = points[idx + 1];
                        const color = strokeColor || getSlopeColor(nextP.slopePct);
                        const segmentD = `M ${p.x} ${p.y} L ${nextP.x} ${nextP.y} L ${nextP.x} ${bottomY} L ${p.x} ${bottomY} Z`;

                        return (
                            <g key={`segment-${idx}`}>
                                <path
                                    d={segmentD}
                                    fill={color}
                                    fillOpacity={yKey === 'elevation' ? "0.25" : "0.15"}
                                />
                                <line
                                    x1={p.x}
                                    y1={p.y}
                                    x2={nextP.x}
                                    y2={nextP.y}
                                    stroke={color}
                                    strokeWidth="2.5"
                                />
                            </g>
                        );
                    })}

                    {points.map((p, idx) => (
                        <circle
                            key={idx}
                            cx={p.x}
                            cy={p.y}
                            r={selectedIndex === idx ? 6 : 4}
                            fill={selectedIndex === idx ? "#ffffff" : "transparent"}
                            stroke={selectedIndex === idx ? (strokeColor || getSlopeColor(p.slopePct)) : "transparent"}
                            strokeWidth="2"
                            style={{ cursor: 'pointer' }}
                            onClick={() => onSelectIndex(idx)}
                            onMouseEnter={() => onSelectIndex(idx)}
                        />
                    ))}

                    {selectedIndex !== null && points[selectedIndex] && (
                        <line
                            x1={points[selectedIndex].x}
                            y1={padding.top}
                            x2={points[selectedIndex].x}
                            y2={bottomY}
                            stroke="#f59e0b"
                            strokeDasharray="2,2"
                            strokeWidth="1.5"
                        />
                    )}
                </svg>
            )}
        </div>
    );
};

const AnalyserChart: React.FC<{
    data: GenericChartDatum[];
    yKey: 'elevation' | 'speed';
    height?: number;
    strokeColor?: string;
}> = ({ data, yKey, height = 130, strokeColor }) => {
    const { t } = useTranslation();
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

    useEffect(() => {
        if (!data || data.length === 0) {
            setSelectedIndex(null);
            return;
        }
        setSelectedIndex(prev => (prev === null || prev >= data.length ? Math.floor(data.length / 2) : prev));
    }, [data]);

    if (!data || data.length === 0) return null;

    const selectedDatum = selectedIndex !== null ? data[selectedIndex] : null;

    return (
        <div style={styles.chartWrapper}>
            {selectedDatum && (
                <div style={styles.tooltipContainer}>
                    <span style={styles.tooltipTextPrimary}>
                        {yKey === 'elevation' 
                            ? t('alt', { elevation: selectedDatum.elevation }) 
                            : `${selectedDatum.speed.toFixed(1)} km/h`}
                    </span>
                    <span style={styles.tooltipTextSecondary}>
                        {t('dist', { distance: selectedDatum.distance.toFixed(2) })}
                    </span>
                    {yKey === 'elevation' && (
                        <span style={styles.tooltipTextTertiary}>
                            {t('slope', { slopeDeg: selectedDatum.slopeDeg, slopePct: selectedDatum.slopePct })}
                        </span>
                    )}
                </div>
            )}

            <WebChart
                data={data}
                yKey={yKey}
                height={height}
                selectedIndex={selectedIndex}
                onSelectIndex={setSelectedIndex}
                colors={colors}
                strokeColor={strokeColor}
            />
        </div>
    );
};

export default function InteractiveSkiMap() {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const searchParams = useLocalSearchParams();
    const mapRef = useRef<MapRef>(null);
    const isInternalMoveRef = useRef(false);
    const [resorts, setResorts] = useState<ResortDetail[]>([]);
    const [hoveredResortId, setHoveredResortId] = useState<string | null>(null);
    const [selectedLegend, setSelectedLegend] = useState<boolean>(false);
    const [selectedFeature, setSelectedFeature] = useState<Piste | Lift | null>(null);
    const [selectedResort, setSelectedResort] = useState<Resort | null>(null);
    const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);
    const [trackPoints, setTrackPoints] = useState<any[]>([]);
    const [matchedPisteIds, setMatchedPisteIds] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'runs' | 'elevation' | 'speed'>('runs');
    const [selectedRun, setSelectedRun] = useState<any | null>(null);
    const [hoveredRun, setHoveredRun] = useState<any | null>(null);
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
                    const res = await api.get(`${API_BASE_URL}/ski-sessions/${searchParams.sessionId}`);
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
                    const request = await api.get<ResortDetail[]>(`${API_BASE_URL}/resorts/bbox`, {
                        params: {
                            minLon: searchParams.minLon,
                            minLat: searchParams.minLat,
                            maxLon: searchParams.maxLon,
                            maxLat: searchParams.maxLat
                        },
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

                    const request = await api.get<ResortDetail[]>(`${API_BASE_URL}/resorts/nearby`, {
                        params: {
                            lat: lat,
                            lon: lon,
                            radius: 50
                        },
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
    }, [searchParams.lat, searchParams.lon, searchParams.zoom, searchParams.minLon, searchParams.minLat, searchParams.maxLon, searchParams.maxLat, token]);

    // --- Layer styles ---
    const pisteLineStyle: LayerProps = {
        id: 'piste-lines',
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
            'line-dasharray': [
                'case',
                [
                    'any',
                    ['==', ['get', 'pisteType'], 'hike'],
                    ['==', ['get', 'pisteType'], 'skitour'],
                    ['==', ['get', 'grooming'], 'backcountry']
                ],
                ['literal', [2, 2]],
                ['literal', [1, 0]]
            ],
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

    const trackLineStyle: LayerProps = {
        id: 'track-line',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#8e44ad',
            'line-width': 4,
            'line-opacity': (hoveredRun || selectedRun) ? 0.35 : 0.9
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
            'text-halo-width': 1.5,
            'text-opacity': (hoveredRun || selectedRun) ? 0.35 : 0.9
        }
    };

    const highlightedRunCaseStyle: LayerProps = {
        id: 'highlighted-run-case',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#000000',
            'line-width': 12
        }
    };

    const highlightedRunLineStyle: LayerProps = {
        id: 'highlighted-run-line',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#e67e22',
            'line-width': 8
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
                'novice', '#81c784',
                'easy', '#90caf9',
                'intermediate', '#ef9a9a',
                'advanced', '#757575',
                '#cccccc'
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
                ['==', ['get', 'resortId'], selectedResort?.ID || ''], 8,
                3
            ],
            'line-dasharray': [2, 2]
        }
    };

    // --- Data transformation ---
    const pistesGeoJSON = useMemo(() => {
        const pistesFeatures = resorts?.flatMap(r => {
            if (!r.pistes || !Array.isArray(r.pistes)) return [];

            return r.pistes
                .filter(p => {
                    const geomType = p.GeometryGeoJSON?.type;
                    return geomType && geomType !== 'Polygon' && geomType !== 'MultiPolygon';
                })
                .flatMap(p => {
                    const segments = getOrientedDownhillSegments(p.GeometryGeoJSON);
                    return segments.map(segGeom => ({
                        type: 'Feature' as const,
                        properties: {
                            id: p.ID,
                            difficulty: p.Difficulty,
                            pisteType: p.PisteType,
                            grooming: p.Tags?.grooming,
                            name: p.Name || `Piste #${p.ID.slice(0, 4)}`,
                            resortName: r.Name,
                            resortId: r.ID
                        },
                        geometry: segGeom
                    }));
                });
        });
        return { type: 'FeatureCollection' as const, features: pistesFeatures };
    }, [resorts]);

    const liftsGeoJSON = useMemo(() => {
        const liftsFeatures = resorts?.flatMap(r => {
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
                        type: l.LiftType,
                        name: l.Name || `Lift #${l.ID.slice(0, 4)}`,
                        resortName: r.Name,
                        resortId: r.ID
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

    const highlightedRunGeoJSON = useMemo(() => {
        const run = hoveredRun || selectedRun;
        if (!run || !run.points || run.points.length === 0) {
            return { type: 'FeatureCollection' as const, features: [] };
        }
        return {
            type: 'FeatureCollection' as const,
            features: [{
                type: 'Feature' as const,
                properties: {},
                geometry: {
                    type: 'LineString' as const,
                    coordinates: run.points.map((p: any) => [p.lon, p.lat])
                }
            }]
        };
    }, [hoveredRun, selectedRun]);

    // --- Fetchers ---
    const fetchResortsByBounds = async (bounds: maplibregl.LngLatBounds) => {
        try {
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();

            const request = await api.get<ResortDetail[]>(`${API_BASE_URL}/resorts/bbox`, {
                params: {
                    minLon: sw.lng,
                    minLat: sw.lat,
                    maxLon: ne.lng,
                    maxLat: ne.lat
                },
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

                const request = await api.get<ResortDetail[]>(`${API_BASE_URL}/resorts/nearby`, {
                    params: {
                        lat: lat,
                        lon: lon,
                        radius: 50
                    },
                });
                if (request.status !== 200) {
                    throw new Error(`HTTP error! status: ${request.status}`);
                }
                setResorts(request.data);
            } catch (error) {
                console.error("Error fetching resorts:", error);
            }
        }

        isInternalMoveRef.current = true;
        router.setParams({ zoom: currentZoom.toFixed(0) })
    };

    const fetchResortWithDetails = async (resortId: string) => {
        try {
            const request = await api.get<Resort>(`${API_BASE_URL}/resorts/by-id/${resortId}`);
            if (request.status !== 200) {
                throw new Error(`HTTP error! status: ${request.status}`);
            }
            setSelectedResort(request.data);
            const map = mapRef.current?.getMap();
            if (!map) return;

            try {
                const lat = request.data.Latitude;
                const lon = request.data.Longitude;

                const requestResorts = await api.get<ResortDetail[]>(`${API_BASE_URL}/resorts/nearby`, {
                    params: {
                        lat: lat,
                        lon: lon,
                        radius: 50
                    },
                });
                if (requestResorts.status !== 200) {
                    throw new Error(`HTTP error! status: ${requestResorts.status}`);
                }
                setResorts(requestResorts.data);
            } catch (error) {
                console.error("Error fetching resorts:", error);
            }

            setSelectedFeature(null);
            if (viewState.zoom < 10) {
                setViewState(prev => ({
                    ...prev,
                    longitude: request.data.Longitude,
                    latitude: request.data.Latitude,
                    zoom: 12
                }));
            }
        } catch (error) {
            console.error("Error fetching resort details:", error);
        }
    };

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

    const handleMapClick = (event: any) => {
        const map = event.target;
        if (!map.isStyleLoaded() || viewState.zoom < 10) return;

        try {
            if (!map.getLayer('piste-lines') || !map.getLayer('lift-lines')) return;
            const features = map.queryRenderedFeatures(event.point, {
                layers: ['piste-lines', 'lift-lines']
            });

            if (!features.length) {
                setSelectedFeature(null);
                setSelectedResort(null);
                return;
            }

            const clickedFeature = features[0];
            const featureId = clickedFeature.properties.id;
            const isLift = clickedFeature.layer.id === 'lift-lines';

            for (const resort of resorts) {
                if (isLift && resort.lifts) {
                    const foundLift = resort.lifts.find(l => l.ID === featureId);
                    if (foundLift) {
                        setSelectedFeature(foundLift);
                        setSelectedResort(null);
                        return;
                    }
                } else if (!isLift && resort.pistes) {
                    const foundPiste = resort.pistes.find(p => p.ID === featureId);
                    if (foundPiste) {
                        setSelectedFeature(foundPiste);
                        setSelectedResort(null);
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

            isInternalMoveRef.current = true;

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
        <div style={styles.container}>
            {selectedLegend && (
                <LegendDetailPanel onClose={() => setSelectedLegend(false)} />
            )}
            {selectedFeature && (
                <MapDetailPanel
                    data={selectedFeature}
                    onClose={() => setSelectedFeature(null)}
                />
            )}
            {selectedResort && (
                <ResortDetailPanel
                    resort={selectedResort}
                    onClose={() => setSelectedResort(null)}
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
                style={{ width: '100%', height: '100%' }}
                mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
                mapLib={maplibregl}
                maplibreLogo={false}
                attributionControl={false}
            >
                <div style={styles.controlsContainer}>
                    <NavigationControl showCompass={true} showZoom={true} />

                    <button
                        onClick={() => {
                            setSelectedLegend(true);
                        }}
                    >
                        <CircleQuestionMark className="size-4" />
                    </button>
                </div>
                {resorts?.map(resort => (
                    <Marker
                        key={resort.ID}
                        longitude={resort.Longitude}
                        latitude={resort.Latitude}
                        anchor="bottom"
                        onClick={async (e) => {
                            if (e && e.originalEvent) {
                                e.originalEvent.stopPropagation();
                            }
                            await fetchResortWithDetails(resort.ID);
                        }}
                    >
                        <div
                            style={{ cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                            onMouseEnter={() => setHoveredResortId(resort.ID)}
                            onMouseLeave={() => setHoveredResortId(null)}
                        >
                            {(viewState.zoom >= 10 || hoveredResortId === resort.ID || selectedResort?.ID === resort.ID) && (
                                <div style={{
                                    backgroundColor: 'transparent',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    // color: selectedResort?.ID === resort.ID ? colors.primary : colors.textPrimary,
                                    color: colors.primary,
                                    textShadow: '0 0 3px #ffffff, 0 0 3px #ffffff, 0 0 3px #ffffff',
                                    whiteSpace: 'nowrap',
                                    marginBottom: '2px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}>
                                    {resort.Name}
                                </div>
                            )}
                            <div style={{
                                ...styles.markerPin,
                                backgroundColor: selectedResort?.ID === resort.ID ? colors.primary : colors.card,
                                color: selectedResort?.ID === resort.ID ? colors.textOnPrimary : colors.primary,
                                transform: selectedResort?.ID === resort.ID ? 'scale(1.1)' : 'scale(1)',
                            }}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '14px', height: '14px' }}>
                                    <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.157-1.127C18.061 17.7 22 13.666 22 9.5 22 4.253 17.523 0 12 0S2 4.253 2 9.5c0 4.166 3.939 8.2 8.18 11.724a16.977 16.977 0 001.36 1.127zm-1.54-12.85a2 2 0 114 0 2 2 0 01-4 0z" clipRule="evenodd" />
                                </svg>
                            </div>
                        </div>
                    </Marker>
                ))}

                {viewState.zoom >= 10 && (
                    <>
                        <Source id="pistes-source" type="geojson" data={pistesGeoJSON as any}>
                            <Layer {...pisteLineStyle} />
                            <Layer {...pisteLabelStyle} />
                            <Layer {...pisteDirectionStyle} />
                        </Source>

                        <Source id="lifts-source" type="geojson" data={liftsGeoJSON as any}>
                            <Layer {...liftLineStyle} />
                            <Layer {...liftLabelStyle} />
                        </Source>

                        {trackPoints.length > 0 && (
                            <>
                                <Source id="track-source" type="geojson" data={trackGeoJSON}>
                                    <Layer {...trackLineStyle} />
                                    <Layer {...trackDirectionStyle} />
                                </Source>
                                {(hoveredRun || selectedRun) && (
                                    <Source id="highlighted-run-source" type="geojson" data={highlightedRunGeoJSON}>
                                        <Layer {...highlightedRunCaseStyle} />
                                        <Layer {...highlightedRunLineStyle} />
                                    </Source>
                                )}
                            </>
                        )}
                    </>
                )}
            </Map>

            {searchParams.sessionId && trackPoints.length > 0 && (
                <div style={styles.analyserPanel}>
                    <div style={styles.analyserHeader}>
                        <div>
                            <h3 style={styles.analyserTitle}>{t('session_analyser')}</h3>
                            <p style={styles.analyserSubtitle}>
                                {sessionDetails ? `${t('date')}: ${new Date(sessionDetails.start_time).toLocaleDateString()}` : ''}
                            </p>
                        </div>
                        <button
                            type="button"
                            style={styles.closeButton}
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: `${SPACING.sm}px` }}>
                            <button
                                type="button"
                                style={styles.backButton}
                                onClick={() => setSelectedRun(null)}
                            >
                                {t('back_to_runs')}
                            </button>
                            <div style={styles.runDetailsCard}>
                                <h4 style={styles.runDetailsTitle}>{t('run_details', { index: selectedRun.index })}</h4>
                                <div style={styles.runDetailsGrid}>
                                    <div>{t('drop')}: {selectedRun.verticalDrop.toFixed(1)} m</div>
                                    <div>{t('max_speed')}: {selectedRun.maxSpeed.toFixed(1)} km/h</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: `${SPACING.xs}px` }}>
                                <div style={styles.profileLabel}>{t('elevation_profile')}</div>
                                <AnalyserChart data={computeChartData(selectedRun.points)} yKey="elevation" />

                                <div style={styles.profileLabel}>{t('speed_profile')}</div>
                                <AnalyserChart data={computeChartData(selectedRun.points)} yKey="speed" strokeColor={colors.danger} />
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: `${SPACING.sm}px` }}>
                            <div style={styles.tabsContainer}>
                                <button
                                    type="button"
                                    style={{
                                        ...styles.tabButton,
                                        ...(activeTab === 'runs' ? styles.tabButtonActive : {})
                                    }}
                                    onClick={() => setActiveTab('runs')}
                                >
                                    {t('runs')}
                                </button>
                                <button
                                    type="button"
                                    style={{
                                        ...styles.tabButton,
                                        ...(activeTab === 'elevation' ? styles.tabButtonActive : {})
                                    }}
                                    onClick={() => setActiveTab('elevation')}
                                >
                                    {t('elevation')}
                                </button>
                                <button
                                    type="button"
                                    style={{
                                        ...styles.tabButton,
                                        ...(activeTab === 'speed' ? styles.tabButtonActive : {})
                                    }}
                                    onClick={() => setActiveTab('speed')}
                                >
                                    {t('speed')}
                                </button>
                            </div>

                            {activeTab === 'runs' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: `${SPACING.xs}px` }}>
                                    <div style={styles.profileLabel}>{t('descent_runs')} ({detectedRuns.length})</div>
                                    <div style={styles.runsList}>
                                        {detectedRuns.map((run) => (
                                            <button
                                                key={run.id}
                                                type="button"
                                                style={styles.runItem}
                                                onMouseEnter={() => setHoveredRun(run)}
                                                onMouseLeave={() => setHoveredRun(null)}
                                                onClick={() => {
                                                    setSelectedRun(run);
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
                                                    <div style={styles.runItemTitle}>{t('run_title', { index: run.index })}</div>
                                                    <div style={styles.runItemSubtitle}>
                                                        {t('drop')}: {run.verticalDrop.toFixed(0)}m | {t('max_speed')}: {run.maxSpeed.toFixed(1)} km/h
                                                    </div>
                                                </div>
                                                <span style={styles.chartArrowText}>{t('charts')} →</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'elevation' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: `${SPACING.xs}px` }}>
                                    <div style={styles.profileLabel}>{t('elevation_profile')}</div>
                                    <AnalyserChart data={computeChartData(trackPoints)} yKey="elevation" />
                                </div>
                            )}

                            {activeTab === 'speed' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: `${SPACING.xs}px` }}>
                                    <div style={styles.profileLabel}>{t('speed_profile')}</div>
                                    <AnalyserChart data={computeChartData(trackPoints)} yKey="speed" strokeColor={colors.danger} />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const getStyles = (colors: typeof LIGHT_COLORS) => ({
    container: {
        flex: 1,
        width: '100%',
        height: '100%',
        position: 'relative' as const,
        backgroundColor: colors.background,
    },
    controlsContainer: {
        position: 'absolute' as const,
        bottom: '8px',
        right: '8px',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '6px',
    },
    helpButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px',
        width: '32px',
        height: '32px',
        borderRadius: `${BORDER_RADIUS.md}px`,
        cursor: 'pointer',
        backgroundColor: colors.card,
        border: `2px solid ${colors.border}`,
        fontWeight: '600' as const,
        boxShadow: '0 2px 4px rgba(0,0,0,0.07)',
    },
    markerPin: {
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid white',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'all 0.2s',
    },
    analyserPanel: {
        position: 'absolute' as const,
        left: '20px',
        top: '20px',
        bottom: '20px',
        width: '380px',
        height: 'auto',
        right: 'auto',
        zIndex: 40,
        backgroundColor: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: `${BORDER_RADIUS.xl}px`,
        padding: `${SPACING.md}px`,
        color: colors.textPrimary,
        maxHeight: 'calc(100% - 40px)',
        overflowY: 'auto' as const,
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: `${SPACING.sm}px`,
    },
    analyserHeader: {
        display: 'flex',
        flexDirection: 'row' as const,
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: `${SPACING.sm}px`,
        borderBottom: `1px solid ${colors.border}`,
        width: '100%',
    },
    analyserTitle: {
        fontWeight: 'bold',
        fontSize: '14px',
        margin: 0,
        color: colors.textPrimary,
    },
    analyserSubtitle: {
        fontSize: '10px',
        color: colors.textSecondary,
        margin: 0,
    },
    closeButton: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontWeight: 'bold',
        color: colors.textSecondary,
        fontSize: '14px',
    },
    backButton: {
        backgroundColor: colors.primary,
        padding: '8px 12px',
        border: 'none',
        borderRadius: `${BORDER_RADIUS.md}px`,
        cursor: 'pointer',
        color: colors.textOnPrimary,
        fontSize: '14px',
        alignSelf: 'flex-start',
    },
    runDetailsCard: {
        padding: `${SPACING.sm}px`,
        backgroundColor: colors.surface,
        borderRadius: `${BORDER_RADIUS.md}px`,
        border: `1px solid ${colors.border}`,
    },
    runDetailsTitle: {
        fontWeight: 'bold',
        fontSize: '12px',
        margin: 0,
        color: colors.textPrimary,
    },
    runDetailsGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
        marginTop: '4px',
        fontSize: '11px',
        color: colors.textSecondary,
    },
    profileLabel: {
        fontSize: '11px',
        fontWeight: '600' as const,
        color: colors.textSecondary,
        textTransform: 'uppercase' as const,
        marginTop: `${SPACING.sm}px`,
    },
    chartContainer: {
        height: '128px',
        backgroundColor: colors.surface,
        borderRadius: `${BORDER_RADIUS.md}px`,
        padding: '4px',
        border: `1px solid ${colors.border}`,
    },
    tabsContainer: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        backgroundColor: colors.surface,
        padding: '4px',
        borderRadius: `${BORDER_RADIUS.md}px`,
    },
    tabButton: {
        padding: '6px 12px',
        borderRadius: `${BORDER_RADIUS.sm}px`,
        cursor: 'pointer',
        border: 'none',
        fontSize: '12px',
        fontWeight: 'bold',
        backgroundColor: 'transparent',
        color: colors.textSecondary,
    },
    tabButtonActive: {
        backgroundColor: colors.primary,
        color: colors.textOnPrimary,
    },
    runsList: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '8px',
        // maxHeight: '288px',
        overflowY: 'auto' as const,
        paddingRight: '4px',
    },
    runItem: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.card,
        border: `1px solid ${colors.border}`,
        padding: `${SPACING.sm}px`,
        borderRadius: `${BORDER_RADIUS.md}px`,
        width: '100%',
        cursor: 'pointer',
        textAlign: 'left' as const,
    },
    runItemTitle: {
        fontWeight: 'bold',
        fontSize: '12px',
        color: colors.textPrimary,
    },
    runItemSubtitle: {
        fontSize: '10px',
        color: colors.textSecondary,
        marginTop: '2px',
    },
    chartArrowText: {
        fontSize: '11px',
        color: colors.primary,
        fontWeight: '500',
    },
    chartWrapper: {
        backgroundColor: colors.surface,
        padding: `${SPACING.sm}px`,
        borderRadius: `${BORDER_RADIUS.md}px`,
        border: `1px solid ${colors.border}`,
    },
    tooltipContainer: {
        display: 'flex',
        flexDirection: 'row' as const,
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingLeft: `${SPACING.sm}px`,
        paddingRight: `${SPACING.sm}px`,
        paddingTop: '6px',
        paddingBottom: '6px',
        marginBottom: `${SPACING.sm}px`,
        borderRadius: `${BORDER_RADIUS.sm}px`,
        backgroundColor: colors.card,
        border: `1px solid ${colors.border}`,
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    },
    tooltipTextPrimary: {
        fontSize: '10px',
        fontWeight: '600' as const,
        color: colors.textPrimary,
    },
    tooltipTextSecondary: {
        fontSize: '10px',
        color: colors.textSecondary,
    },
    tooltipTextTertiary: {
        fontSize: '10px',
        color: colors.textLight,
    },
});