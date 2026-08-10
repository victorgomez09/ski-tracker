import { Lift, Piste } from 'models/ski-resort.model';
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

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

const NativeChart: React.FC<{ data: { distance: number; elevation: number }[]; height?: number }> = ({ data, height = 140 }) => {
    if (!data || data.length === 0) return null;
    const minElev = Math.min(...data.map(d => d.elevation));
    const maxElev = Math.max(...data.map(d => d.elevation));
    const range = (maxElev - minElev) || 1;

    const width = 300;
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1 || 1)) * width;
        const y = height - 15 - ((d.elevation - minElev) / range) * (height - 30);
        return { x, y };
    });

    const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`, '');
    const fillD = `${pathD} L ${width},${height} L 0,${height} Z`;

    return (
        <View className="bg-slate-800 p-2 rounded-xl border border-slate-700">
            <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
                <Defs>
                    <LinearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                        <Stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                    </LinearGradient>
                </Defs>
                <Path d={fillD} fill="url(#elevGrad)" />
                <Path d={pathD} stroke="#3b82f6" strokeWidth={2.5} fill="none" />
            </Svg>
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
            return {
                distance: parseFloat(distanceKm),
                elevation: Math.round(height),
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