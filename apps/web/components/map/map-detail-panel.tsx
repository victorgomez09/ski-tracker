import { Lift, Piste } from 'models/ski-resort.model';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Circle, Text as SvgText } from 'react-native-svg';

interface MapDetailPanelProps {
    data: Piste | Lift;
    onClose: () => void;
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

const NativeChart: React.FC<{ data: { distance: number; elevation: number; slopePct: number; slopeDeg: number }[]; height?: number }> = ({ data, height = 150 }) => {
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
    const range = (maxElev - minElev) || 1;

    const width = 300;
    const marginLeft = 32;
    const marginRight = 12;
    const marginTop = 10;
    const marginBottom = 24;
    const chartWidth = width - marginLeft - marginRight;
    const chartHeight = height - marginTop - marginBottom;

    const points = data.map((d, i) => {
        const x = marginLeft + (i / (data.length - 1 || 1)) * chartWidth;
        const y = marginTop + chartHeight - ((d.elevation - minElev) / range) * chartHeight;
        return { x, y, ...d };
    });

    const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`, '');
    const fillD = `${pathD} L ${width - marginRight},${height - marginBottom} L ${marginLeft},${height - marginBottom} Z`;

    const selectedPoint = selectedIndex !== null ? points[selectedIndex] : points[points.length - 1];
    const selectedDatum = selectedIndex !== null ? data[selectedIndex] : data[data.length - 1];

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = marginTop + chartHeight - t * chartHeight;
        const value = Math.round(minElev + (range * t));
        return { y, value };
    });

    const xTicks = [0, 0.25, 0.5, 0.75, 1].map(t => {
        const x = marginLeft + t * chartWidth;
        const value = data[Math.round(t * (data.length - 1))]?.distance ?? 0;
        return { x, value };
    });

    const tooltipLeft = Math.max(8, Math.min(88, ((selectedPoint.x - marginLeft) / chartWidth) * 100));
    const tooltipTop = Math.max(8, Math.min(72, ((selectedPoint.y - marginTop) / chartHeight) * 100));

    return (
        <View className="bg-slate-800 p-2 rounded-xl border border-slate-700">
            <View className="relative">
                <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
                    <Defs>
                        <LinearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                            <Stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                        </LinearGradient>
                    </Defs>

                    <Line x1={marginLeft} y1={height - marginBottom} x2={width - marginRight} y2={height - marginBottom} stroke="#475569" strokeWidth={1} />
                    <Line x1={marginLeft} y1={marginTop} x2={marginLeft} y2={height - marginBottom} stroke="#475569" strokeWidth={1} />

                    {yTicks.map(tick => (
                        <React.Fragment key={`y-${tick.value}`}>
                            <Line x1={marginLeft} y1={tick.y} x2={width - marginRight} y2={tick.y} stroke="#334155" strokeWidth={0.7} strokeDasharray="3 3" />
                            <SvgText x={4} y={tick.y + 3} fontSize="9" fill="#94a3b8">{tick.value}m</SvgText>
                        </React.Fragment>
                    ))}

                    {xTicks.map(tick => (
                        <React.Fragment key={`x-${tick.value}`}>
                            <Line x1={tick.x} y1={marginTop} x2={tick.x} y2={height - marginBottom} stroke="#334155" strokeWidth={0.5} strokeDasharray="2 2" />
                            <SvgText x={tick.x - 10} y={height - 6} fontSize="9" fill="#94a3b8">{tick.value.toFixed(1)}km</SvgText>
                        </React.Fragment>
                    ))}

                    <Path d={fillD} fill="url(#elevGrad)" />
                    <Path d={pathD} stroke="#3b82f6" strokeWidth={2.5} fill="none" />

                    {points.map((point, index) => (
                        <Circle
                            key={`${point.distance}-${index}`}
                            cx={point.x}
                            cy={point.y}
                            r={selectedIndex === index ? 4.5 : 3}
                            fill={selectedIndex === index ? '#f8fafc' : '#3b82f6'}
                            stroke={selectedIndex === index ? '#3b82f6' : '#0f172a'}
                            strokeWidth={selectedIndex === index ? 2.2 : 1.2}
                            onPress={() => setSelectedIndex(index)}
                        />
                    ))}

                    {selectedPoint && (
                        <Line x1={selectedPoint.x} y1={selectedPoint.y} x2={selectedPoint.x} y2={height - marginBottom} stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="4 3" />
                    )}
                </Svg>

                <View className="absolute rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2" style={{ left: `${tooltipLeft}%`, top: `${tooltipTop}%`, transform: [{ translateX: -50 }, { translateY: -10 }] }}>
                    <Text className="text-[10px] font-semibold text-slate-100">Alt: {selectedDatum.elevation}m</Text>
                    <Text className="text-[10px] text-slate-400">Slope: {selectedDatum.slopeDeg}° ({selectedDatum.slopePct}%)</Text>
                </View>
            </View>

            <View className="flex-row justify-between mt-1 px-1">
                <Text className="text-[10px] text-slate-400">Min: {minElev}m</Text>
                <Text className="text-[10px] text-slate-400">Max: {maxElev}m</Text>
            </View>
        </View>
    );
};

export const MapDetailPanel: React.FC<MapDetailPanelProps> = ({ data, onClose }) => {
    const tags = data?.Tags || {};
    const elevationProfile = tags.elevationProfile || {};
    const heights = elevationProfile.heights || [];
    const resolution = elevationProfile.resolution || 25;
    const type = data.GeometryGeoJSON?.type || "LineString";

    const ref = tags.ref || "•";
    const difficulty: string = (data as Piste).Difficulty || tags.difficulty || "easy";
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
    const region = places[0]?.localized?.en?.region || "Madrid";
    const country = places[0]?.localized?.en?.country || "Spain";
    const skiAreas = tags.skiAreas || [];
    const skiArea = skiAreas[0]?.properties?.name || "Ski Resort";

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
        <View className="absolute top-12 left-4 right-4 z-50 bg-slate-900/95 border border-slate-700 shadow-2xl p-4 rounded-3xl max-h-[75vh]">
            <ScrollView className="space-y-4">
                <View className="flex-row justify-between items-start">
                    <Text className="text-xs text-slate-400 font-medium">
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

                {(!(data as Lift).LiftType && type === "LineString") && (
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
                        </View>

                        <View className="flex-row justify-around my-2">
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
                                <NativeChart data={chartData} />
                            ) : (
                                <View className="p-4 border border-dashed border-slate-700 rounded-xl items-center">
                                    <Text className="text-xs text-slate-500">No elevation data available</Text>
                                </View>
                            )}
                        </View>
                    </>
                )}

                {((data as Lift).LiftType && type === "LineString") && (
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
    );
};