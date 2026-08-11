import { Lift, Piste } from 'models/ski-resort.model';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform, processColor } from 'react-native';
import { X } from 'lucide-react-native';

let LineChart: any = null;
if (Platform.OS !== 'web') {
    LineChart = require('react-native-charts-wrapper').LineChart;
}

interface MapDetailPanelProps {
    data: Piste | Lift;
    onClose: () => void;
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
            return { label: 'Novice', bg: 'bg-[#00a859]', hex: '#00a859' };
        case 'easy':
            return { label: 'Easy', bg: 'bg-[#0072bc]', hex: '#0072bc' };
        case 'intermediate':
            return { label: 'Advanced', bg: 'bg-[#f0141e]', hex: '#f0141e' };
        case 'advanced':
        case 'expert':
            return { label: 'Expert', bg: 'bg-black', hex: '#000000' };
        default:
            return { label: 'Easy', bg: 'bg-[#0072bc]', hex: '#0072bc' };
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
}> = ({ data, height, selectedIndex, onSelectIndex }) => {
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
            style={{ height }} 
            className="w-full"
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
                                <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke="#334155" strokeDasharray="3,3" strokeWidth="1" />
                                <text x={padding.left - 5} y={y + 3} fill="#94a3b8" fontSize="10" textAnchor="end">{val}m</text>
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
}> = ({ data, height, onSelectIndex }) => {
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
                style={{ flex: 1 }}
                data={{
                    dataSets: segmentDataSets,
                }}
                xAxis={{
                    position: 'BOTTOM',
                    textColor: processColor('#94a3b8'),
                    textSize: 9,
                    gridColor: processColor('#334155'),
                    gridDashedLine: { lineLength: 3, spaceLength: 3 },
                    valueFormatter: "###0.0'km'",
                    granularityEnabled: true,
                    granularity: 1,
                }}
                yAxis={{
                    left: {
                        textColor: processColor('#94a3b8'),
                        textSize: 9,
                        gridColor: processColor('#334155'),
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
                scaleEnabled={false}
                pinchZoom={false}
                onSelect={(event: any) => {
                    const entry = event.nativeEvent;
                    if (entry && typeof entry.x === 'number') {
                        const index = data.findIndex(d => Math.abs(d.distance - entry.x) < 0.05);
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
}> = ({ data, height = 160 }) => {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    useEffect(() => {
        if (!data || data.length === 0) {
            setSelectedIndex(null);
            return;
        }
        setSelectedIndex(prev => (prev === null || prev >= data.length ? Math.floor(data.length / 2) : prev));
    }, [data]);

    if (!data || data.length === 0) return null;

    const minElev = Math.min(...data.map(d => d.elevation));
    const maxElev = Math.max(...data.map(d => d.elevation));
    const selectedDatum = selectedIndex !== null ? data[selectedIndex] : null;

    return (
        <View className="bg-slate-800 p-2 rounded-md border border-slate-700">
            {selectedDatum && (
                <View className="flex-row justify-between items-center px-2 py-1.5 mb-2 rounded bg-slate-900/90 border border-slate-700">
                    <Text className="text-[10px] font-semibold text-slate-100">
                        Alt: <Text className="text-blue-400 font-bold">{selectedDatum.elevation}m</Text>
                    </Text>
                    <Text className="text-[10px] text-slate-300">
                        Dist: <Text className="text-slate-100 font-bold">{selectedDatum.distance.toFixed(1)}km</Text>
                    </Text>
                    <Text className="text-[10px] text-slate-400">
                        Slope: <Text className="text-amber-400 font-bold">{selectedDatum.slopeDeg}° ({selectedDatum.slopePct}%)</Text>
                    </Text>
                </View>
            )}

            {Platform.OS === 'web' ? (
                <WebChart
                    data={data}
                    height={height}
                    selectedIndex={selectedIndex}
                    onSelectIndex={setSelectedIndex}
                />
            ) : (
                <NativeChart
                    data={data}
                    height={height}
                    onSelectIndex={setSelectedIndex}
                />
            )}

            <View className="flex-row justify-between mt-2 px-1">
                <Text className="text-[10px] text-slate-400">Min: {minElev}m</Text>
                <Text className="text-[10px] text-slate-400">Max: {maxElev}m</Text>
            </View>

            <View className="flex-row justify-around items-center mt-3 pt-2 border-t border-slate-700/60 flex-wrap gap-1">
                <View className="flex-row items-center gap-1.5">
                    <View className="w-3 h-3 rounded bg-[#00a859]/40 border border-[#00a859]" />
                    <Text className="text-[9px] text-slate-300">&lt;15% (Novice)</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                    <View className="w-3 h-3 rounded bg-[#0072bc]/40 border border-[#0072bc]" />
                    <Text className="text-[9px] text-slate-300">15-25% (Easy)</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                    <View className="w-3 h-3 rounded bg-[#f0141e]/40 border border-[#f0141e]" />
                    <Text className="text-[9px] text-slate-300">25-40% (Intermediate)</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                    <View className="w-3 h-3 rounded bg-black border border-white" />
                    <Text className="text-[9px] text-slate-300">&gt;40% (Expert)</Text>
                </View>
            </View>
        </View>
    );
};

export const MapDetailPanel: React.FC<MapDetailPanelProps> = ({ data, onClose }) => {
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
    const skiArea = skiAreas[0]?.properties?.name || 'Ski Resort';

    const parseLiftType = (liftType: string) => {
        switch (liftType?.toLowerCase()) {
            case 'chair_lift': return 'Chair Lift';
            case 'drag_lift': return 'Drag Lift';
            case 'gondola': return 'Gondola';
            case 'cable_car': return 'Cable Car';
            case 'funicular': return 'Funicular';
            case 'magic_carpet': return 'Magic Carpet';
            default: return liftType || 'Lift';
        }
    };

    if (!data) return null;

    return (
        <View className="absolute inset-0 flex items-center justify-center bg-black/60 z-50 p-3">
            <View className="bg-slate-900 border border-slate-700 shadow-xl p-4 rounded-xl w-11/12 h-11/12 flex">
                <ScrollView className="space-y-4" showsVerticalScrollIndicator={false}>
                    <View className="flex-row justify-between items-start">
                        <Text className="text-xs text-slate-400 font-medium flex-1 pr-2">
                            {country} › {region} › {skiArea}
                        </Text>
                        <TouchableOpacity onPress={onClose} className="p-1.5 rounded-full bg-slate-800">
                            <X size={18} color="#94a3b8" />
                        </TouchableOpacity>
                    </View>

                    <View className="flex-row items-center gap-3">
                        {!(data as Lift).LiftType ? (
                            <View className={`w-9 h-9 rounded-full ${diffMeta.bg} items-center justify-center shadow-md`}>
                                <Text className="text-white font-bold text-sm">{ref}</Text>
                            </View>
                        ) : (
                            <View className="w-9 h-9 rounded-full bg-slate-700 items-center justify-center shadow-md">
                                <Text className="text-lg">🚠</Text>
                            </View>
                        )}
                        <Text className="text-xl font-bold text-white flex-1">{name}</Text>
                    </View>

                    {(!(data as Lift).LiftType && type === 'LineString') && (
                        <>
                            <Text className="text-xs text-slate-400 capitalize font-medium">
                                {diffMeta.label} downhill ski run
                            </Text>

                            <View className="flex-row justify-between border-t border-b border-slate-800 py-3 my-2">
                                <View className="items-center">
                                    <Text className="text-[10px] text-slate-400 uppercase font-semibold">Distance</Text>
                                    <Text className="text-sm font-bold text-white mt-0.5">{totalDistance}m</Text>
                                </View>
                                <View className="items-center">
                                    <Text className="text-[10px] text-slate-400 uppercase font-semibold">Ascent</Text>
                                    <Text className="text-sm font-bold text-white mt-0.5">{ascent}m</Text>
                                </View>
                                <View className="items-center">
                                    <Text className="text-[10px] text-slate-400 uppercase font-semibold">Descent</Text>
                                    <Text className="text-sm font-bold text-white mt-0.5">{descent}m</Text>
                                </View>
                                <View className="items-center">
                                    <Text className="text-xs text-slate-400">Average Slope</Text>
                                    <Text className="text-sm font-bold text-slate-200">{avgSlopeDeg}° ({avgSlopePct}%)</Text>
                                </View>
                                <View className="items-center">
                                    <Text className="text-xs text-slate-400">Max Slope</Text>
                                    <Text className="text-sm font-bold text-slate-200">{maxSlopeDeg}° ({maxSlopePct}%)</Text>
                                </View>
                            </View>

                            <View className="mt-2">
                                <Text className="text-xs font-bold text-slate-400 uppercase mb-2">Elevation Profile</Text>
                                {chartData.length > 0 ? (
                                    <ElevationChart data={chartData} />
                                ) : (
                                    <View className="p-4 border border-dashed border-slate-700 rounded-md items-center">
                                        <Text className="text-xs text-slate-500">No elevation data available</Text>
                                    </View>
                                )}
                            </View>
                        </>
                    )}

                    {((data as Lift).LiftType && type === 'LineString') && (
                        <View className="flex-row justify-between border-t border-b border-slate-800 py-3 my-2">
                            <View className="items-center">
                                <Text className="text-[10px] text-slate-400 uppercase font-semibold">Type</Text>
                                <Text className="text-sm font-bold text-white mt-0.5">{parseLiftType((data as Lift).LiftType)}</Text>
                            </View>
                            <View className="items-center">
                                <Text className="text-[10px] text-slate-400 uppercase font-semibold">Capacity</Text>
                                <Text className="text-sm font-bold text-white mt-0.5">{(data as Lift).Capacity || '-'} pers.</Text>
                            </View>
                            <View className="items-center">
                                <Text className="text-[10px] text-slate-400 uppercase font-semibold">Hourly</Text>
                                <Text className="text-sm font-bold text-white mt-0.5">{(data as Lift).CapacityHourly || '-'} pers.</Text>
                            </View>
                        </View>
                    )}
                </ScrollView>
            </View>
        </View>
    );
};