import { ResortDetail, Piste, Lift } from 'models/ski-resort.model';
import React, { useMemo } from 'react';

interface ResortDetailPanelProps {
    resort: ResortDetail;
    onClose: () => void;
}

const getDifficultyMeta = (difficulty: string) => {
    switch (difficulty) {
        case 'novice':
            return { label: 'Novice', bg: 'bg-[#00a859]', text: 'text-white', hex: '#00a859' };
        case 'easy':
            return { label: 'Easy', bg: 'bg-[#0072bc]', text: 'text-white', hex: '#0072bc' };
        case 'intermediate':
            return { label: 'Intermediate', bg: 'bg-[#f0141e]', text: 'text-white', hex: '#f0141e' };
        case 'advanced':
            return { label: 'Expert', bg: 'bg-black', text: 'text-white', hex: '#000000' };
        default:
            return { label: 'Other', bg: 'bg-gray-400', text: 'text-white', hex: '#9ca3af' };
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
        const R = 6371e3; // metres
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
    switch (liftType.toLowerCase()) {
        case 'chair_lift':
            return 'Chair Lift';
        case 'drag_lift':
            return 'Drag Lift';
        case 'gondola':
            return 'Gondola';
        case 'cable_car':
            return 'Cable Car';
        case 'funicular':
            return 'Funicular';
        case 'magic_carpet':
            return 'Magic Carpet';
        default:
            return liftType.replace(/_/g, ' ');
    }
};

export const ResortDetailPanel: React.FC<ResortDetailPanelProps> = ({ resort, onClose }) => {
    if (!resort) return null;

    const stats = useMemo(() => {
        const pistes = resort.pistes || [];
        const lifts = resort.lifts || [];

        let totalPisteLength = 0;
        const difficultyCounts = {
            novice: 0,
            easy: 0,
            intermediate: 0,
            advanced: 0,
            other: 0
        };
        const difficultyLengths = {
            novice: 0,
            easy: 0,
            intermediate: 0,
            advanced: 0,
            other: 0
        };

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

        lifts.forEach(l => {
            const coords = l.GeometryGeoJSON?.coordinates || [];
            coords.forEach(coord => {
                if (coord[2] !== undefined && coord[2] > 0) {
                    if (coord[2] < minElev) minElev = coord[2];
                    if (coord[2] > maxElev) maxElev = coord[2];
                }
            });
        });

        if (minElev === Infinity) minElev = resort.statistics?.minElevation || 0;
        if (maxElev === -Infinity) maxElev = resort.statistics?.maxElevation || 0;

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

    return (
        <div className="absolute top-4 left-4 z-50 bg-base-100/95 backdrop-blur-md border border-base-300 shadow-2xl rounded-2xl p-4 w-96 max-h-[85vh] overflow-y-auto flex flex-col gap-3">
            <div className="flex justify-between items-start mb-2">
                <div className="text-xs text-gray-500 font-medium tracking-wide">
                    {resort.Country || "Ski Resort"}
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-50 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg shadow-sm">
                    🏔️
                </div>
                <div className="flex-1">
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900 leading-tight">{resort.Name}</h2>
                    {resort.Website && (
                        <a
                            href={resort.Website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1 mt-0.5"
                        >
                            Visit Website ↗
                        </a>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-b border-gray-100 py-3 mb-4 text-xs font-semibold text-gray-700">
                <div>
                    <span className="text-gray-400 block font-normal uppercase tracking-wider mb-0.5">Total Slopes</span>
                    <span className="text-sm font-bold text-gray-900">{stats.totalPistes} ({formattedPisteLength} km)</span>
                </div>
                <div>
                    <span className="text-gray-400 block font-normal uppercase tracking-wider mb-0.5">Lifts</span>
                    <span className="text-sm font-bold text-gray-900">{stats.totalLifts}</span>
                </div>
                <div>
                    <span className="text-gray-400 block font-normal uppercase tracking-wider mb-0.5">Elevation</span>
                    <span className="text-sm font-bold text-gray-900">
                        {stats.minElev && stats.maxElev ? `${stats.minElev}m - ${stats.maxElev}m` : 'N/A'}
                    </span>
                </div>
            </div>

            {/* Difficulty distribution bar */}
            {difficultyDistribution.length > 0 && (
                <div className="mb-4">
                    <span className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5 font-medium">Difficulty Breakdown</span>
                    <div className="w-full h-3 rounded-full overflow-hidden flex bg-gray-100">
                        {difficultyDistribution.map(item => {
                            const meta = getDifficultyMeta(item.key);
                            return (
                                <div
                                    key={item.key}
                                    style={{ width: `${item.pct}%` }}
                                    className={`${meta.bg}`}
                                    title={`${meta.label}: ${item.pct.toFixed(0)}%`}
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Pistes Breakdown */}
            <div className="mb-4">
                <span className="text-xs text-gray-400 uppercase tracking-wider block mb-2 font-medium">Pistes</span>
                <div className="grid grid-cols-2 gap-2">
                    {Object.entries(stats.difficultyCounts).map(([diff, count]) => {
                        if (count === 0 && diff === 'other') return null;
                        const meta = getDifficultyMeta(diff);
                        const len = stats.difficultyLengths[diff as keyof typeof stats.difficultyLengths] || 0;
                        return (
                            <div key={diff} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border border-gray-100">
                                <span className={`w-3 h-3 rounded-full ${meta.bg}`} />
                                <div className="text-xs">
                                    <span className="font-bold text-gray-900">{count}</span>{' '}
                                    <span className="text-gray-500 font-normal">{meta.label}</span>
                                    <span className="block text-[10px] text-gray-400 font-normal">{(len / 1000).toFixed(1)} km</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Lifts Breakdown */}
            {stats.totalLifts > 0 && (
                <div className="mb-2">
                    <span className="text-xs text-gray-400 uppercase tracking-wider block mb-2 font-medium">Lifts & Capacity</span>
                    <div className="space-y-2 text-xs">
                        {stats.totalCapacity > 0 && (
                            <div className="flex justify-between border-b border-gray-50 pb-1.5 text-gray-600">
                                <span>Hourly capacity:</span>
                                <span className="font-semibold text-gray-900">
                                    {stats.totalHourlyCapacity ? `${stats.totalHourlyCapacity.toLocaleString()} pers./h` : 'N/A'}
                                </span>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {Object.entries(stats.liftTypeCounts).map(([type, count]) => (
                                <span key={type} className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md font-medium text-[10px] uppercase">
                                    {count}x {parseLiftType(type)}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="text-[10px] text-gray-400 flex items-center justify-between border-t border-gray-100 pt-3 mt-4">
                <span>Source: <a href="https://openstreetmap.org" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">OpenStreetMap</a></span>
            </div>
        </div>
    );
};
