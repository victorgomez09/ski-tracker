import {
    LngLatBounds,
    Camera as NativeCamera,
    GeoJSONSource as NativeGeoJSONSource,
    Layer as NativeLayer,
    Map as NativeMap,
    Marker as NativeMarker,
    RasterSource as NativeRasterSource,
    RasterDEMSource as NativeRasterDEMSource,
    type CameraRef,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useNetworkState } from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import { useOfflineMaps } from 'hooks/use-offline.hook';
import { ArrowLeft, CircleHelp, Clock, Crosshair, Download, Layers, MapPin, WifiOff, X } from 'lucide-react-native';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { offlineResortService } from 'services/offline-resort.service';
import { evaluateLiftClosureAlert } from 'utils/lift-closure.util';
import { getCurrentLocation } from 'tracking/task-manager';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, processColor, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { API_BASE_URL } from 'constants/constants';
import { getMapStyleValue, MAP_STYLE_STORAGE_KEY, MapStyleId } from 'constants/map-styles';
import { useAuth } from 'context/auth.context';
import { useToast } from 'context/toast.context';
import api from 'interceptor/api';
import { Lift, Piste, Resort, ResortDetail } from 'models/ski-resort.model';
import { ActivityType, ACTIVITY_CONFIGS } from 'models/activity.model';
import { formatDuration, formatPace, formatPaceFromMinPerKm } from 'components/tracking/hooks/use-live-stats';
import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from '../../constants/theme';
import { LegendDetailPanel } from './legend-detail-panel';
import { MapDetailPanel } from './map-detail-panel';
import { MapStyleSelectorModal } from './map-style-selector-modal';
import { OfflineMapsModal } from './offline-maps-panel';
import { ResortDetailPanel } from './resort-detail-panel';
import { RouteNavigationPanel } from './route-navigation-panel';
import { RouteOriginModal } from './route-origin-modal';
import { SkiRoutingEngine, RouteResult, SkillLevel, RouteLeg, calculateDistanceM } from '../../utils/ski-routing.util';

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

const orientLineDownhill = (
    coords: any[],
    piste?: Piste,
    resortLifts?: Lift[]
): any[] => {
    if (!coords || coords.length < 2) return coords;

    // 1. Check cumulative elevation change along line coordinates
    let totalAscent = 0;
    let totalDescent = 0;
    let validElevations = 0;

    for (let i = 0; i < coords.length - 1; i++) {
        const c0 = coords[i];
        const c1 = coords[i + 1];
        if (c0 && c1 && c0.length >= 3 && c1.length >= 3) {
            const e0 = Number(c0[2]);
            const e1 = Number(c1[2]);
            if (!isNaN(e0) && !isNaN(e1) && e0 > 0 && e1 > 0) {
                validElevations++;
                const diff = e1 - e0;
                if (diff > 0) totalAscent += diff;
                else totalDescent += Math.abs(diff);
            }
        }
    }

    if (validElevations >= 1 && (totalAscent > 0 || totalDescent > 0)) {
        if (totalAscent > totalDescent + 1.2) {
            return [...coords].reverse();
        }
        if (totalDescent > totalAscent + 1.2) {
            return coords;
        }
    }

    const first = coords[0];
    const last = coords[coords.length - 1];

    // Fallback: Check 3D coordinates elevation of endpoints if available
    if (first && last && first.length >= 3 && last.length >= 3) {
        const startElev = Number(first[2]);
        const endElev = Number(last[2]);
        if (!isNaN(startElev) && !isNaN(endElev) && Math.abs(startElev - endElev) > 1.5) {
            if (endElev > startElev) {
                return [...coords].reverse();
            }
            return coords;
        }
    }

    // 2. Check elevationProfile heights in tags
    const heights = piste?.Tags?.elevationProfile?.heights;
    if (Array.isArray(heights) && heights.length >= 2) {
        const hStart = Number(heights[0]);
        const hEnd = Number(heights[heights.length - 1]);
        if (!isNaN(hStart) && !isNaN(hEnd) && Math.abs(hStart - hEnd) > 1.5) {
            if (hEnd > hStart) {
                return [...coords].reverse();
            }
            return coords;
        }
    }

    // 3. Topological Lift Proximity Fallback (works for 2D coordinates)
    // Ski lifts ALWAYS transport passengers from Base (bottom) to Summit (top).
    // If coords[0] is closer to lift bases and coords[last] is closer to lift summits,
    // the piste was drawn bottom-to-top (uphill) and MUST be reversed!
    if (resortLifts && resortLifts.length > 0) {
        const liftBases: [number, number][] = [];
        const liftSummits: [number, number][] = [];

        resortLifts.forEach((l) => {
            const lc = l.GeometryGeoJSON?.coordinates;
            if (lc && lc.length >= 2) {
                const b = [lc[0][0], lc[0][1]] as [number, number];
                const s = [lc[lc.length - 1][0], lc[lc.length - 1][1]] as [number, number];
                if (lc[0].length >= 3 && lc[lc.length - 1].length >= 3) {
                    const e0 = Number(lc[0][2]);
                    const e1 = Number(lc[lc.length - 1][2]);
                    if (!isNaN(e0) && !isNaN(e1) && e0 > e1 + 1.5) {
                        liftBases.push(s);
                        liftSummits.push(b);
                        return;
                    }
                }
                liftBases.push(b);
                liftSummits.push(s);
            }
        });

        if (liftBases.length > 0 && liftSummits.length > 0) {
            const c0: [number, number] = [first[0], first[1]];
            const c1: [number, number] = [last[0], last[1]];

            const minBaseDist0 = Math.min(...liftBases.map((b) => calculateDistanceM(c0, b)));
            const minSummitDist0 = Math.min(...liftSummits.map((s) => calculateDistanceM(c0, s)));
            const minBaseDist1 = Math.min(...liftBases.map((b) => calculateDistanceM(c1, b)));
            const minSummitDist1 = Math.min(...liftSummits.map((s) => calculateDistanceM(c1, s)));

            // If c0 is closer to lift base and c1 is closer to lift summit:
            // c0 is base, c1 is summit => UPHILL! Must reverse so it flows summit -> base!
            if (minBaseDist0 < 350 && minSummitDist1 < 350 && minBaseDist0 < minSummitDist0 && minSummitDist1 < minBaseDist1) {
                return [...coords].reverse();
            }
            // If c0 is closer to lift summit and c1 is closer to lift base:
            // c0 is summit, c1 is base => DOWNHILL! Keep as-is.
            if (minSummitDist0 < 350 && minBaseDist1 < 350 && minSummitDist0 < minBaseDist0 && minBaseDist1 < minSummitDist1) {
                return coords;
            }
        }
    }

    return coords;
};

const getOrientedPisteGeometry = (
    geometry: any,
    piste?: Piste,
    resortLifts?: Lift[]
): any => {
    if (!geometry || !geometry.coordinates) return null;
    if (geometry.type === 'LineString') {
        return {
            type: 'LineString',
            coordinates: orientLineDownhill(geometry.coordinates, piste, resortLifts)
        };
    } else if (geometry.type === 'MultiLineString') {
        return {
            type: 'MultiLineString',
            coordinates: geometry.coordinates.map((line: any[]) =>
                orientLineDownhill(line, piste, resortLifts)
            )
        };
    }
    return geometry;
};

interface GenericChartDatum {
    distance: number;
    elevation: number;
    speed: number;
    slopePct: number;
    slopeDeg: number;
}

const parsePoint = (p: any) => {
    if (!p) return null;
    let lat: number | undefined;
    let lon: number | undefined;

    if (typeof p.lat === 'number' && !isNaN(p.lat)) lat = p.lat;
    else if (typeof p.latitude === 'number' && !isNaN(p.latitude)) lat = p.latitude;

    if (typeof p.lon === 'number' && !isNaN(p.lon)) lon = p.lon;
    else if (typeof p.lng === 'number' && !isNaN(p.lng)) lon = p.lng;
    else if (typeof p.longitude === 'number' && !isNaN(p.longitude)) lon = p.longitude;

    if ((lat === undefined || lon === undefined) && typeof p.geom === 'string') {
        const match = p.geom.match(/POINT\s*(?:Z\s*)?\(\s*([-\d.eE+]+)\s+([-\d.eE+]+)/i);
        if (match) {
            lon = parseFloat(match[1]);
            lat = parseFloat(match[2]);
        }
    } else if ((lat === undefined || lon === undefined) && p.geom?.coordinates && Array.isArray(p.geom.coordinates)) {
        lon = p.geom.coordinates[0];
        lat = p.geom.coordinates[1];
    }

    if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
        const alt = typeof p.altitude === 'number' && !isNaN(p.altitude) ? p.altitude : 0;
        const spd = typeof p.speed === 'number' && !isNaN(p.speed) ? p.speed : 0;
        return {
            lat,
            lon,
            altitude: alt,
            speed: spd,
            timestamp: p.timestamp
        };
    }
    return null;
};

const computeChartData = (points: any[]) => {
    if (!points || points.length === 0) return [];
    const validPoints = points
        .map(parsePoint)
        .filter((p): p is NonNullable<typeof p> => p !== null);

    if (validPoints.length === 0) return [];

    let cumulativeDistance = 0;
    return validPoints.map((p, idx) => {
        if (idx > 0) {
            const prev = validPoints[idx - 1];
            const d = getDistance(prev.lat, prev.lon, p.lat, p.lon);
            if (!isNaN(d)) cumulativeDistance += d;
        }
        const prevPoint = idx > 0 ? validPoints[idx - 1] : p;
        const elevDiff = p.altitude - prevPoint.altitude;
        const distDiff = idx > 0 ? getDistance(prevPoint.lat, prevPoint.lon, p.lat, p.lon) * 1000 : 0; // meters
        const slopePct = distDiff > 0.1 ? Math.round((elevDiff / distDiff) * 100 * 10) / 10 : 0;
        const slopeDeg = Math.round(Math.atan(Math.abs(slopePct) / 100) * (180 / Math.PI));

        return {
            distance: parseFloat(cumulativeDistance.toFixed(3)),
            elevation: Math.round(p.altitude),
            speed: parseFloat((p.speed * 3.6).toFixed(1)),
            slopePct: isNaN(slopePct) ? 0 : slopePct,
            slopeDeg: isNaN(slopeDeg) ? 0 : slopeDeg,
        };
    });
};

const downsampleData = (data: GenericChartDatum[], maxPoints = 120): GenericChartDatum[] => {
    if (!data || data.length <= maxPoints) return data || [];
    const step = (data.length - 1) / (maxPoints - 1);
    const sampled: GenericChartDatum[] = [];
    for (let i = 0; i < maxPoints - 1; i++) {
        sampled.push(data[Math.floor(i * step)]);
    }
    sampled.push(data[data.length - 1]);
    return sampled;
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
    const sampledData = useMemo(() => {
        if (!data || data.length === 0) return [];
        return downsampleData(data, 120);
    }, [data]);

    if (!LineChart || !data || data.length === 0) return null;

    const chartValues = sampledData.map(d => ({ x: d.distance, y: d[yKey] }));
    const color = strokeColor || (yKey === 'elevation' ? colors.primary : colors.danger);

    const dataSets = [{
        values: chartValues,
        label: yKey,
        config: {
            color: processColor(color),
            lineWidth: 2.5,
            drawCircles: false,
            drawValues: false,
            drawFilled: true,
            fillColor: processColor(color),
            fillAlpha: yKey === 'elevation' ? 60 : 35,
            mode: 'CUBIC_BEZIER',
        },
    }];

    const formatStr = yKey === 'elevation' ? "###0'm'" : "###0.0'km/h'";

    return (
        <View style={{ height }}>
            <LineChart
                style={{ flex: 1 }}
                data={{ dataSets }}
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

    if (!data || data.length === 0) return null;

    const activeIndex = selectedIndex !== null && selectedIndex < data.length ? selectedIndex : Math.floor(data.length / 2);
    const selectedDatum = data[activeIndex] || null;

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
    const isFetchingRef = useRef(false);

    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);
    const [resorts, setResorts] = useState<ResortDetail[]>([]);
    const [isLoadingResorts, setIsLoadingResorts] = useState<boolean>(true);
    const [hoveredResortId, setHoveredResortId] = useState<string | null>(null);
    const [selectedLegend, setSelectedLegend] = useState<boolean>(false);
    const [selectedFeature, setSelectedFeature] = useState<Piste | Lift | null>(null);
    const [chartHoverPoint, setChartHoverPoint] = useState<[number, number] | null>(null);
    const [selectedResort, setSelectedResort] = useState<Resort | ResortDetail | null>(null);
    const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);
    const [trackPoints, setTrackPoints] = useState<any[]>([]);
    const [matchedPisteIds, setMatchedPisteIds] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'runs' | 'elevation' | 'speed'>('runs');
    const [selectedRun, setSelectedRun] = useState<any | null>(null);
    const [hoveredRun, setHoveredRun] = useState<any | null>(null);
    const [sessionDetails, setSessionDetails] = useState<any | null>(null);
    const [showOfflineModal, setShowOfflineModal] = useState(false);
    const [mapStyleId, setMapStyleId] = useState<MapStyleId>('outdoor');
    const [showMapStyleModal, setShowMapStyleModal] = useState(false);
    const [is3DMode, setIs3DMode] = useState(false);

    // Ski Routing State
    const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null);
    const [routeDestination, setRouteDestination] = useState<{ piste: Piste; coord?: [number, number] } | null>(null);
    const [routeOriginCoord, setRouteOriginCoord] = useState<[number, number] | null>(null);
    const [routeOrigin, setRouteOrigin] = useState<{
        coord: [number, number];
        name: string;
        piste?: Piste;
        lift?: Lift;
    } | null>(null);
    const [showOriginModal, setShowOriginModal] = useState(false);
    const [isSelectingRouteOrigin, setIsSelectingRouteOrigin] = useState(false);
    const [routeSkillLevel, setRouteSkillLevel] = useState<SkillLevel>('all');
    const [fastLifts, setFastLifts] = useState(false);
    const [badWeather, setBadWeather] = useState(false);
    const [isLoadingGps, setIsLoadingGps] = useState(false);

    const liftClosureStatus = useMemo(() => {
        const lifts = selectedResort?.lifts || [];
        if (lifts.length === 0) {
            return { alertActive: false, message: '', urgent: false, closingTimeStr: '', recommendedDepartureStr: '' };
        }
        return evaluateLiftClosureAlert(lifts, selectedResort || undefined);
    }, [selectedResort]);

    const isSelectingRouteOriginRef = useRef(isSelectingRouteOrigin);
    const routeDestinationRef = useRef(routeDestination);
    const routeOriginRef = useRef(routeOrigin);
    useEffect(() => {
        isSelectingRouteOriginRef.current = isSelectingRouteOrigin;
    }, [isSelectingRouteOrigin]);
    useEffect(() => {
        routeDestinationRef.current = routeDestination;
    }, [routeDestination]);
    useEffect(() => {
        routeOriginRef.current = routeOrigin;
    }, [routeOrigin]);

    const [viewState, setViewState] = useState({
        longitude: parseFloat((searchParams.lon as string) || (searchParams.lng as string) || '0'),
        latitude: parseFloat((searchParams.lat as string) || '40.0'),
        zoom: parseFloat((searchParams.zoom as string) || '13'),
        bearing: 0,
        pitch: 0
    });

    const toggle3DMode = useCallback((forced?: boolean) => {
        setIs3DMode((prev) => {
            const next = typeof forced === 'boolean' ? forced : !prev;
            const targetPitch = next ? 55 : 0;
            setViewState((v) => {
                try {
                    cameraRef.current?.easeTo({
                        center: [v.longitude, v.latitude],
                        pitch: targetPitch,
                        bearing: next ? v.bearing : 0,
                        duration: 600,
                    });
                } catch {}
                return { ...v, pitch: targetPitch, bearing: next ? v.bearing : 0 };
            });
            AsyncStorage.setItem('PREF_MAP_3D', String(next)).catch(() => {});
            return next;
        });
    }, []);

    useEffect(() => {
        const loadMapStyle = async () => {
            try {
                const saved = await AsyncStorage.getItem(MAP_STYLE_STORAGE_KEY);
                if (saved && ['outdoor', 'topo', 'satellite', 'streets', 'dark'].includes(saved)) {
                    setMapStyleId(saved as MapStyleId);
                }
                const saved3D = await AsyncStorage.getItem('PREF_MAP_3D');
                if (saved3D === 'true') {
                    setIs3DMode(true);
                }
            } catch {}
        };
        loadMapStyle();
    }, []);

    const {
        packs,
        downloadingPack,
        downloadingProgress,
        downloadRegion,
        deletePack,
    } = useOfflineMaps(getMapStyleValue(mapStyleId) as any);

    const isSnowLayer = mapStyleId === 'outdoor';

    const detectedRuns = useMemo(() => {
        if (trackPoints.length === 0) return [];
        
        // Only ski and snowboard sessions have downhill runs
        const sessionActivity = (sessionDetails?.activity_type || 'ski') as ActivityType;
        if (sessionActivity !== 'ski' && sessionActivity !== 'snowboard') {
            return [];
        }

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
    }, [trackPoints, sessionDetails?.activity_type]);

    const { token } = useAuth();

    const [initialCameraState] = useState(() => ({
        zoom: viewState.zoom,
        center: [viewState.longitude, viewState.latitude] as [number, number],
    }));
    const viewStateRef = useRef(viewState);
    useEffect(() => {
        viewStateRef.current = viewState;
    }, [viewState]);
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

    const fetchResortsData = useCallback(async (
        lat: number,
        lon: number,
        zoom: number,
        bounds?: { minLon: number; minLat: number; maxLon: number; maxLat: number }
    ) => {
        if (searchParams.sessionId || mapStyleId !== 'outdoor') {
            setIsLoadingResorts(false);
            if (mapStyleId !== 'outdoor') {
                setResorts([]);
            }
            return;
        }

        if (networkState?.isConnected === false) {
            setIsLoadingResorts(false);
            try {
                // 1. Prioritize full offline resort packs with complete pistes, lifts, and POIs
                const offlineFullResorts = await offlineResortService.getAllOfflineResorts();
                if (offlineFullResorts.length > 0) {
                    setResorts(offlineFullResorts);
                    return;
                }
                // 2. Fallback to cached resorts
                const existingCached = await AsyncStorage.getItem('cached_resorts');
                if (existingCached) {
                    const parsed: ResortDetail[] = JSON.parse(existingCached);
                    setResorts(parsed);
                } else {
                    setResorts([]);
                }
            } catch (e) {
                console.error('Error reading cached resorts offline:', e);
                setResorts([]);
            }
            return;
        }

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

            isFetchingRef.current = true;
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
                    const data = Array.isArray(request.data) ? request.data : [];
                    setResorts(data);

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

                    // Cache resorts in AsyncStorage
                    try {
                        const existingCached = await AsyncStorage.getItem('cached_resorts');
                        let resortsToCache = data;
                        if (existingCached) {
                            const parsed = JSON.parse(existingCached);
                            if (Array.isArray(parsed)) {
                                const merged = [...parsed];
                                data.forEach(newResort => {
                                    if (newResort && !merged.some(r => r?.ID === newResort.ID)) {
                                        merged.push(newResort);
                                    }
                                });
                                resortsToCache = merged;
                            }
                        }
                        await AsyncStorage.setItem('cached_resorts', JSON.stringify(resortsToCache));
                    } catch (e) {
                        console.error('Error caching resorts:', e);
                    }
                }
            } catch (error) {
                if (!axios.isCancel(error)) {
                    console.error("Error fetching resorts:", error);
                    setIsLoadingResorts(false);
                    // Network failure fallback to offline packs
                    try {
                        const offlineFull = await offlineResortService.getAllOfflineResorts();
                        if (offlineFull.length > 0) {
                            setResorts(offlineFull);
                        }
                    } catch {}
                } else if (!signal.aborted) {
                    setIsLoadingResorts(false);
                }
            } finally {
                if (!signal.aborted) {
                    isFetchingRef.current = false;
                    setTimeout(() => {
                        setIsLoadingResorts(false);
                    }, 250);
                }
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

            isFetchingRef.current = true;
            setIsLoadingResorts(true);
            try {
                const request = await api.get<ResortDetail[]>(`${API_BASE_URL}/resorts/nearby`, {
                    params: {
                        lat: lat,
                        lon: lon,
                        radius: 15
                    },
                    signal
                });
                if (request.status === 200) {
                    const data = Array.isArray(request.data) ? request.data : [];
                    setResorts(data);

                    lastFetchedCenterRef.current = { lat, lon };
                    lastFetchedZoomRef.current = zoom;
                    // Reset bbox cache since we moved to nearby mode
                    lastFetchedBoundsRef.current = null;

                    // Cache resorts in AsyncStorage
                    try {
                        const existingCached = await AsyncStorage.getItem('cached_resorts');
                        let resortsToCache = data;
                        if (existingCached) {
                            const parsed = JSON.parse(existingCached);
                            if (Array.isArray(parsed)) {
                                const merged = [...parsed];
                                data.forEach(newResort => {
                                    if (newResort && !merged.some(r => r?.ID === newResort.ID)) {
                                        merged.push(newResort);
                                    }
                                });
                                resortsToCache = merged;
                            }
                        }
                        await AsyncStorage.setItem('cached_resorts', JSON.stringify(resortsToCache));
                    } catch (e) {
                        console.error('Error caching resorts:', e);
                    }
                }
            } catch (error) {
                if (!axios.isCancel(error)) {
                    console.error("Error fetching resorts:", error);
                    setIsLoadingResorts(false);
                    // Network failure fallback to offline packs
                    try {
                        const offlineFull = await offlineResortService.getAllOfflineResorts();
                        if (offlineFull.length > 0) {
                            setResorts(offlineFull);
                        }
                    } catch {}
                } else if (!signal.aborted) {
                    setIsLoadingResorts(false);
                }
            } finally {
                if (!signal.aborted) {
                    isFetchingRef.current = false;
                    setTimeout(() => {
                        setIsLoadingResorts(false);
                    }, 250);
                }
            }
        }
    }, [networkState, packs, mapStyleId]);

    useEffect(() => {
        const rawLat = searchParams.lat;
        const rawLon = searchParams.lon || searchParams.lng;
        const latParam = Array.isArray(rawLat) ? rawLat[0] : rawLat;
        const lonParam = Array.isArray(rawLon) ? rawLon[0] : rawLon;
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
        const isInternalDuplicate = lastInternal &&
            Math.abs(parseFloat(lastInternal.lat) - lat) < 1e-4 &&
            Math.abs(parseFloat(lastInternal.lon) - lon) < 1e-4 &&
            Math.abs(parseFloat(lastInternal.zoom) - zoom) < 0.05;

        if (isInternalDuplicate) {
            return;
        }

        lastInternalParamsRef.current = rounded;
        skipNextUrlCameraRef.current = false;

        applyExternalCameraMove(lon, lat, zoom, 300);
        fetchResortsData(lat, lon, zoom);
    }, [searchParams.lat, searchParams.lon, searchParams.lng, searchParams.zoom, applyExternalCameraMove, fetchResortsData]);

    useEffect(() => {
        const loadSessionData = async () => {
            if (searchParams.sessionId) {
                try {
                    const res = await api.get(`${API_BASE_URL}/ski-sessions/${searchParams.sessionId}`);
                    if (res.status === 200 && res.data) {
                        const session = res.data.data || res.data;
                        setSessionDetails(session);
                        if (session.points && Array.isArray(session.points) && session.points.length > 0) {
                            const parsedPoints = session.points
                                .map(parsePoint)
                                .filter((p: any) => p !== null);
                            setTrackPoints(parsedPoints);

                            if (parsedPoints.length > 0) {
                                const targetLon = parsedPoints[0].lon;
                                const targetLat = parsedPoints[0].lat;
                                if (!isNaN(targetLon) && !isNaN(targetLat)) {
                                    applyExternalCameraMove(targetLon, targetLat, 14, 400);
                                }
                            }
                        }
                        if (session.runs && Array.isArray(session.runs)) {
                            const ids = session.runs
                                .map((r: any) => r.matched_piste_id)
                                .filter(Boolean);
                            setMatchedPisteIds(ids);
                            const sessionActivity = (session.activity_type || 'ski') as ActivityType;
                            if (session.runs.length > 0 && (sessionActivity === 'ski' || sessionActivity === 'snowboard')) {
                                setActiveTab('runs');
                            } else {
                                setActiveTab('elevation');
                            }
                        } else {
                            setActiveTab('elevation');
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

    useEffect(() => {
        if (mapStyleId !== 'outdoor') {
            queueMicrotask(() => {
                setIsLoadingResorts(false);
                setResorts([]);
            });
            return;
        }

        const loadInitial = async () => {
            // When opening a session, wait for the session data to center camera first
            if (searchParams.sessionId && (!searchParams.lat || !searchParams.lon)) {
                return;
            }

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
    }, [viewState.latitude, viewState.longitude, viewState.zoom, token, networkState, searchParams.sessionId, mapStyleId]);

    const pisteCasingStyle: any = {
        id: 'piste-casing',
        sourceID: 'pistes-source',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': [
                'match', ['get', 'difficulty'],
                'novice', '#00703c',
                'easy', '#005299',
                'intermediate', '#b71c1c',
                'advanced', '#000000',
                'expert', '#000000',
                '#616161'
            ],
            'line-width': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], 10,
                0
            ],
            'line-opacity': selectedFeature?.ID ? 1 : 0
        }
    };

    const pisteLineStyle: any = {
        id: 'piste-lines',
        sourceID: 'pistes-source',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': [
                'match', ['get', 'difficulty'],
                'novice', '#00a859',
                'easy', '#0072bc',
                'intermediate', '#f0141e',
                'advanced', '#000000',
                'expert', '#000000',
                '#94A3B8'
            ],
            'line-dasharray': [1, 0],
            'line-width': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], 7,
                ['==', ['get', 'id'], hoveredFeatureId || ''], 8,
                ['==', ['get', 'resortId'], selectedResort?.ID || ''], 8,
                ['in', ['get', 'id'], ['literal', matchedPisteIds.length > 0 ? matchedPisteIds : ['__none__']]], 7,
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
            'text-color': [
                'match', ['get', 'difficulty'],
                'novice', '#00a859',
                'easy', '#0072bc',
                'intermediate', '#f0141e',
                'advanced', '#000000',
                'expert', '#000000',
                '#94A3B8'
            ],
            'text-halo-color': '#ffffff',
            'text-halo-width': 1
        }
    };

    const pisteDirectionStyle: any = {
        id: 'piste-directions',
        sourceID: 'pistes-source',
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
                'novice', '#00a859',
                'easy', '#0072bc',
                'intermediate', '#f0141e',
                'advanced', '#000000',
                'expert', '#000000',
                '#94A3B8'
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
                ['==', ['get', 'id'], selectedFeature?.ID || ''], '#2557C7',
                ['==', ['get', 'id'], hoveredFeatureId || ''], '#3B76F6',
                ['==', ['get', 'resortId'], selectedResort?.ID || ''], '#1E293B',
                '#475569'
            ],
            'line-width': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], 5,
                ['==', ['get', 'id'], hoveredFeatureId || ''], 4,
                ['==', ['get', 'resortId'], selectedResort?.ID || ''], 4,
                2.5
            ],
            'line-dasharray': [3, 2]
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
            'text-color': '#475569',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
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
            'line-color': '#2557C7',
            'line-width': 6.5
        }
    };

    const highlightedRunCaseStyle: any = {
        id: 'highlighted-run-case',
        sourceID: 'highlighted-run-source',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#ffffff',
            'line-width': 10.5,
            'line-opacity': 0.95
        }
    };

    const getFeatureFromEvent = useCallback((e: any): Piste | Lift | undefined => {
        const features = e?.features ?? e?.nativeEvent?.features ?? [];
        if (!Array.isArray(features) || features.length === 0) return undefined;

        const feature = features[0];
        if (!feature?.properties?.id) return undefined;

        const featureId = feature.properties.id;
        for (const resort of (resorts || [])) {
            if (!resort) continue;
            const found = resort.pistes?.find(p => p?.ID === featureId) || resort.lifts?.find(l => l?.ID === featureId);
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
        const features = (resorts || []).flatMap(resort => {
            if (!resort || !Array.isArray(resort.pistes)) return [];
            return resort.pistes.map(piste => {
                if (!piste) return null;
                const baseGeom = normalizeGeoJSONLine(piste.GeometryGeoJSON) || normalizeGeoJSONLine(piste.Waypoints);
                if (!baseGeom) return null;
                const geom = getOrientedPisteGeometry(baseGeom, piste, resort.lifts);
                if (!geom) return null;
                return {
                    type: 'Feature' as const,
                    properties: {
                        id: piste.ID,
                        resortId: resort.ID,
                        name: piste.Name || 'Piste',
                        difficulty: piste.Difficulty ? piste.Difficulty.toLowerCase() : 'easy',
                        pisteType: piste.PisteType?.toLowerCase() || 'downhill',
                        grooming: piste.Grooming?.toLowerCase() || 'classic'
                    },
                    geometry: geom
                };
            }).filter((f): f is NonNullable<typeof f> => Boolean(f));
        });
        return { type: 'FeatureCollection' as const, features: features as any };
    }, [resorts]);

    const liftsGeoJSON = useMemo(() => {
        const features = (resorts || []).flatMap(resort => {
            if (!resort || !Array.isArray(resort.lifts)) return [];
            return resort.lifts.flatMap(lift => {
                if (!lift) return [];
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
            });
        });
        return { type: 'FeatureCollection' as const, features: features as any };
    }, [resorts]);

    const trackGeoJSON = useMemo(() => {
        if (!trackPoints || trackPoints.length === 0) return { type: 'FeatureCollection' as const, features: [] };
        const coordinates = trackPoints
            .filter(p => typeof p?.lon === 'number' && typeof p?.lat === 'number' && !isNaN(p.lon) && !isNaN(p.lat))
            .map(p => [p.lon, p.lat]);
        if (coordinates.length === 0) return { type: 'FeatureCollection' as const, features: [] };
        // GeoJSON LineString requires at least 2 points
        const validCoords = coordinates.length === 1 ? [coordinates[0], coordinates[0]] : coordinates;
        return {
            type: 'FeatureCollection' as const,
            features: [{
                type: 'Feature' as const,
                properties: {},
                geometry: {
                    type: 'LineString' as const,
                    coordinates: validCoords
                }
            }]
        };
    }, [trackPoints]);

    const trackDirectionGeoJSON = useMemo(() => {
        if (!trackPoints || trackPoints.length < 2) return { type: 'FeatureCollection' as const, features: [] };

        const coordinates = trackPoints
            .filter(p => typeof p?.lon === 'number' && typeof p?.lat === 'number' && !isNaN(p.lon) && !isNaN(p.lat))
            .map(p => [p.lon, p.lat]);
        if (coordinates.length < 2) return { type: 'FeatureCollection' as const, features: [] };

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
        const coordinates = activeHighlightedRun.points
            .filter((p: any) => typeof p?.lon === 'number' && typeof p?.lat === 'number' && !isNaN(p.lon) && !isNaN(p.lat))
            .map((p: any) => [p.lon, p.lat]);
        if (coordinates.length === 0) return { type: 'FeatureCollection' as const, features: [] };
        const validCoords = coordinates.length === 1 ? [coordinates[0], coordinates[0]] : coordinates;
        return {
            type: 'FeatureCollection' as const,
            features: [{
                type: 'Feature' as const,
                properties: {},
                geometry: {
                    type: 'LineString' as const,
                    coordinates: validCoords
                }
            }]
        };
    }, [activeHighlightedRun]);

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

    // --- Active Route GeoJSON & Routing Engine ---
    const routeGeoJSON = useMemo(() => {
        if (!activeRoute) return null;
        if (activeRoute.legs && activeRoute.legs.length > 0) {
            const features = activeRoute.legs
                .filter((leg) => leg.coordinates && leg.coordinates.length >= 2)
                .map((leg, idx) => ({
                    type: 'Feature' as const,
                    properties: {
                        id: `leg-${idx}`,
                        kind: leg.kind, // 'run', 'lift', 'walk'
                        name: leg.name,
                        difficulty: leg.difficulty || '',
                    },
                    geometry: {
                        type: 'LineString' as const,
                        coordinates: leg.coordinates,
                    },
                }));
            if (features.length > 0) {
                return {
                    type: 'FeatureCollection' as const,
                    features,
                };
            }
        }
        if (activeRoute.fullCoordinates && activeRoute.fullCoordinates.length >= 2) {
            return {
                type: 'FeatureCollection' as const,
                features: [
                    {
                        type: 'Feature' as const,
                        properties: { kind: 'run' },
                        geometry: {
                            type: 'LineString' as const,
                            coordinates: activeRoute.fullCoordinates,
                        },
                    },
                ],
            };
        }
        return null;
    }, [activeRoute]);

    const routingEngine = useMemo(() => {
        if (!resorts || resorts.length === 0) return null;
        const allPistes = resorts.flatMap((r) =>
            (r?.pistes || []).map((p) => {
                const baseGeom = normalizeGeoJSONLine(p.GeometryGeoJSON) || normalizeGeoJSONLine(p.Waypoints);
                const geom = baseGeom ? getOrientedPisteGeometry(baseGeom, p, r?.lifts) : null;
                return geom ? { ...p, GeometryGeoJSON: geom } : p;
            })
        );
        const allLifts = resorts.flatMap((r) => r?.lifts || []);
        if (allPistes.length === 0) return null;
        return new SkiRoutingEngine(allPistes, allLifts);
    }, [resorts]);

    const executeRouting = useCallback(
        (
            originCoord: [number, number],
            originName: string,
            destPiste: Piste,
            destCoord?: [number, number],
            level: SkillLevel = routeSkillLevel,
            originPiste?: Piste,
            originLift?: Lift
        ) => {
            if (!routingEngine) {
                alert(t('no_route_found', 'No se pudo calcular la ruta: mapa no disponible'));
                return;
            }
            const result = routingEngine.calculateRoute(
                originCoord,
                destPiste,
                destCoord,
                { level, fastLifts, badWeather },
                originPiste,
                originLift
            );
            if (result.success) {
                result.originName = originName;
                setActiveRoute(result);
                setRouteOriginCoord(originCoord);
                const origObj = {
                    coord: originCoord,
                    name: originName,
                    piste: originPiste,
                    lift: originLift,
                };
                setRouteOrigin(origObj);
                routeOriginRef.current = origObj;
                setTimeout(() => {
                    if (result.fullCoordinates.length >= 2) {
                        let minLon = result.fullCoordinates[0][0], maxLon = result.fullCoordinates[0][0];
                        let minLat = result.fullCoordinates[0][1], maxLat = result.fullCoordinates[0][1];
                        result.fullCoordinates.forEach(([lon, lat]) => {
                            if (lon < minLon) minLon = lon;
                            if (lon > maxLon) maxLon = lon;
                            if (lat < minLat) minLat = lat;
                            if (lat > maxLat) maxLat = lat;
                        });
                        try {
                            cameraRef.current?.fitBounds(
                                [minLon, minLat, maxLon, maxLat],
                                { padding: { top: 60, right: 60, bottom: 60, left: 60 }, duration: 800 }
                            );
                        } catch {}
                    }
                }, 150);
            } else {
                alert(t(result.error || 'no_route_found', 'No se encontró un trayecto esquiable entre estos puntos.'));
            }
        },
        [routingEngine, routeSkillLevel, fastLifts, badWeather, t]
    );

    const handleReturnToBase = useCallback(async () => {
        if (!routingEngine) return;
        try {
            let startCoord: [number, number] | null = routeOriginCoord;
            if (!startCoord) {
                const loc = await getCurrentLocation();
                if (loc) {
                    startCoord = [loc.coords.longitude, loc.coords.latitude];
                } else if (selectedResort) {
                    startCoord = [selectedResort.Longitude, selectedResort.Latitude];
                }
            }
            if (!startCoord) return;

            const result = routingEngine.calculateReturnToBase(startCoord, {
                level: routeSkillLevel,
                fastLifts,
                badWeather,
            });
            if (result.success) {
                setActiveRoute(result);
                setRouteOriginCoord(startCoord);
                setTimeout(() => {
                    if (result.fullCoordinates.length >= 2) {
                        let minLon = result.fullCoordinates[0][0], maxLon = result.fullCoordinates[0][0];
                        let minLat = result.fullCoordinates[0][1], maxLat = result.fullCoordinates[0][1];
                        result.fullCoordinates.forEach(([lon, lat]) => {
                            if (lon < minLon) minLon = lon;
                            if (lon > maxLon) maxLon = lon;
                            if (lat < minLat) minLat = lat;
                            if (lat > maxLat) maxLat = lat;
                        });
                        try {
                            cameraRef.current?.fitBounds(
                                [minLon, minLat, maxLon, maxLat],
                                { padding: { top: 60, right: 60, bottom: 60, left: 60 }, duration: 800 }
                            );
                        } catch {}
                    }
                }, 150);
            } else {
                alert(t(result.error || 'no_route_found', 'No se encontró un trayecto hacia la base.'));
            }
        } catch (e) {
            console.error('Error calculating return to base:', e);
        }
    }, [routingEngine, routeOriginCoord, selectedResort, routeSkillLevel, fastLifts, badWeather, t]);

    const handleUseCurrentLocation = useCallback(async (destPiste?: Piste, destCoord?: [number, number]) => {
        const dest = destPiste ? { piste: destPiste, coord: destCoord } : (routeDestinationRef.current || routeDestination);
        if (!dest) return;
        setIsLoadingGps(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setIsLoadingGps(false);
                alert(t('gps_error', 'Permiso de ubicación denegado.'));
                return;
            }
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            setIsLoadingGps(false);
            setShowOriginModal(false);
            executeRouting(
                [location.coords.longitude, location.coords.latitude],
                t('origin_current_gps', 'Mi posición GPS'),
                dest.piste,
                dest.coord,
                routeSkillLevel
            );
        } catch (err) {
            console.warn('Location error:', err);
            setIsLoadingGps(false);
            alert(t('gps_error', 'No se pudo obtener la posición GPS actual.'));
        }
    }, [routeDestination, executeRouting, routeSkillLevel, t]);

    const handleInitiateRoute = useCallback((targetPiste: Piste, targetCoord?: [number, number], originMode?: 'gps' | 'map') => {
        setRouteDestination({ piste: targetPiste, coord: targetCoord });
        routeDestinationRef.current = { piste: targetPiste, coord: targetCoord };
        setSelectedFeature(null);
        if (originMode === 'gps') {
            handleUseCurrentLocation(targetPiste, targetCoord);
        } else if (originMode === 'map') {
            setShowOriginModal(false);
            setIsSelectingRouteOrigin(true);
        } else {
            setShowOriginModal(true);
        }
    }, [handleUseCurrentLocation]);

    const handleLevelChange = useCallback(
        (newLevel: SkillLevel) => {
            setRouteSkillLevel(newLevel);
            const orig = routeOriginRef.current;
            const dest = routeDestinationRef.current;
            if (orig && dest) {
                executeRouting(
                    orig.coord,
                    orig.name,
                    dest.piste,
                    dest.coord,
                    newLevel,
                    orig.piste,
                    orig.lift
                );
            }
        },
        [executeRouting]
    );

    const handleSelectRouteLeg = useCallback((leg: RouteLeg) => {
        if (!leg.coordinates || leg.coordinates.length < 2) return;
        let minLon = leg.coordinates[0][0], maxLon = leg.coordinates[0][0];
        let minLat = leg.coordinates[0][1], maxLat = leg.coordinates[0][1];
        leg.coordinates.forEach(([lon, lat]) => {
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        });
        try {
            cameraRef.current?.fitBounds(
                [minLon, minLat, maxLon, maxLat],
                { padding: { top: 80, right: 80, bottom: 80, left: 80 }, duration: 600 }
            );
        } catch {}
    }, []);

    const handleFitRoute = useCallback(() => {
        if (!activeRoute || activeRoute.fullCoordinates.length < 2) return;
        let minLon = activeRoute.fullCoordinates[0][0], maxLon = activeRoute.fullCoordinates[0][0];
        let minLat = activeRoute.fullCoordinates[0][1], maxLat = activeRoute.fullCoordinates[0][1];
        activeRoute.fullCoordinates.forEach(([lon, lat]) => {
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        });
        try {
            cameraRef.current?.fitBounds(
                [minLon, minLat, maxLon, maxLat],
                { padding: { top: 60, right: 60, bottom: 60, left: 60 }, duration: 800 }
            );
        } catch {}
    }, [activeRoute]);

    const handleNativeFeaturePress = useCallback((e: any) => {
        const found = getFeatureFromEvent(e);
        if (isSelectingRouteOriginRef.current && routeDestinationRef.current) {
            const dest = routeDestinationRef.current;
            const coords = (found?.GeometryGeoJSON?.coordinates as any)?.[0] || e?.geometry?.coordinates;
            const clickCoord: [number, number] = (coords && Array.isArray(coords) && coords.length >= 2)
                ? [coords[0], coords[1]]
                : [0, 0];
            const originPiste = found && !(found as any).LiftType ? (found as Piste) : undefined;
            const originLift = found && (found as any).LiftType ? (found as Lift) : undefined;
            isSelectingRouteOriginRef.current = false;
            setIsSelectingRouteOrigin(false);
            executeRouting(
                clickCoord,
                found?.Name || 'Pista',
                dest.piste,
                dest.coord,
                routeSkillLevel,
                originPiste,
                originLift
            );
            return;
        }
        if (found) {
            setChartHoverPoint(null);
            setSelectedFeature(found);
        }
    }, [getFeatureFromEvent, executeRouting, routeSkillLevel]);

    const handleNativeMapPress = useCallback((e: any) => {
        if (isSelectingRouteOriginRef.current && routeDestinationRef.current) {
            const dest = routeDestinationRef.current;
            const coords = e?.geometry?.coordinates;
            const clickCoord: [number, number] = (coords && Array.isArray(coords) && coords.length >= 2)
                ? [coords[0], coords[1]]
                : [0, 0];
            const found = getFeatureFromEvent(e);
            const originName = found?.Name || t('selected_point', 'Punto seleccionado');
            const originPiste = found && !(found as any).LiftType ? (found as Piste) : undefined;
            const originLift = found && (found as any).LiftType ? (found as Lift) : undefined;
            isSelectingRouteOriginRef.current = false;
            setIsSelectingRouteOrigin(false);
            executeRouting(
                clickCoord,
                originName,
                dest.piste,
                dest.coord,
                routeSkillLevel,
                originPiste,
                originLift
            );
            return;
        }
        const found = getFeatureFromEvent(e);
        if (found) {
            setChartHoverPoint(null);
            setSelectedFeature(found);
            return;
        }
        setSelectedFeature(null);
        setChartHoverPoint(null);
    }, [getFeatureFromEvent, executeRouting, routeSkillLevel, t]);

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
            <NativeMap
                style={styles.flex1}
                mapStyle={getMapStyleValue(mapStyleId) as any}
                onRegionDidChange={handleNativeRegionDidChange}
                onPress={handleNativeMapPress}
                attribution={false}
                logo={false}
                onDidFinishRenderingMapFully={() => {
                    if (!isFetchingRef.current) {
                        setIsLoadingResorts(false);
                    }
                }}
            >
                <NativeCamera
                    ref={cameraRef}
                    maxZoom={16}
                    pitch={viewState.pitch}
                    bearing={viewState.bearing}
                    initialViewState={initialCameraState}
                />

                <NativeRasterDEMSource
                    id="maplibre-dem"
                    tiles={['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']}
                    encoding="terrarium"
                    tileSize={256}
                    maxzoom={14}
                />

                <NativeRasterSource
                    id="terrain-hillshade-source"
                    tiles={[
                        'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
                    ]}
                    tileSize={256}
                    maxzoom={17}
                >
                    <NativeLayer
                        id="terrain-hillshade-layer"
                        type="raster"
                        style={{
                            rasterOpacity: is3DMode ? 0.38 : 0.18,
                        }}
                    />
                </NativeRasterSource>
                {!searchParams.sessionId && isSnowLayer && (resorts || []).filter(r => Boolean(r && r.ID)).map((resort) => (
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

                {!searchParams.sessionId && isSnowLayer && viewState.zoom >= 10 && (
                    <>
                        <NativeGeoJSONSource id="pistes-source" data={pistesGeoJSON} onPress={handleNativeFeaturePress} hitbox={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                            <NativeLayer {...pisteCasingStyle} />
                            <NativeLayer {...pisteLineStyle} onPress={handleNativeFeaturePress} />
                            <NativeLayer {...pisteLabelStyle} onPress={handleNativeFeaturePress} />
                            <NativeLayer {...pisteDirectionStyle} onPress={handleNativeFeaturePress} />
                        </NativeGeoJSONSource>

                        <NativeGeoJSONSource id="lifts-source" data={liftsGeoJSON} onPress={handleNativeFeaturePress} hitbox={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                            <NativeLayer {...liftLineStyle} onPress={handleNativeFeaturePress} />
                            <NativeLayer {...liftLabelStyle} onPress={handleNativeFeaturePress} />
                        </NativeGeoJSONSource>
                    </>
                )}

                {trackPoints.length > 0 && (
                    <>
                        <NativeGeoJSONSource id="track-source" data={trackGeoJSON}>
                            <NativeLayer {...trackLineStyle} />
                        </NativeGeoJSONSource>
                        {(hoveredRun || selectedRun) && (
                            <NativeGeoJSONSource id="highlighted-run-source" data={highlightedRunGeoJSON}>
                                <NativeLayer {...highlightedRunCaseStyle} />
                                <NativeLayer {...highlightedRunLineStyle} />
                            </NativeGeoJSONSource>
                        )}
                    </>
                )}
                {chartHoverGeoJSON && (
                    <NativeGeoJSONSource id="chart-hover-source" data={chartHoverGeoJSON}>
                        <NativeLayer {...chartHoverPointStyle} />
                    </NativeGeoJSONSource>
                )}

                {routeGeoJSON && (
                    <NativeGeoJSONSource id="active-route-source" data={routeGeoJSON}>
                        <NativeLayer
                            id="active-route-casing"
                            type="line"
                            style={{
                                lineCap: 'round',
                                lineJoin: 'round',
                                lineColor: '#ffffff',
                                lineWidth: 10,
                                lineOpacity: 0.88,
                            }}
                        />
                        {/* Downhill pistes */}
                        <NativeLayer
                            id="active-route-run"
                            type="line"
                            filter={['==', ['get', 'kind'], 'run']}
                            style={{
                                lineCap: 'round',
                                lineJoin: 'round',
                                lineColor: '#2563eb',
                                lineWidth: 6,
                                lineOpacity: 1,
                            }}
                        />
                        {/* Walking transitions / snow links */}
                        <NativeLayer
                            id="active-route-walk"
                            type="line"
                            filter={['==', ['get', 'kind'], 'walk']}
                            style={{
                                lineCap: 'round',
                                lineJoin: 'round',
                                lineColor: '#f59e0b',
                                lineWidth: 4,
                                lineDasharray: [2, 2],
                                lineOpacity: 0.95,
                            }}
                        />
                        <NativeLayer
                            id="active-route-lift"
                            type="line"
                            filter={['==', ['get', 'kind'], 'lift']}
                            style={{
                                lineCap: 'round',
                                lineJoin: 'round',
                                lineColor: '#0284c7',
                                lineWidth: 5,
                                lineDasharray: [2, 2],
                                lineOpacity: 1,
                            }}
                        />
                    </NativeGeoJSONSource>
                )}

                {activeRoute && activeRoute.fullCoordinates.length >= 2 && (
                    <>
                        <NativeMarker
                            id="route-start-marker"
                            lngLat={activeRoute.fullCoordinates[0]}
                        >
                            <View style={{
                                width: 26,
                                height: 26,
                                borderRadius: 13,
                                backgroundColor: '#16a34a',
                                borderWidth: 3,
                                borderColor: '#ffffff',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: 'bold' }}>A</Text>
                            </View>
                        </NativeMarker>

                        <NativeMarker
                            id="route-dest-marker"
                            lngLat={activeRoute.fullCoordinates[activeRoute.fullCoordinates.length - 1]}
                        >
                            <View style={{
                                width: 26,
                                height: 26,
                                borderRadius: 13,
                                backgroundColor: '#dc2626',
                                borderWidth: 3,
                                borderColor: '#ffffff',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: 'bold' }}>B</Text>
                            </View>
                        </NativeMarker>
                    </>
                )}
            </NativeMap>

            {!searchParams.sessionId && isSnowLayer && isLoadingResorts && (
                <View style={styles.loadingBanner} pointerEvents="none">
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

                    <TouchableOpacity
                        onPress={() => setShowMapStyleModal(true)}
                        style={styles.layersButton}
                    >
                        <Layers size={18} color={colors.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => toggle3DMode()}
                        style={[
                            styles.dim3dButton,
                            is3DMode && { backgroundColor: colors.primary, borderColor: colors.primary }
                        ]}
                    >
                        <Text style={[styles.dim3dButtonText, is3DMode && { color: '#FFFFFF' }]}>
                            {is3DMode ? '3D' : '2D'}
                        </Text>
                    </TouchableOpacity>
                </>
            )}

            {selectedLegend && (
                <LegendDetailPanel onClose={() => setSelectedLegend(false)} />
            )}

            <MapStyleSelectorModal
                visible={showMapStyleModal}
                onClose={() => setShowMapStyleModal(false)}
                selectedStyle={mapStyleId}
                is3DMode={is3DMode}
                onToggle3D={(enabled) => toggle3DMode(enabled)}
                onSelect={async (newStyle) => {
                    setMapStyleId(newStyle);
                    try {
                        await AsyncStorage.setItem(MAP_STYLE_STORAGE_KEY, newStyle);
                    } catch {}
                }}
            />

            {showOfflineModal && (
                <OfflineMapsModal
                    onClose={() => setShowOfflineModal(false)}
                    packs={packs}
                    downloadingPack={downloadingPack}
                    downloadProgress={downloadingProgress}
                    onDownloadCurrentArea={handleDownloadCurrentView}
                    onDeletePack={deletePack}
                    currentResortName={selectedResort?.Name}
                    currentResortId={selectedResort?.ID}
                    mapStyleUrl={getMapStyleValue(mapStyleId) as string}
                />
            )}

            {/* Offline and Lift Closure Alert Banners */}
            <View style={styles.topStatusBannersContainer} pointerEvents="box-none">
                {networkState?.isConnected === false && (
                    <View style={styles.offlineBanner}>
                        <WifiOff size={12} color="#b45309" />
                        <Text style={styles.offlineBannerText}>
                            {t('offline_map_active', 'Modo 100% Offline · Estaciones descargadas disponibles')}
                        </Text>
                    </View>
                )}

                {liftClosureStatus.alertActive && (
                    <View style={[styles.liftClosureBanner, liftClosureStatus.urgent && styles.liftClosureBannerUrgent]}>
                        <Clock size={13} color={liftClosureStatus.urgent ? '#dc2626' : '#b45309'} />
                        <Text style={[styles.liftClosureText, liftClosureStatus.urgent && styles.liftClosureTextUrgent]} numberOfLines={2}>
                            {liftClosureStatus.message}
                        </Text>
                    </View>
                )}
            </View>

            {selectedFeature && (
                <MapDetailPanel 
                    data={selectedFeature} 
                    onClose={() => { setSelectedFeature(null); setChartHoverPoint(null); }}
                    onChartPointSelected={setChartHoverPoint}
                    onCalculateRoute={handleInitiateRoute}
                />
            )}

            {selectedResort && (
                <ResortDetailPanel resort={selectedResort} onClose={() => setSelectedResort(null)} />
            )}

            <RouteOriginModal
                visible={showOriginModal}
                targetPiste={routeDestination?.piste || null}
                onClose={() => setShowOriginModal(false)}
                isLoadingLocation={isLoadingGps}
                onSelectCurrentLocation={handleUseCurrentLocation}
                onSelectPickOnMap={() => {
                    setShowOriginModal(false);
                    setIsSelectingRouteOrigin(true);
                }}
            />

            {activeRoute && (
                <RouteNavigationPanel
                    route={activeRoute}
                    resortName={routeDestination?.piste?.Name || selectedResort?.Name}
                    currentLevel={routeSkillLevel}
                    onClose={() => {
                        setActiveRoute(null);
                        setRouteDestination(null);
                        setRouteOriginCoord(null);
                        setRouteOrigin(null);
                        routeOriginRef.current = null;
                    }}
                    onFitBounds={handleFitRoute}
                    onChangeOrigin={() => {
                        setShowOriginModal(true);
                    }}
                    onLevelChange={handleLevelChange}
                    onSelectLeg={handleSelectRouteLeg}
                    fastLifts={fastLifts}
                    onToggleFastLifts={() => {
                        const next = !fastLifts;
                        setFastLifts(next);
                        const orig = routeOriginRef.current;
                        const dest = routeDestinationRef.current;
                        if (orig && dest) {
                            executeRouting(
                                orig.coord,
                                orig.name,
                                dest.piste,
                                dest.coord,
                                routeSkillLevel,
                                orig.piste,
                                orig.lift
                            );
                        }
                    }}
                    badWeather={badWeather}
                    onToggleBadWeather={() => {
                        const next = !badWeather;
                        setBadWeather(next);
                        const orig = routeOriginRef.current;
                        const dest = routeDestinationRef.current;
                        if (orig && dest) {
                            executeRouting(
                                orig.coord,
                                orig.name,
                                dest.piste,
                                dest.coord,
                                routeSkillLevel,
                                orig.piste,
                                orig.lift
                            );
                        }
                    }}
                    onReturnToBase={handleReturnToBase}
                    departureAlertStr={liftClosureStatus.alertActive ? liftClosureStatus.recommendedDepartureStr : undefined}
                />
            )}

            {isSelectingRouteOrigin && (
                <View style={styles.originSelectingBanner}>
                    <View style={styles.originSelectingBannerContent}>
                        <Crosshair size={18} color="#FFFFFF" />
                        <Text style={styles.originSelectingBannerText}>
                            {t('tap_map_for_origin_dest', 'Marcando origen para ir a {{destination}}. Toca una pista o remonte de salida.', { destination: routeDestination?.piste?.Name || 'Destino' })}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => setIsSelectingRouteOrigin(false)}
                        style={styles.originSelectingCancelBtn}
                    >
                        <Text style={styles.originSelectingCancelBtnText}>
                            {t('cancel', 'Cancelar')}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {searchParams.sessionId && trackPoints.length > 0 && (() => {
                const sessionActivity = (sessionDetails?.activity_type || 'ski') as ActivityType;
                const sessionConfig = ACTIVITY_CONFIGS[sessionActivity] || ACTIVITY_CONFIGS.ski;
                const hasRuns = detectedRuns && detectedRuns.length > 0;

                return (
                    <View style={styles.analyserPanel}>
                        <View style={styles.analyserHeader}>
                            <View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 16 }}>{sessionConfig.icon}</Text>
                                    <Text style={styles.analyserTitle}>
                                        {sessionDetails ? t(sessionConfig.labelKey, sessionConfig.defaultLabel) : t('session_analyser')}
                                    </Text>
                                </View>
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

                        {/* Adaptive Summary Quick Chips */}
                        {sessionDetails && !selectedRun && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, marginVertical: SPACING.xs }}>
                                <View style={{ alignItems: 'center', flex: 1 }}>
                                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.textPrimary }}>
                                        {((sessionDetails.total_distance || 0) / 1000).toFixed(2)} <Text style={{ fontSize: 9, color: colors.textSecondary }}>km</Text>
                                    </Text>
                                    <Text style={{ fontSize: 9, color: colors.textSecondary }}>{t('distance', 'Distancia')}</Text>
                                </View>
                                {sessionActivity === 'walk' || sessionActivity === 'hike' ? (
                                    <View style={{ alignItems: 'center', flex: 1 }}>
                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.textPrimary }}>
                                            {sessionDetails.pace && sessionDetails.pace > 0 
                                                ? formatPaceFromMinPerKm(sessionDetails.pace) 
                                                : formatPace((sessionDetails.avg_speed || 0) * 3.6)}
                                        </Text>
                                        <Text style={{ fontSize: 9, color: colors.textSecondary }}>{t('pace', 'Ritmo')}</Text>
                                    </View>
                                ) : (
                                    <View style={{ alignItems: 'center', flex: 1 }}>
                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.textPrimary }}>
                                            {((sessionDetails.max_speed || 0) * 3.6).toFixed(1)} <Text style={{ fontSize: 9, color: colors.textSecondary }}>km/h</Text>
                                        </Text>
                                        <Text style={{ fontSize: 9, color: colors.textSecondary }}>{t('max_speed', 'Vel. Máx')}</Text>
                                    </View>
                                )}
                                <View style={{ alignItems: 'center', flex: 1 }}>
                                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.textPrimary }}>
                                        {sessionDetails.elevation_gain && sessionDetails.elevation_gain > 0 
                                            ? `+${Math.round(sessionDetails.elevation_gain)}m`
                                            : `${Math.round(sessionDetails.vertical_drop || 0)}m`}
                                    </Text>
                                    <Text style={{ fontSize: 9, color: colors.textSecondary }}>
                                        {sessionDetails.elevation_gain ? 'D+' : t('drop', 'Desnivel')}
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'center', flex: 1 }}>
                                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.textPrimary }}>
                                        {formatDuration(sessionDetails.moving_time || sessionDetails.duration || 0)}
                                    </Text>
                                    <Text style={{ fontSize: 9, color: colors.textSecondary }}>{t('duration', 'Tiempo')}</Text>
                                </View>
                            </View>
                        )}

                        {selectedRun ? (
                            <ScrollView
                                style={{ flex: 1, maxHeight: 320 }}
                                contentContainerStyle={styles.spaceY3}
                                showsVerticalScrollIndicator={false}
                                nestedScrollEnabled={true}
                            >
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
                                    <AnalyserChart data={computeChartData(selectedRun.points)} yKey="elevation" height={100} />

                                    <Text style={styles.profileLabel}>{t('speed_profile')}</Text>
                                    <AnalyserChart data={computeChartData(selectedRun.points)} yKey="speed" strokeColor={colors.danger} height={100} />
                                </View>
                            </ScrollView>
                        ) : (
                            <View style={{ flex: 1, gap: SPACING.sm }}>
                                <View style={styles.tabsContainer}>
                                    {hasRuns && (
                                        <TouchableOpacity
                                            style={[styles.tabButton, activeTab === 'runs' && styles.tabButtonActive]}
                                            onPress={() => setActiveTab('runs')}
                                        >
                                            <Text style={[styles.tabButtonText, activeTab === 'runs' && styles.tabButtonTextActive]}>{t('runs')}</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        style={[styles.tabButton, activeTab === 'elevation' && styles.tabButtonActive]}
                                        onPress={() => setActiveTab('elevation')}
                                    >
                                        <Text style={[styles.tabButtonText, activeTab === 'elevation' && styles.tabButtonTextActive]}>{t('elevation', 'Elevación')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.tabButton, activeTab === 'speed' && styles.tabButtonActive]}
                                        onPress={() => setActiveTab('speed')}
                                    >
                                        <Text style={[styles.tabButtonText, activeTab === 'speed' && styles.tabButtonTextActive]}>{t('speed', 'Velocidad')}</Text>
                                    </TouchableOpacity>
                                </View>

                                {hasRuns && activeTab === 'runs' && (
                                    <ScrollView
                                        style={styles.runsScroll}
                                        contentContainerStyle={styles.spaceY2}
                                        showsVerticalScrollIndicator={false}
                                        nestedScrollEnabled={true}
                                    >
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
                                    <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
                                        <AnalyserChart data={computeChartData(trackPoints)} yKey="elevation" height={100} />
                                    </ScrollView>
                                )}

                                {activeTab === 'speed' && (
                                    <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
                                        <AnalyserChart data={computeChartData(trackPoints)} yKey="speed" strokeColor={colors.danger} height={100} />
                                    </ScrollView>
                                )}
                            </View>
                        )}
                    </View>
                );
            })()}
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
    topStatusBannersContainer: {
        position: 'absolute',
        top: 60,
        left: 16,
        right: 16,
        zIndex: 55,
        gap: 6,
    },
    offlineBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#fef3c7',
        paddingVertical: 4,
        paddingHorizontal: 9,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: '#fde68a',
        ...SHADOWS.sm,
        alignSelf: 'flex-start',
    },
    offlineBannerText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#b45309',
    },
    liftClosureBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#fffbeb',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: '#f59e0b',
        ...SHADOWS.sm,
    },
    liftClosureBannerUrgent: {
        backgroundColor: '#fef2f2',
        borderColor: '#ef4444',
    },
    liftClosureText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#92400e',
        flex: 1,
    },
    liftClosureTextUrgent: {
        color: '#b91c1c',
    },
    originSelectingBanner: {
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        zIndex: 60,
        backgroundColor: colors.primary,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: BORDER_RADIUS.round,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...SHADOWS.lg,
    },
    originSelectingBannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    originSelectingBannerText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#FFFFFF',
        flex: 1,
    },
    originSelectingCancelBtn: {
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderRadius: 999,
        paddingVertical: 4,
        paddingHorizontal: 10,
    },
    originSelectingCancelBtnText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#FFFFFF',
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
    layersButton: {
        position: 'absolute',
        bottom: 16,
        left: 112,
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
    dim3dButton: {
        position: 'absolute',
        bottom: 16,
        left: 160,
        zIndex: 50,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderRadius: BORDER_RADIUS.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 42,
        ...SHADOWS.md,
    },
    dim3dButtonText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.primary,
    },
    indicatorDot: {
        width: 8,
        height: 8,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.success,
    },
    analyserPanel: {
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 40,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BORDER_RADIUS.xl,
        padding: SPACING.md,
        maxHeight: '65%',
        overflow: 'hidden',
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
