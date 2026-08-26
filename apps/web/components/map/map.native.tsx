import {
    LngLatBounds,
    Camera as NativeCamera,
    GeoJSONSource as NativeGeoJSONSource,
    Layer as NativeLayer,
    Map as NativeMap,
    Marker as NativeMarker,
    type CameraRef,
} from '@maplibre/maplibre-react-native';
import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import { useOfflineMaps } from 'hooks/use-offline.hook';
import { ArrowLeft, CircleHelp, Download, MapPin, X } from 'lucide-react-native';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, processColor, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { API_BASE_URL } from 'constants/constants';
import { useAuth } from 'context/auth.context';
import { useToast } from 'context/toast.context';
import api from 'interceptor/api';
import { Lift, Piste, Resort, ResortDetail } from 'models/ski-resort.model';
import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from '../../constants/theme';
import { LegendDetailPanel } from './legend-detail-panel';
import { MapDetailPanel } from './map-detail-panel';
import { OfflineMapsModal } from './offline-maps-panel';
import { ResortDetailPanel } from './resort-detail-panel';

let LineChart: any = null;
if (Platform.OS !== 'web') {
    LineChart = require('react-native-charts-wrapper').LineChart;
}

const mapStyleUrl = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

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

const NativeChart: React.FC<{
    data: GenericChartDatum[];
    yKey: 'elevation' | 'speed';
    height: number;
    onSelectIndex: (index: number) => void;
    colors: typeof LIGHT_COLORS;
    styles: any;
    strokeColor?: string;
}> = ({ data, yKey, height, onSelectIndex, colors, styles, strokeColor }) => {
    if (!LineChart || !data || data.length === 0) return null;

    const chartValues = data.map(d => ({ x: d.distance, y: d[yKey] }));
    const circleColors = data.map(d => processColor(strokeColor || getSlopeColor(d.slopePct)));

    const segmentDataSets = [];

    for (let i = 0; i < data.length - 1; i++) {
        const p1 = data[i];
        const p2 = data[i + 1];
        const segmentColor = processColor(strokeColor || getSlopeColor(p2.slopePct));

        segmentDataSets.push({
            values: [
                { x: p1.distance, y: p1[yKey] },
                { x: p2.distance, y: p2[yKey] },
            ],
            label: `segment_${i}`,
            config: {
                color: segmentColor,
                lineWidth: 2.5,
                drawCircles: false,
                drawValues: false,
                drawFilled: true,
                fillColor: segmentColor,
                fillAlpha: yKey === 'elevation' ? 60 : 35,
            },
        });
    }

    segmentDataSets.push({
        values: chartValues,
        label: 'points_overlay',
        config: {
            color: processColor('transparent'),
            lineWidth: 0,
            drawCircles: false,
            circleRadius: 4,
            circleColors: circleColors,
            circleHoleColor: processColor('#ffffff'),
            drawCircleHole: true,
            drawValues: false,
            drawFilled: false,
        },
    });

    const formatStr = yKey === 'elevation' ? "###0'm'" : "###0.0'km/h'";

    return (
        <View style={{ height }}>
            <LineChart
                style={{ flex: 1 }}
                data={{
                    dataSets: segmentDataSets,
                }}
                xAxis={{
                    position: 'BOTTOM',
                    textColor: processColor(colors.textSecondary),
                    textSize: 9,
                    gridColor: processColor(colors.border),
                    gridDashedLine: { lineLength: 3, spaceLength: 3 },
                    valueFormatter: "###0.0'km'",
                    granularityEnabled: true,
                    granularity: 0.1,
                }}
                yAxis={{
                    left: {
                        textColor: processColor(colors.textSecondary),
                        textSize: 9,
                        gridColor: processColor(colors.border),
                        gridDashedLine: { lineLength: 3, spaceLength: 3 },
                        valueFormatter: formatStr,
                        spaceBottom: 15,
                        spaceTop: 15,
                    },
                    right: { enabled: false },
                }}
                legend={{ enabled: false }}
                chartDescription={{ text: '' }}
                touchEnabled={true}
                dragEnabled={true}
                scaleEnabled={false}
                scaleXEnabled={false}
                scaleYEnabled={false}
                pinchZoom={false}
                doubleTapToZoomEnabled={false}
                onSelect={(event: any) => {
                    const entry = event.nativeEvent;
                    if (entry && typeof entry.x === 'number') {
                        const index = data.findIndex(d => Math.abs(d.distance - entry.x) < 0.1);
                        if (index !== -1) onSelectIndex(index);
                    }
                }}
            />
        </View>
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
        <View style={styles.chartWrapper}>
            {selectedDatum && (
                <View style={styles.tooltipContainer}>
                    <Text style={styles.tooltipTextPrimary}>
                        {yKey === 'elevation'
                            ? t('alt', { elevation: selectedDatum.elevation })
                            : `${selectedDatum.speed.toFixed(1)} km/h`}
                    </Text>
                    <Text style={styles.tooltipTextSecondary}>
                        {t('dist', { distance: selectedDatum.distance.toFixed(2) })}
                    </Text>
                    {yKey === 'elevation' && (
                        <Text style={styles.tooltipTextTertiary}>
                            {t('slope', { slopeDeg: selectedDatum.slopeDeg, slopePct: selectedDatum.slopePct })}
                        </Text>
                    )}
                </View>
            )}

            <NativeChart
                data={data}
                yKey={yKey}
                height={height}
                onSelectIndex={setSelectedIndex}
                colors={colors}
                styles={styles}
                strokeColor={strokeColor}
            />
        </View>
    );
};

export default function InteractiveSkiMapNative() {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const networkState = useNetworkState();
    const searchParams = useLocalSearchParams();
    const cameraRef = useRef<CameraRef>(null);
    const lastInternalParamsRef = useRef<{ lat: string; lon: string; zoom: string } | null>(null);
    const syncParamsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestBoundsRef = useRef<{ minLon: string; minLat: string; maxLon: string; maxLat: string } | null>(null);
    const lastFetchedCenterRef = useRef<{ lat: number; lon: number } | null>(null);
    const lastFetchedZoomRef = useRef<number | null>(null);
    const lastFetchedBoundsRef = useRef<{ minLon: number; minLat: number; maxLon: number; maxLat: number } | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);
    const [resorts, setResorts] = useState<ResortDetail[]>([]);
    const [isLoadingResorts, setIsLoadingResorts] = useState<boolean>(false);
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
        zoom: parseFloat((searchParams.zoom as string) || '13'),
        bearing: 0,
        pitch: 0
    });
    const { token } = useAuth();

    const firstViewStateRef = useRef(viewState);
    const viewStateRef = useRef(viewState);
    viewStateRef.current = viewState;
    const skipNextUrlCameraRef = useRef(true);

    const applyExternalCameraMove = useCallback((longitude: number, latitude: number, zoom: number, duration = 0) => {
        setViewState(prev => {
            if (
                Math.abs(prev.longitude - longitude) < 1e-6 &&
                Math.abs(prev.latitude - latitude) < 1e-6 &&
                Math.abs(prev.zoom - zoom) < 0.05
            ) {
                return prev;
            }
            return { ...prev, longitude, latitude, zoom };
        });
        try {
            cameraRef.current?.easeTo({
                center: [longitude, latitude],
                zoom,
                duration,
            });
        } catch {
            // Camera is not mounted yet; initialViewState covers the first frame.
        }
    }, []);

    useEffect(() => {
        const latParam = Array.isArray(searchParams.lat) ? searchParams.lat[0] : searchParams.lat;
        const lonParam = Array.isArray(searchParams.lon) ? searchParams.lon[0] : searchParams.lon;
        const zoomParam = Array.isArray(searchParams.zoom) ? searchParams.zoom[0] : searchParams.zoom;

        if (!latParam || !lonParam) return;

        const lat = parseFloat(latParam);
        const lon = parseFloat(lonParam);
        const zoom = zoomParam ? parseFloat(zoomParam) : viewStateRef.current.zoom;
        if (isNaN(lat) || isNaN(lon) || isNaN(zoom)) return;

        const rounded = {
            lat: lat.toFixed(5),
            lon: lon.toFixed(5),
            zoom: zoom.toFixed(2),
        };

        const lastInternal = lastInternalParamsRef.current;
        if (lastInternal &&
            Math.abs(parseFloat(lastInternal.lat) - lat) < 1e-5 &&
            Math.abs(parseFloat(lastInternal.lon) - lon) < 1e-5 &&
            Math.abs(parseFloat(lastInternal.zoom) - zoom) < 0.05) {
            return;
        }

        lastInternalParamsRef.current = rounded;

        if (skipNextUrlCameraRef.current) {
            skipNextUrlCameraRef.current = false;
            return;
        }

        applyExternalCameraMove(lon, lat, zoom, 0);
    }, [searchParams.lat, searchParams.lon, searchParams.zoom, applyExternalCameraMove]);

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
                                applyExternalCameraMove(parsedPoints[0].lon, parsedPoints[0].lat, 14, 400);
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
                    showToast(t('failed_load_session'), 'error');
                }
            }
        };
        loadSessionData();
    }, [searchParams.sessionId, token, applyExternalCameraMove]);

    const fetchResortsData = useCallback(async (
        lat: number,
        lon: number,
        zoom: number,
        bounds?: { minLon: number; minLat: number; maxLon: number; maxLat: number }
    ) => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        if (zoom < 10) {
            if (!bounds) return;

            // If we have cached bounds and current bounds are fully inside them, skip API request
            if (
                lastFetchedBoundsRef.current &&
                bounds.minLon >= lastFetchedBoundsRef.current.minLon &&
                bounds.maxLon <= lastFetchedBoundsRef.current.maxLon &&
                bounds.minLat >= lastFetchedBoundsRef.current.minLat &&
                bounds.maxLat <= lastFetchedBoundsRef.current.maxLat
            ) {
                return;
            }

            setIsLoadingResorts(true);
            try {
                // Calculate padded bounds (50% larger than viewport to cache surrounding areas)
                const lonDelta = bounds.maxLon - bounds.minLon;
                const latDelta = bounds.maxLat - bounds.minLat;
                const minLonPadded = bounds.minLon - lonDelta * 0.25;
                const maxLonPadded = bounds.maxLon + lonDelta * 0.25;
                const minLatPadded = bounds.minLat - latDelta * 0.25;
                const maxLatPadded = bounds.maxLat + latDelta * 0.25;

                const request = await api.get<ResortDetail[]>(`${API_BASE_URL}/resorts/bbox`, {
                    params: {
                        minLon: minLonPadded.toString(),
                        minLat: minLatPadded.toString(),
                        maxLon: maxLonPadded.toString(),
                        maxLat: maxLatPadded.toString()
                    },
                    signal
                });
                if (request.status === 200) {
                    setResorts(request.data);
                    
                    // Save padded bounds as last fetched
                    lastFetchedBoundsRef.current = {
                        minLon: minLonPadded,
                        minLat: minLatPadded,
                        maxLon: maxLonPadded,
                        maxLat: maxLatPadded
                    };
                    // Reset nearby cache since we moved to bbox mode
                    lastFetchedCenterRef.current = null;
                    lastFetchedZoomRef.current = zoom;
                }
            } catch (error) {
                if (!axios.isCancel(error)) {
                    console.error("Error fetching resorts:", error);
                }
            } finally {
                setIsLoadingResorts(false);
            }
        } else {
            // Check if we already fetched nearby coordinates and if distance is < 15km
            if (
                lastFetchedCenterRef.current &&
                lastFetchedZoomRef.current !== null &&
                lastFetchedZoomRef.current >= 10 &&
                getDistance(lat, lon, lastFetchedCenterRef.current.lat, lastFetchedCenterRef.current.lon) < 15
            ) {
                return;
            }

            setIsLoadingResorts(true);
            try {
                const request = await api.get<ResortDetail[]>(`${API_BASE_URL}/resorts/nearby`, {
                    params: {
                        lat: lat,
                        lon: lon,
                        radius: 50
                    },
                    signal
                });
                if (request.status === 200) {
                    setResorts(request.data);

                    lastFetchedCenterRef.current = { lat, lon };
                    lastFetchedZoomRef.current = zoom;
                    // Reset bbox cache since we moved to nearby mode
                    lastFetchedBoundsRef.current = null;
                }
            } catch (error) {
                if (!axios.isCancel(error)) {
                    console.error("Error fetching resorts:", error);
                }
            } finally {
                setIsLoadingResorts(false);
            }
        }
    }, []);

    useEffect(() => {
        const loadInitial = async () => {
            console.log(`Current network type: ${JSON.stringify(networkState)}`);
            const boundsVal = latestBoundsRef.current;
            let bounds = undefined;
            if (boundsVal) {
                bounds = {
                    minLon: parseFloat(boundsVal.minLon),
                    minLat: parseFloat(boundsVal.minLat),
                    maxLon: parseFloat(boundsVal.maxLon),
                    maxLat: parseFloat(boundsVal.maxLat),
                };
            } else {
                bounds = {
                    minLon: viewState.longitude - 0.4,
                    minLat: viewState.latitude - 0.4,
                    maxLon: viewState.longitude + 0.4,
                    maxLat: viewState.latitude + 0.4,
                };
            }
            await fetchResortsData(viewState.latitude, viewState.longitude, viewState.zoom, bounds);
        };

        const timeout = setTimeout(loadInitial, 350);
        return () => clearTimeout(timeout);
    }, [viewState.latitude, viewState.longitude, viewState.zoom, token, networkState]);

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
            'text-size': 9.5,
            'text-offset': [0, -0],
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'text-optional': true,
            'text-rotation-alignment': 'map',
            'text-max-angle': 30
        },
        paint: {
            'line-color': [
                'match', ['get', 'difficulty'],
                'novice', '#81c784',
                'easy', '#90caf9',
                'intermediate', '#ef9a9a',
                'advanced', '#757575',
                '#cccccc'
            ],
            'text-halo-color': '#ffffff',
            'text-halo-width': 1
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
                'novice', '#81c784',
                'easy', '#90caf9',
                'intermediate', '#ef9a9a',
                'advanced', '#757575',
                '#cccccc'
            ],
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
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
            'text-offset': [0, -0],
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
            'line-color': '#8e44ad',
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
            'text-color': '#8e44ad',
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
            'line-color': '#e67e22',
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
                const baseGeom = normalizeGeoJSONLine(piste.GeometryGeoJSON) || normalizeGeoJSONLine(piste.Waypoints);
                if (!baseGeom) return [];
                const segments = getOrientedDownhillSegments(baseGeom);
                return segments.map(segGeom => ({
                    type: 'Feature' as const,
                    properties: {
                        id: piste.ID,
                        resortId: resort.ID,
                        name: piste.Name || 'Piste',
                        difficulty: piste.Difficulty?.toLowerCase() || 'novice',
                        pisteType: piste.PisteType?.toLowerCase() || 'downhill',
                        grooming: piste.Grooming?.toLowerCase() || 'classic'
                    },
                    geometry: segGeom
                }));
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
            const finalZoom = zoom !== undefined ? Number(zoom) : viewStateRef.current.zoom;

            setViewState(prev => {
                if (
                    Math.abs(prev.longitude - lon) < 1e-6 &&
                    Math.abs(prev.latitude - lat) < 1e-6 &&
                    Math.abs(prev.zoom - finalZoom) < 0.05
                ) {
                    return prev;
                }
                return {
                    ...prev,
                    longitude: lon,
                    latitude: lat,
                    zoom: finalZoom,
                };
            });

            let minLon = (lon - 0.1).toFixed(5);
            let minLat = (lat - 0.1).toFixed(5);
            let maxLon = (lon + 0.1).toFixed(5);
            let maxLat = (lat + 0.1).toFixed(5);

            if (Array.isArray(bounds) && bounds.length === 2 && Array.isArray(bounds[0]) && Array.isArray(bounds[1])) {
                minLon = Number(bounds[0][0]).toFixed(5);
                minLat = Number(bounds[0][1]).toFixed(5);
                maxLon = Number(bounds[1][0]).toFixed(5);
                maxLat = Number(bounds[1][1]).toFixed(5);
            } else if (Array.isArray(bounds) && bounds.length === 4) {
                minLon = Number(bounds[0]).toFixed(5);
                minLat = Number(bounds[1]).toFixed(5);
                maxLon = Number(bounds[2]).toFixed(5);
                maxLat = Number(bounds[3]).toFixed(5);
            } else if (bounds && typeof bounds === 'object' && 'ne' in bounds && 'sw' in bounds) {
                minLon = Number(bounds.sw[0]).toFixed(5);
                minLat = Number(bounds.sw[1]).toFixed(5);
                maxLon = Number(bounds.ne[0]).toFixed(5);
                maxLat = Number(bounds.ne[1]).toFixed(5);
            }

            latestBoundsRef.current = { minLon, minLat, maxLon, maxLat };

            const paramLat = lat.toFixed(5);
            const paramLon = lon.toFixed(5);
            const paramZoom = finalZoom.toFixed(2);
            lastInternalParamsRef.current = { lat: paramLat, lon: paramLon, zoom: paramZoom };

            if (syncParamsTimeoutRef.current) {
                clearTimeout(syncParamsTimeoutRef.current);
            }
            syncParamsTimeoutRef.current = setTimeout(() => {
                router.setParams({
                    lat: paramLat,
                    lon: paramLon,
                    zoom: paramZoom,
                    minLon,
                    minLat,
                    maxLon,
                    maxLat,
                });
            }, 400);
        }
    }, []);

    useEffect(() => {
        return () => {
            if (syncParamsTimeoutRef.current) {
                clearTimeout(syncParamsTimeoutRef.current);
            }
        };
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

    return (
        <View style={styles.container}>
            {isLoadingResorts && (
                <View style={styles.loadingBanner}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.loadingBannerText}>{t('loading_slopes')}</Text>
                </View>
            )}

            {!searchParams.sessionId && (
                <>
                    <TouchableOpacity
                        onPress={() => setSelectedLegend(true)}
                        style={styles.helpButton}
                    >
                        <CircleHelp size={18} color={colors.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setShowOfflineModal(true)}
                        style={styles.downloadButton}
                    >
                        <Download size={18} color={colors.primary} />
                        {packs.length > 0 && (
                            <View style={styles.indicatorDot} />
                        )}
                    </TouchableOpacity>
                </>
            )}

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
                <View style={styles.analyserPanel}>
                    <View style={styles.analyserHeader}>
                        <View>
                            <Text style={styles.analyserTitle}>{t('session_analyser')}</Text>
                            <Text style={styles.analyserSubtitle}>
                                {sessionDetails ? `${t('date')}: ${new Date(sessionDetails.start_time).toLocaleDateString()}` : ''}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => {
                                setTrackPoints([]);
                                setMatchedPisteIds([]);
                                setSelectedRun(null);
                                setSessionDetails(null);
                                router.setParams({ sessionId: '' });
                            }}
                        >
                            <X size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {selectedRun ? (
                        <ScrollView contentContainerStyle={styles.spaceY3}>
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={() => setSelectedRun(null)}
                            >
                                <ArrowLeft size={14} color={colors.primary} />
                                <Text style={styles.backButtonText}>{t('back_to_runs')}</Text>
                            </TouchableOpacity>

                            <View style={styles.runDetailsCard}>
                                <Text style={styles.runDetailsTitle}>{t('run_details', { index: selectedRun.index })}</Text>
                                <View style={styles.rowBetween}>
                                    <Text style={styles.textMuted}>{t('drop')}: {selectedRun.verticalDrop.toFixed(0)}m</Text>
                                    <Text style={styles.textMuted}>{t('max_speed')}: {selectedRun.maxSpeed.toFixed(1)} km/h</Text>
                                </View>
                            </View>

                            <View style={styles.spaceY2}>
                                <Text style={styles.profileLabel}>{t('elevation_profile')}</Text>
                                <AnalyserChart data={computeChartData(selectedRun.points)} yKey="elevation" />

                                <Text style={styles.profileLabel}>{t('speed_profile')}</Text>
                                <AnalyserChart data={computeChartData(selectedRun.points)} yKey="speed" strokeColor={colors.danger} />
                            </View>
                        </ScrollView>
                    ) : (
                        <View style={styles.spaceY3}>
                            <View style={styles.tabsContainer}>
                                <TouchableOpacity
                                    style={[styles.tabButton, activeTab === 'runs' && styles.tabButtonActive]}
                                    onPress={() => setActiveTab('runs')}
                                >
                                    <Text style={[styles.tabButtonText, activeTab === 'runs' && styles.tabButtonTextActive]}>{t('runs')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.tabButton, activeTab === 'elevation' && styles.tabButtonActive]}
                                    onPress={() => setActiveTab('elevation')}
                                >
                                    <Text style={[styles.tabButtonText, activeTab === 'elevation' && styles.tabButtonTextActive]}>{t('elevation')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.tabButton, activeTab === 'speed' && styles.tabButtonActive]}
                                    onPress={() => setActiveTab('speed')}
                                >
                                    <Text style={[styles.tabButtonText, activeTab === 'speed' && styles.tabButtonTextActive]}>{t('speed')}</Text>
                                </TouchableOpacity>
                            </View>

                            {activeTab === 'runs' && (
                                <ScrollView style={styles.runsScroll} contentContainerStyle={styles.spaceY2}>
                                    <Text style={styles.runsHeader}>{t('descent_runs')} ({detectedRuns.length})</Text>
                                    {detectedRuns.map((run) => (
                                        <TouchableOpacity
                                            key={run.id}
                                            style={styles.runItem}
                                            onPress={() => setSelectedRun(run)}
                                        >
                                            <View>
                                                <Text style={styles.runDetailsTitle}>{t('run_title', { index: run.index })}</Text>
                                                <Text style={styles.runItemText}>
                                                    {t('drop')}: {run.verticalDrop.toFixed(0)}m | {t('max_speed')}: {run.maxSpeed.toFixed(1)} km/h
                                                </Text>
                                            </View>
                                            <Text style={styles.backButtonText}>{t('charts')} →</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            )}

                            {activeTab === 'elevation' && (
                                <AnalyserChart data={computeChartData(trackPoints)} yKey="elevation" />
                            )}

                            {activeTab === 'speed' && (
                                <AnalyserChart data={computeChartData(trackPoints)} yKey="speed" strokeColor={colors.danger} />
                            )}
                        </View>
                    )}
                </View>
            )}

            <NativeMap
                style={styles.flex1}
                mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
                onRegionDidChange={handleNativeRegionDidChange}
                onPress={handleNativeMapPress}
                attribution={false}
                logo={false}
            >
                <NativeCamera
                    ref={cameraRef}
                    maxZoom={16}
                    initialViewState={{
                        zoom: firstViewStateRef.current.zoom,
                        center: [firstViewStateRef.current.longitude, firstViewStateRef.current.latitude],
                    }}
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
                            style={styles.markerContainer}
                        >
                            {(viewState.zoom >= 10 || hoveredResortId === resort.ID || selectedResort?.ID === resort.ID) && (
                                <Text style={{
                                    fontSize: 11,
                                    fontWeight: 'bold',
                                    color: colors.primary,
                                    textShadowColor: '#ffffff',
                                    textShadowOffset: { width: 0, height: 0 },
                                    textShadowRadius: 3,
                                    marginBottom: 2
                                }}>
                                    {resort.Name}
                                </Text>
                            )}
                            <View style={styles.markerPin}>
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

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        height: '100%',
        backgroundColor: colors.background,
        position: 'relative',
    },
    flex1: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    loadingBanner: {
        position: 'absolute',
        top: 16,
        alignSelf: 'center',
        zIndex: 60,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: BORDER_RADIUS.round,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        ...SHADOWS.md,
    },
    loadingBannerText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    helpButton: {
        position: 'absolute',
        bottom: 16,
        left: 16,
        zIndex: 50,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 12,
        borderRadius: BORDER_RADIUS.md,
        flexDirection: 'row',
        alignItems: 'center',
        ...SHADOWS.md,
    },
    downloadButton: {
        position: 'absolute',
        bottom: 16,
        left: 64,
        zIndex: 50,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 12,
        borderRadius: BORDER_RADIUS.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        ...SHADOWS.md,
    },
    indicatorDot: {
        width: 8,
        height: 8,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.success,
    },
    analyserPanel: {
        position: 'absolute',
        bottom: 20,
        left: 16,
        right: 16,
        zIndex: 40,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BORDER_RADIUS.xl,
        padding: SPACING.md,
        maxHeight: '45%',
        ...SHADOWS.lg,
    },
    analyserHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: SPACING.sm,
        borderBottomWidth: 1,
        borderColor: colors.border,
        marginBottom: SPACING.sm,
    },
    analyserTitle: {
        fontWeight: '800',
        fontSize: 14,
        color: colors.textPrimary,
    },
    analyserSubtitle: {
        fontSize: 10,
        color: colors.textSecondary,
    },
    closeButton: {
        padding: 6,
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.round,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.surface,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.sm,
        alignSelf: 'flex-start',
        marginBottom: 8,
    },
    backButtonText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.primary,
    },
    runDetailsCard: {
        backgroundColor: colors.surface,
        padding: SPACING.sm,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: SPACING.sm,
    },
    runDetailsTitle: {
        fontWeight: 'bold',
        fontSize: 12,
        color: colors.textPrimary,
    },
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    textMuted: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    profileLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.textLight,
        textTransform: 'uppercase',
        marginTop: SPACING.sm,
        marginBottom: 4,
    },
    chartContainer: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.sm,
        padding: 8,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        padding: 4,
        borderRadius: BORDER_RADIUS.md,
        marginBottom: SPACING.sm,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.sm,
        alignItems: 'center',
    },
    tabButtonActive: {
        backgroundColor: colors.primary,
    },
    tabButtonText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.textSecondary,
    },
    tabButtonTextActive: {
        color: colors.textOnPrimary,
    },
    runsScroll: {
        maxHeight: 200,
    },
    runsHeader: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.textSecondary,
        marginBottom: 8,
    },
    runItem: {
        backgroundColor: colors.surface,
        padding: 12,
        borderRadius: BORDER_RADIUS.sm,
        borderWidth: 1,
        borderColor: colors.border,
        marginVertical: 4,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    runItemText: {
        fontSize: 10,
        color: colors.textSecondary,
        marginTop: 2,
    },
    markerContainer: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    markerPin: {
        width: 24,
        height: 24,
        borderRadius: BORDER_RADIUS.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        borderWidth: 2,
        borderColor: '#FFFFFF',
        ...SHADOWS.md,
    },
    spaceY3: {
        gap: SPACING.sm,
    },
    spaceY2: {
        gap: 6,
    },
    chartWrapper: {
        backgroundColor: colors.surface,
        padding: SPACING.sm,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tooltipContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.sm,
        paddingVertical: 6,
        marginBottom: SPACING.sm,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        ...SHADOWS.sm,
    },
    tooltipTextPrimary: {
        fontSize: 10,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    tooltipTextSecondary: {
        fontSize: 10,
        color: colors.textSecondary,
    },
    tooltipTextTertiary: {
        fontSize: 10,
        color: colors.textLight,
    },
});
