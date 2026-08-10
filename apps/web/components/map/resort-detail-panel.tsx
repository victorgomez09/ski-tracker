import { Resort, ResortDetail, Piste, Lift } from 'models/ski-resort.model';
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { X } from 'lucide-react-native';

interface ResortDetailPanelProps {
    resort: Resort | ResortDetail;
    onClose: () => void;
}

const getDifficultyMeta = (difficulty: string) => {
    switch (difficulty) {
        case 'novice':
            return { label: 'Novice', bg: 'bg-[#00a859]', hex: '#00a859' };
        case 'easy':
            return { label: 'Easy', bg: 'bg-[#0072bc]', hex: '#0072bc' };
        case 'intermediate':
            return { label: 'Intermediate', bg: 'bg-[#f0141e]', hex: '#f0141e' };
        case 'advanced':
            return { label: 'Expert', bg: 'bg-black', hex: '#000000' };
        default:
            return { label: 'Other', bg: 'bg-gray-400', hex: '#9ca3af' };
    }
};

const getPisteDistance = (piste: Piste) => {
    const heights = piste.Tags?.elevationProfile?.heights || [];
    const resolution = piste.Tags?.elevationProfile?.resolution || 25;
    if (heights.length > 1) {
        return Math.round((heights.length - 1) * resolution);
    }
    const coords = piste.GeometryGeoJSON?.coordinates || [];
    let dist = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i+1];
        const R = 6371e3;
        const phi1 = p1[1] * Math.PI/180;
        const phi2 = p2[1] * Math.PI/180;
        const deltaPhi = (p2[1]-p1[1]) * Math.PI/180;
        const deltaLambda = (p2[0]-p1[0]) * Math.PI/180;

        const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        dist += R * c;
    }
    return Math.round(dist);
};

const parseLiftType = (liftType: string) => {
    switch (liftType?.toLowerCase()) {
        case 'chair_lift': return 'Chair Lift';
        case 'drag_lift': return 'Drag Lift';
        case 'gondola': return 'Gondola';
        case 'cable_car': return 'Cable Car';
        case 'funicular': return 'Funicular';
        case 'magic_carpet': return 'Magic Carpet';
        default: return liftType ? liftType.replace(/_/g, ' ') : 'Lift';
    }
};

export const ResortDetailPanel: React.FC<ResortDetailPanelProps> = ({ resort, onClose }) => {
    const stats = useMemo(() => {
        const pistes = resort?.pistes || [];
        const lifts = resort?.lifts || [];

        const tagsStats = resort?.Tags?.statistics;
        if (tagsStats) {
            const liftsType = tagsStats.lifts?.byType;

            const difficultyCounts = {
                novice: pistes.filter(p => p.Difficulty?.toLowerCase() === 'novice').length ?? 0,
                easy: pistes.filter(p => p.Difficulty?.toLowerCase() === 'easy').length ?? 0,
                intermediate: pistes.filter(p => p.Difficulty?.toLowerCase() === 'intermediate').length ?? 0,
                advanced: pistes.filter(p => p.Difficulty?.toLowerCase() === 'advanced' || p.Difficulty?.toLowerCase() === 'expert').length ?? 0,
                other: 0
            };

            const difficultyLengths = {
                novice: pistes.filter(p => p.Difficulty?.toLowerCase() === 'novice').reduce((sum, p) => sum + getPisteDistance(p), 0),
                easy: pistes.filter(p => p.Difficulty?.toLowerCase() === 'easy').reduce((sum, p) => sum + getPisteDistance(p), 0),
                intermediate: pistes.filter(p => p.Difficulty?.toLowerCase() === 'intermediate').reduce((sum, p) => sum + getPisteDistance(p), 0),
                advanced: pistes.filter(p => p.Difficulty?.toLowerCase() === 'advanced' || p.Difficulty?.toLowerCase() === 'expert').reduce((sum, p) => sum + getPisteDistance(p), 0),
                other: 0
            };

            const totalPisteLength = difficultyLengths.novice + difficultyLengths.easy + difficultyLengths.intermediate + difficultyLengths.advanced;
            const totalPistes = difficultyCounts.novice + difficultyCounts.easy + difficultyCounts.intermediate + difficultyCounts.advanced;

            const minElev = tagsStats.minElevation ?? tagsStats.runs?.minElevation ?? tagsStats.lifts?.minElevation ?? null;
            const maxElev = tagsStats.maxElevation ?? tagsStats.runs?.maxElevation ?? tagsStats.lifts?.maxElevation ?? null;

            const liftTypeCounts: Record<string, number> = {};
            let totalLifts = 0;
            if (liftsType) {
                Object.entries(liftsType).forEach(([type, data]: [string, any]) => {
                    if (data && typeof data.count === 'number') {
                        liftTypeCounts[type] = data.count;
                        totalLifts += data.count;
                    }
                });
            }

            return {
                totalPistes,
                totalPisteLength: Math.round(totalPisteLength),
                difficultyCounts,
                difficultyLengths,
                minElev: minElev ? Math.round(minElev) : null,
                maxElev: maxElev ? Math.round(maxElev) : null,
                totalLifts,
                totalCapacity: 0,
                totalHourlyCapacity: 0,
                liftTypeCounts
            };
        }

        let totalPisteLength = 0;
        const difficultyCounts = { novice: 0, easy: 0, intermediate: 0, advanced: 0, other: 0 };
        const difficultyLengths = { novice: 0, easy: 0, intermediate: 0, advanced: 0, other: 0 };

        pistes.forEach(p => {
            const len = getPisteDistance(p);
            totalPisteLength += len;
            const diff = p.Difficulty?.toLowerCase() || '';
            if (diff === 'novice') {
                difficultyCounts.novice++;
                difficultyLengths.novice += len;
            } else if (diff === 'easy') {
                difficultyCounts.easy++;
                difficultyLengths.easy += len;
            } else if (diff === 'intermediate') {
                difficultyCounts.intermediate++;
                difficultyLengths.intermediate += len;
            } else if (diff === 'advanced' || diff === 'expert') {
                difficultyCounts.advanced++;
                difficultyLengths.advanced += len;
            } else {
                difficultyCounts.other++;
                difficultyLengths.other += len;
            }
        });

        let minElev = Infinity;
        let maxElev = -Infinity;
        pistes.forEach(p => {
            const coords = p.GeometryGeoJSON?.coordinates || [];
            coords.forEach(coord => {
                if (coord[2] !== undefined && coord[2] > 0) {
                    if (coord[2] < minElev) minElev = coord[2];
                    if (coord[2] > maxElev) maxElev = coord[2];
                }
            });
        });

        if (minElev === Infinity) minElev = resort.Tags?.statistics?.minElevation || 0;
        if (maxElev === -Infinity) maxElev = resort.Tags?.statistics?.maxElevation || 0;

        let totalCapacity = 0;
        let totalHourlyCapacity = 0;
        const liftTypeCounts: Record<string, number> = {};

        lifts.forEach(l => {
            totalCapacity += l.Capacity || 0;
            totalHourlyCapacity += l.CapacityHourly || 0;
            const type = l.LiftType || 'unknown';
            liftTypeCounts[type] = (liftTypeCounts[type] || 0) + 1;
        });

        return {
            totalPistes: pistes.length,
            totalPisteLength: Math.round(totalPisteLength),
            difficultyCounts,
            difficultyLengths,
            minElev: minElev !== Infinity ? Math.round(minElev) : null,
            maxElev: maxElev !== -Infinity ? Math.round(maxElev) : null,
            totalLifts: lifts.length,
            totalCapacity,
            totalHourlyCapacity,
            liftTypeCounts
        };
    }, [resort]);

    const formattedPisteLength = (stats.totalPisteLength / 1000).toFixed(1);

    const difficultyDistribution = useMemo(() => {
        const total = stats.totalPisteLength || 1;
        return [
            { key: 'novice', pct: (stats.difficultyLengths.novice / total) * 100 },
            { key: 'easy', pct: (stats.difficultyLengths.easy / total) * 100 },
            { key: 'intermediate', pct: (stats.difficultyLengths.intermediate / total) * 100 },
            { key: 'advanced', pct: (stats.difficultyLengths.advanced / total) * 100 },
            { key: 'other', pct: (stats.difficultyLengths.other / total) * 100 },
        ].filter(item => item.pct > 0);
    }, [stats]);

    if (!resort) return null;

    return (
        <View className="absolute top-12 left-4 right-4 z-50 bg-slate-900/95 border border-slate-700 shadow-2xl p-4 rounded-3xl max-h-[75vh]">
            <ScrollView className="space-y-4">
                <View className="flex-row justify-between items-start">
                    <Text className="text-xs text-slate-400 font-medium">
                        {resort.Country || "Ski Resort"}
                    </Text>
                    <TouchableOpacity onPress={onClose} className="p-1.5 rounded-full bg-slate-800">
                        <X size={18} color="#94a3b8" />
                    </TouchableOpacity>
                </View>

                <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-full bg-blue-900/60 items-center justify-center border border-blue-700">
                        <Text className="text-xl">🏔️</Text>
                    </View>
                    <View className="flex-1">
                        <Text className="text-2xl font-bold text-white leading-tight">{resort.Name}</Text>
                        {resort.Website && (
                            <TouchableOpacity onPress={() => Linking.openURL(resort.Website!)}>
                                <Text className="text-xs font-semibold text-blue-400 text-right underline" numberOfLines={1}>
                                    {resort.Website.replace(/^https?:\/\//, '')}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <View className="flex-row justify-between border-t border-b border-slate-800 py-3 my-2">
                    <View className="items-center">
                        <Text className="text-[10px] text-slate-400 uppercase font-semibold">Total Slopes</Text>
                        <Text className="text-sm font-bold text-white mt-0.5">{stats.totalPistes} ({formattedPisteLength} km)</Text>
                    </View>
                    <View className="items-center">
                        <Text className="text-[10px] text-slate-400 uppercase font-semibold">Lifts</Text>
                        <Text className="text-sm font-bold text-white mt-0.5">{stats.totalLifts}</Text>
                    </View>
                    <View className="items-center">
                        <Text className="text-[10px] text-slate-400 uppercase font-semibold">Elevation</Text>
                        <Text className="text-sm font-bold text-white mt-0.5">
                            {stats.minElev && stats.maxElev ? `${stats.minElev}m - ${stats.maxElev}m` : 'N/A'}
                        </Text>
                    </View>
                </View>

                {difficultyDistribution.length > 0 && (
                    <View className="my-2">
                        <Text className="text-xs text-slate-400 uppercase font-semibold mb-2">Difficulty Breakdown</Text>
                        <View className="w-full h-3 rounded-full overflow-hidden flex-row bg-slate-800">
                            {difficultyDistribution.map(item => {
                                const meta = getDifficultyMeta(item.key);
                                return (
                                    <View
                                        key={item.key}
                                        style={{ width: `${item.pct}%` }}
                                        className={`${meta.bg} h-full`}
                                    />
                                );
                            })}
                        </View>
                    </View>
                )}

                <View className="my-2">
                    <Text className="text-xs text-slate-400 uppercase font-semibold mb-2">Pistes</Text>
                    <View className="flex-row flex-wrap gap-2">
                        {Object.entries(stats.difficultyCounts).map(([diff, count]) => {
                            if (count === 0 && diff === 'other') return null;
                            const meta = getDifficultyMeta(diff);
                            const len = stats.difficultyLengths[diff as keyof typeof stats.difficultyLengths] || 0;
                            return (
                                <View key={diff} className="flex-row items-center bg-slate-800 rounded-xl p-2.5 border border-slate-700 w-[48%]">
                                    <View className={`w-3 h-3 rounded-full ${meta.bg} mr-2`} />
                                    <View>
                                        <Text className="text-xs font-bold text-white">{count} <Text className="font-normal text-slate-300">{meta.label}</Text></Text>
                                        <Text className="text-[10px] text-slate-400">{(len / 1000).toFixed(1)} km</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </View>

                {stats.totalLifts > 0 && (
                    <View className="my-2">
                        <Text className="text-xs text-slate-400 uppercase font-semibold mb-2">Lifts & Capacity</Text>
                        {stats.totalCapacity > 0 && (
                            <View className="flex-row justify-between border-b border-slate-800 pb-2 mb-2">
                                <Text className="text-xs text-slate-400">Hourly capacity:</Text>
                                <Text className="text-xs font-semibold text-white">
                                    {stats.totalHourlyCapacity ? `${stats.totalHourlyCapacity.toLocaleString()} pers./h` : 'N/A'}
                                </Text>
                            </View>
                        )}
                        <View className="flex-row flex-wrap gap-1.5">
                            {Object.entries(stats.liftTypeCounts).map(([type, count]) => (
                                <View key={type} className="px-2.5 py-1 bg-blue-950/80 border border-blue-800/60 rounded-lg">
                                    <Text className="text-[10px] text-blue-300 font-semibold uppercase">
                                        {count}x {parseLiftType(type)}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

