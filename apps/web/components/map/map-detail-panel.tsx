import { Lift, Piste } from 'models/ski-resort.model';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform, processColor, StyleSheet, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Maximize2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from '../../constants/theme';

let LineChart: any = null;
if (Platform.OS !== 'web') {
    LineChart = require('react-native-charts-wrapper').LineChart;
}

interface MapDetailPanelProps {
    data: Piste | Lift;
    onClose: () => void;
    onChartPointSelected?: (coord: [number, number] | null) => void;
}

interface ChartDatum {
    distance: number;
    elevation: number;
    slopePct: number;
    slopeDeg: number;
}

const pctToDegrees = (pct: number) => {
    return Math.round(Math.atan(pct / 100) * (180 / Math.PI));
};

const getDifficultyMeta = (difficulty: string) => {
    const diff = difficulty?.toLowerCase() || '';
    switch (diff) {
        case 'novice':
            return { labelKey: 'novice', hex: '#00a859' };
        case 'easy':
            return { labelKey: 'easy', hex: '#0072bc' };
        case 'intermediate':
            return { labelKey: 'intermediate', hex: '#f0141e' };
        case 'advanced':
            return { labelKey: 'expert', hex: '#000000' };
        case 'expert':
            return { labelKey: 'expert', hex: '#000000' };
        default:
            return { labelKey: 'easy', hex: '#0072bc' };
    }
};

const getSlopeColor = (slopePct: number) => {
    const absSlope = Math.abs(slopePct);
    if (absSlope < 15) return '#00a859';
    if (absSlope < 25) return '#0072bc';
    if (absSlope < 40) return '#f0141e';
    return '#000000';
};

// --- WEB CHART ---
const WebChart: React.FC<{
    data: ChartDatum[];
    height: number;
    selectedIndex: number | null;
    onSelectIndex: (index: number) => void;
    colors: typeof LIGHT_COLORS;
    styles: any;
}> = ({ data, height, selectedIndex, onSelectIndex, colors, styles }) => {
    const [containerWidth, setContainerWidth] = useState<number>(0);

    if (!data || data.length === 0) return null;

    const minElev = Math.min(...data.map(d => d.elevation));
    const maxElev = Math.max(...data.map(d => d.elevation));
    const maxDist = Math.max(...data.map(d => d.distance)) || 1;
    const elevRange = maxElev - minElev || 1;

    const padding = { top: 10, bottom: 25, left: 40, right: 15 };
    const svgWidth = containerWidth > 0 ? containerWidth : 500;
    const svgHeight = height;

    const chartW = svgWidth - padding.left - padding.right;
    const chartH = svgHeight - padding.top - padding.bottom;
    const bottomY = padding.top + chartH;

    const points = data.map((d) => {
        const x = padding.left + (d.distance / maxDist) * chartW;
        const y = padding.top + chartH - ((d.elevation - minElev) / elevRange) * chartH;
        return { x, y, ...d };
    });

    return (
        <View
            style={[{ height }, styles.wFull]}
            onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w > 0 && Math.abs(w - containerWidth) > 1) {
                    setContainerWidth(w);
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
                        const val = Math.round(maxElev - ratio * elevRange);
                        return (
                            <g key={i}>
                                <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke={colors.border} strokeDasharray="3,3" strokeWidth="1" />
                                <text x={padding.left - 5} y={y + 3} fill={colors.textSecondary} fontSize="10" textAnchor="end">{val}m</text>
                            </g>
                        );
                    })}

                    {points.map((p, idx) => {
                        if (idx === points.length - 1) return null;
                        const nextP = points[idx + 1];
                        const color = getSlopeColor(nextP.slopePct);
                        const segmentD = `M ${p.x} ${p.y} L ${nextP.x} ${nextP.y} L ${nextP.x} ${bottomY} L ${p.x} ${bottomY} Z`;

                        return (
                            <g key={`segment-${idx}`}>
                                <path
                                    d={segmentD}
                                    fill={color}
                                    fillOpacity="0.25"
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
                            fill="#ffffff"
                            stroke={getSlopeColor(p.slopePct)}
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
        </View>
    );
};

// --- NATIVE CHART ---
const NativeChart: React.FC<{
    data: ChartDatum[];
    height: number;
    onSelectIndex: (index: number) => void;
    colors: typeof LIGHT_COLORS;
    styles: any;
}> = ({ data, height, onSelectIndex, colors, styles }) => {
    if (!LineChart || !data || data.length === 0) return null;

    const chartValues = data.map(d => ({ x: d.distance, y: d.elevation }));
    const circleColors = data.map(d => processColor(getSlopeColor(d.slopePct)));

    const segmentDataSets = [];

    for (let i = 0; i < data.length - 1; i++) {
        const p1 = data[i];
        const p2 = data[i + 1];
        const segmentColor = processColor(getSlopeColor(p2.slopePct));

        segmentDataSets.push({
            values: [
                { x: p1.distance, y: p1.elevation },
                { x: p2.distance, y: p2.elevation },
            ],
            label: `segment_${i}`,
            config: {
                color: segmentColor,
                lineWidth: 2.5,
                drawCircles: false,
                drawValues: false,
                drawFilled: true,
                fillColor: segmentColor,
                fillAlpha: 60,
            },
        });
    }

    segmentDataSets.push({
        values: chartValues,
        label: 'points_overlay',
        config: {
            color: processColor('transparent'),
            lineWidth: 0,
            drawCircles: true,
            circleRadius: 4,
            circleColors: circleColors,
            circleHoleColor: processColor('#ffffff'),
            drawCircleHole: true,
            drawValues: false,
            drawFilled: false,
        },
    });

    return (
        <View style={{ height }}>
            <LineChart
                style={styles.flex1}
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
                    granularity: 1,
                }}
                yAxis={{
                    left: {
                        textColor: processColor(colors.textSecondary),
                        textSize: 9,
                        gridColor: processColor(colors.border),
                        gridDashedLine: { lineLength: 3, spaceLength: 3 },
                        valueFormatter: "###0'm'",
                        spaceBottom: 15,
                        spaceTop: 15,
                    },
                    right: { enabled: false },
                }}
                legend={{ enabled: false }}
                chartDescription={{ text: '' }}
                touchEnabled={true}
                dragEnabled={true}
                highlightPerDragEnabled={true}
                highlightPerTapEnabled={true}
                scaleEnabled={false}
                scaleXEnabled={false}
                scaleYEnabled={false}
                pinchZoom={false}
                doubleTapToZoomEnabled={false}
                onSelect={(event: any) => {
                    const entry = event.nativeEvent;
                    if (entry && typeof entry.x === 'number') {
                        const index = data.findIndex(d => Math.abs(d.distance - entry.x) < 0.001);
                        if (index !== -1) onSelectIndex(index);
                    }
                }}
            />
        </View>
    );
};

// --- ELEVATION CHART WRAPPER ---
export const ElevationChart: React.FC<{
    data: ChartDatum[];
    height?: number;
    isFullscreen?: boolean;
    exitFullscreen?: () => void;
    onSelectedIndexChange?: (index: number | null) => void;
}> = ({ data, height = 160, isFullscreen, exitFullscreen, onSelectedIndexChange }) => {
    const { t } = useTranslation();
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

    useEffect(() => {
        if (onSelectedIndexChange) {
            onSelectedIndexChange(selectedIndex);
        }
    }, [selectedIndex, onSelectedIndexChange]);

    useEffect(() => {
        if (!data || data.length === 0) {
            setSelectedIndex(null);
            return;
        }
        setSelectedIndex(prev => (prev === null || prev >= data.length ? Math.floor(data.length / 2) : prev));
    }, [data]);


    // Detect screen rotation to portrait to exit fullscreen automatically
    useEffect(() => {
        if (!isFullscreen || Platform.OS === 'web') return;

        const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
            const orientation = event.orientationInfo.orientation;
            if (
                orientation === ScreenOrientation.Orientation.PORTRAIT_UP ||
                orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN
            ) {
                exitFullscreen?.();
            }
        });

        return () => {
            subscription.remove();
        };
    }, [isFullscreen]);

    if (!data || data.length === 0) return null;

    const minElev = Math.min(...data.map(d => d.elevation));
    const maxElev = Math.max(...data.map(d => d.elevation));
    const selectedDatum = selectedIndex !== null ? data[selectedIndex] : null;

    const renderChartContent = (chartHeight: number) => {
        return Platform.OS === 'web' ? (
            <WebChart
                data={data}
                height={chartHeight}
                selectedIndex={selectedIndex}
                onSelectIndex={setSelectedIndex}
                colors={colors}
                styles={styles}
            />
        ) : (
            <NativeChart
                data={data}
                height={chartHeight}
                onSelectIndex={setSelectedIndex}
                colors={colors}
                styles={styles}
            />
        );
    };

    const renderLegend = () => {
        return (
            <View style={styles.legendContainer}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendBox, styles.legendNovice]} />
                    <Text style={styles.legendLabel}>{t('novice_slope_desc')}</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendBox, styles.legendEasy]} />
                    <Text style={styles.legendLabel}>{t('easy_slope_desc')}</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendBox, styles.legendIntermediate]} />
                    <Text style={styles.legendLabel}>{t('intermediate_slope_desc')}</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendBox, styles.legendExpert]} />
                    <Text style={styles.legendLabel}>{t('expert_slope_desc')}</Text>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.chartWrapper}>
            {selectedDatum && (
                <View style={styles.tooltipContainer}>
                    <Text style={styles.tooltipTextPrimary}>
                        {t('alt', { elevation: selectedDatum.elevation })}
                    </Text>
                    <Text style={styles.tooltipTextSecondary}>
                        {t('dist', { distance: selectedDatum.distance.toFixed(1) })}
                    </Text>
                    <Text style={styles.tooltipTextTertiary}>
                        {t('slope', { slopeDeg: selectedDatum.slopeDeg, slopePct: selectedDatum.slopePct })}
                    </Text>
                </View>
            )}

            {renderChartContent(height)}

            <View style={styles.minMaxContainer}>
                <Text style={styles.minMaxText}>{t('min_label', { minElev })}</Text>
                <Text style={styles.minMaxText}>{t('max_label', { maxElev })}</Text>
            </View>

            {renderLegend()}

            <Modal
                visible={isFullscreen}
                transparent={false}
                animationType="fade"
                onRequestClose={exitFullscreen}
                statusBarTranslucent={true}
            >
                <SafeAreaView style={[styles.fullscreenContainer, { backgroundColor: colors.background }]}>
                    <View style={styles.fullscreenHeader}>
                        {selectedDatum && (
                            <View style={styles.tooltipContainerFullscreen}>
                                <Text style={styles.tooltipTextPrimary}>
                                    {t('alt', { elevation: selectedDatum.elevation })}
                                </Text>
                                <Text style={styles.tooltipTextSecondary}>
                                    {t('dist', { distance: selectedDatum.distance.toFixed(1) })}
                                </Text>
                                <Text style={styles.tooltipTextTertiary}>
                                    {t('slope', { slopeDeg: selectedDatum.slopeDeg, slopePct: selectedDatum.slopePct })}
                                </Text>
                            </View>
                        )}
                        <TouchableOpacity style={styles.closeButtonFullscreen} onPress={exitFullscreen}>
                            <X size={18} color={colors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.fullscreenChartBody}>
                        {renderChartContent(220)}
                    </View>

                    <View style={styles.fullscreenFooter}>
                        <View style={styles.minMaxContainer}>
                            <Text style={styles.minMaxText}>{t('min_label', { minElev })}</Text>
                            <Text style={styles.minMaxText}>{t('max_label', { maxElev })}</Text>
                        </View>
                        {renderLegend()}
                    </View>
                </SafeAreaView>
            </Modal>
        </View>
    );
};

const getDistanceFromLatLonInM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const getCoordinateAtDistance = (coords: number[][], targetDistM: number): [number, number] | null => {
    if (!coords || coords.length === 0) return null;
    if (coords.length === 1) return [coords[0][0], coords[0][1]];
    if (targetDistM <= 0) return [coords[0][0], coords[0][1]];

    let currentDist = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const [lon1, lat1] = coords[i];
        const [lon2, lat2] = coords[i+1];
        const segDist = getDistanceFromLatLonInM(lat1, lon1, lat2, lon2);
        
        if (currentDist + segDist >= targetDistM) {
            const ratio = segDist > 0 ? (targetDistM - currentDist) / segDist : 0;
            const interpLon = lon1 + (lon2 - lon1) * ratio;
            const interpLat = lat1 + (lat2 - lat1) * ratio;
            return [interpLon, interpLat];
        }
        currentDist += segDist;
    }
    const last = coords[coords.length - 1];
    return [last[0], last[1]];
};

export const MapDetailPanel: React.FC<MapDetailPanelProps> = ({ data, onClose, onChartPointSelected }) => {
    const isWeb = Platform.OS === 'web';
    const { t } = useTranslation();
    const colors = useThemeColors();
    const [isFullscreen, setIsFullscreen] = useState(false);
    const styles = useMemo(() => getStyles(colors), [colors]);

    useEffect(() => {
        return () => {
            if (onChartPointSelected) {
                onChartPointSelected(null);
            }
        };
    }, [onChartPointSelected]);

    const tags = data?.Tags || {};
    const elevationProfile = tags.elevationProfile || {};
    const heights = elevationProfile.heights || [];
    const resolution = elevationProfile.resolution || 25;
    const type = data.GeometryGeoJSON?.type || 'LineString';

    const ref = tags.ref || '•';
    const difficulty: string = (data as Piste).Difficulty || tags.difficulty || 'easy';
    const name: string = data.Name || tags.name || `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} ${(data as Piste).PisteType} area`;

    const diffMeta = getDifficultyMeta(difficulty);

    const chartData = useMemo(() => {
        if (heights.length === 0) return [];
        return heights.map((height: number, index: number) => {
            const distanceMeters = index * resolution;
            const distanceKm = (distanceMeters / 1000).toFixed(2);
            const prevHeight = index > 0 ? heights[index - 1] : height;
            const slopePct = index > 0 ? Math.round((((height - prevHeight) / resolution) * 100) * 10) / 10 : 0;
            const slopeDeg = pctToDegrees(Math.abs(slopePct));
            return {
                distance: parseFloat(distanceKm),
                elevation: Math.round(height),
                slopePct,
                slopeDeg,
            };
        });
    }, [heights, resolution]);

    const totalDistance = heights.length > 1 ? Math.round((heights.length - 1) * resolution) : 0;

    const { ascent, descent } = useMemo(() => {
        let asc = 0;
        let desc = 0;
        for (let i = 0; i < heights.length - 1; i++) {
            const diff = heights[i + 1] - heights[i];
            if (diff > 0) asc += diff;
            else desc += Math.abs(diff);
        }
        return { ascent: Math.round(asc), descent: Math.round(desc) };
    }, [heights]);

    const avgSlopePct = totalDistance > 0 ? Math.round((descent / totalDistance) * 100) : 0;
    const avgSlopeDeg = pctToDegrees(avgSlopePct);

    const maxSlopePct = useMemo(() => {
        if (heights.length < 2) return 0;
        let maxPct = 0;
        for (let i = 0; i < heights.length - 1; i++) {
            const diff = Math.abs(heights[i + 1] - heights[i]);
            const pct = (diff / resolution) * 100;
            if (pct > maxPct) maxPct = pct;
        }
        return Math.round(maxPct);
    }, [heights, resolution]);

    const maxSlopeDeg = pctToDegrees(maxSlopePct);

    const places = tags.places || [];
    const region = places[0]?.localized?.en?.region || 'Madrid';
    const country = places[0]?.localized?.en?.country || 'Spain';
    const skiAreas = tags.skiAreas || [];
    const skiArea = skiAreas[0]?.properties?.name || t('ski_resort');

    const parseLiftType = (liftType: string) => {
        switch (liftType?.toLowerCase()) {
            case 'chair_lift': return t('chair_lift');
            case 'drag_lift': return t('drag_lift');
            case 'gondola': return t('gondola');
            case 'cable_car': return t('cable_car');
            case 'funicular': return t('funicular');
            case 'magic_carpet': return t('magic_carpet');
            default: return liftType || t('lift');
        }
    };

    const enterFullscreen = async () => {
        setIsFullscreen(true);
        if (Platform.OS !== 'web') {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        }
    };

    const exitFullscreen = async () => {
        setIsFullscreen(false);
        if (Platform.OS !== 'web') {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
    };

    const handleIndexChange = (index: number | null) => {
        if (!onChartPointSelected) return;
        const coords = data.GeometryGeoJSON?.coordinates as number[][];
        if (index === null || !coords || coords.length === 0) {
            onChartPointSelected(null);
            return;
        }
        const targetDist = index * resolution;
        const point = getCoordinateAtDistance(coords, targetDist);
        onChartPointSelected(point);
    };

    if (!data) return null;

    return (
        <View style={styles.overlay} pointerEvents="box-none">
            <View style={[styles.panel, isWeb ? styles.panelWeb : styles.panelMobile]}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.breadcrumbHeader}>
                        <Text style={styles.breadcrumbText}>
                            {country} › {region} › {skiArea}
                        </Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <X size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.titleContainer}>
                        {!(data as Lift).LiftType ? (
                            <View style={[styles.badgeCircle, { backgroundColor: diffMeta.hex }]}>
                                <Text style={styles.badgeText}>{ref}</Text>
                            </View>
                        ) : (
                            <View style={styles.badgeIconCircle}>
                                <Text style={styles.emojiText}>🚠</Text>
                            </View>
                        )}
                        <Text style={styles.titleText}>{name}</Text>
                    </View>

                    {(!(data as Lift).LiftType && type === 'LineString') && (
                        <>
                            <Text style={styles.subtitleText}>
                                {t('downhill_ski_run', { difficulty: t(diffMeta.labelKey) })}
                            </Text>

                            <View style={styles.statsContainer}>
                                <View style={styles.statBox}>
                                    <Text style={styles.statLabel}>{t('distance')}</Text>
                                    <Text style={styles.statValue}>{totalDistance}m</Text>
                                </View>
                                <View style={styles.statBox}>
                                    <Text style={styles.statLabel}>{t('ascent')}</Text>
                                    <Text style={styles.statValue}>{ascent}m</Text>
                                </View>
                                <View style={styles.statBox}>
                                    <Text style={styles.statLabel}>{t('descent')}</Text>
                                    <Text style={styles.statValue}>{descent}m</Text>
                                </View>
                                <View style={styles.statBox}>
                                    <Text style={styles.statLabel}>{t('average_slope')}</Text>
                                    <Text style={styles.statValue}>{avgSlopeDeg}° ({avgSlopePct}%)</Text>
                                </View>
                                <View style={styles.statBox}>
                                    <Text style={styles.statLabel}>{t('max_slope')}</Text>
                                    <Text style={styles.statValue}>{maxSlopeDeg}° ({maxSlopePct}%)</Text>
                                </View>
                            </View>

                            <View style={styles.elevationSection}>
                                <View style={styles.sectionHeaderContainer}>
                                    <Text style={styles.sectionHeader}>{t('elevation_profile_title')}</Text>
                                    <TouchableOpacity style={styles.fullscreenButton} onPress={enterFullscreen}>
                                        <Maximize2 size={14} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                </View>
                                {chartData.length > 0 ? (
                                    <ElevationChart 
                                        data={chartData} 
                                        isFullscreen={isFullscreen} 
                                        exitFullscreen={exitFullscreen} 
                                        onSelectedIndexChange={handleIndexChange}
                                    />
                                ) : (
                                    <View style={styles.noDataContainer}>
                                        <Text style={styles.noDataText}>{t('no_elevation_data')}</Text>
                                    </View>
                                )}
                            </View>
                        </>
                    )}

                    {((data as Lift).LiftType && type === 'LineString') && (
                        <View style={styles.statsContainer}>
                            <View style={styles.statBox}>
                                <Text style={styles.statLabel}>{t('type')}</Text>
                                <Text style={styles.statValue}>{parseLiftType((data as Lift).LiftType)}</Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text style={styles.statLabel}>{t('capacity')}</Text>
                                <Text style={styles.statValue}>{(data as Lift).Capacity ? t('persons_count', { count: (data as Lift).Capacity }) : '-'}</Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text style={styles.statLabel}>{t('hourly_label')}</Text>
                                <Text style={styles.statValue}>{(data as Lift).CapacityHourly ? t('persons_count', { count: (data as Lift).CapacityHourly }) : '-'}</Text>
                            </View>
                        </View>
                    )}
                </ScrollView>
            </View>
        </View>
    );
};

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
    wFull: {
        width: '100%',
    },
    flex1: {
        flex: 1,
    },
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        zIndex: 50,
    },
    panel: {
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.xl,
        ...SHADOWS.lg,
        display: 'flex',
        position: 'absolute',
    },
    panelWeb: {
        left: 20,
        top: 16,
        bottom: 16,
        width: 380,
        height: 'auto',
    },
    panelMobile: {
        bottom: 16,
        left: 16,
        right: 16,
        maxHeight: '45%',
    },
    scrollContent: {
        flexDirection: 'column',
        gap: SPACING.md,
    },
    breadcrumbHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    breadcrumbText: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500',
        flex: 1,
        paddingRight: SPACING.sm,
    },
    closeButton: {
        padding: SPACING.xs + 2,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.surface,
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    badgeCircle: {
        width: 36,
        height: 36,
        borderRadius: BORDER_RADIUS.round,
        alignItems: 'center',
        justifyContent: 'center',
        ...SHADOWS.sm,
    },
    badgeText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
    badgeIconCircle: {
        width: 36,
        height: 36,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        ...SHADOWS.sm,
    },
    emojiText: {
        fontSize: 18,
    },
    titleText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.textPrimary,
        flex: 1,
    },
    subtitleText: {
        fontSize: 12,
        color: colors.textSecondary,
        textTransform: 'capitalize',
        fontWeight: '500',
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.border,
        paddingVertical: SPACING.md,
        marginVertical: SPACING.xs,
        flexWrap: 'wrap',
        gap: SPACING.sm,
    },
    statBox: {
        alignItems: 'center',
        minWidth: '18%',
    },
    statLabel: {
        fontSize: 10,
        color: colors.textSecondary,
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    statValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginTop: 2,
    },
    elevationSection: {
        marginTop: SPACING.xs,
    },
    sectionHeaderContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.sm,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.textSecondary,
        textTransform: 'uppercase',
    },
    chartWrapper: {
        backgroundColor: colors.surface,
        padding: SPACING.sm,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.border,
        position: 'relative',
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
    fullscreenContainer: {
        flex: 1,
        padding: SPACING.md,
        flexDirection: 'column',
    },
    fullscreenHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    tooltipContainerFullscreen: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingHorizontal: SPACING.sm,
        paddingVertical: 8,
        marginRight: SPACING.md,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        ...SHADOWS.sm,
    },
    closeButtonFullscreen: {
        padding: 8,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    fullscreenChartBody: {
        flex: 1,
        marginVertical: SPACING.sm,
    },
    fullscreenFooter: {
        flexDirection: 'column',
        gap: SPACING.sm,
    },
    fullscreenButton: {
        padding: 6,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: colors.surface + 'D9',
        borderWidth: 1,
        borderColor: colors.border,
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
    minMaxContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: SPACING.sm,
        paddingHorizontal: 4,
    },
    minMaxText: {
        fontSize: 10,
        color: colors.textLight,
    },
    legendContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        marginTop: SPACING.md,
        paddingTop: SPACING.sm,
        borderTopWidth: 1,
        borderColor: colors.border,
        flexWrap: 'wrap',
        gap: 4,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendBox: {
        width: 12,
        height: 12,
        borderRadius: BORDER_RADIUS.sm - 2,
    },
    legendNovice: {
        backgroundColor: 'rgba(0, 168, 89, 0.4)',
        borderWidth: 1,
        borderColor: '#00a859',
    },
    legendEasy: {
        backgroundColor: 'rgba(0, 114, 188, 0.4)',
        borderWidth: 1,
        borderColor: '#0072bc',
    },
    legendIntermediate: {
        backgroundColor: 'rgba(240, 20, 30, 0.4)',
        borderWidth: 1,
        borderColor: '#f0141e',
    },
    legendExpert: {
        backgroundColor: '#000000',
        borderWidth: 1,
        borderColor: '#FFFFFF',
    },
    legendLabel: {
        fontSize: 9,
        color: colors.textSecondary,
    },
    noDataContainer: {
        padding: SPACING.lg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.border,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
    },
    noDataText: {
        fontSize: 12,
        color: colors.textLight,
    },
});