import { Lift, Piste } from 'models/ski-resort.model';
import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

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
            return { label: 'Novice', bg: 'bg-[#00a859]', text: 'text-white', hex: '#00a859' };
        case 'easy':
            return { label: 'Easy', bg: 'bg-[#0072bc]', text: 'text-white', hex: '#0072bc' };
        case 'intermediate':
            return { label: 'Advanced', bg: 'bg-[#f0141e]', text: 'text-white', hex: '#f0141e' };
        case 'advanced':
        case 'expert':
            return { label: 'Expert', bg: 'bg-black', text: 'text-white', hex: '#000000' };
        default:
            return { label: 'Easy', bg: 'bg-[#0072bc]', text: 'text-white', hex: '#0072bc' };
    }
};

export const MapDetailPanel: React.FC<MapDetailPanelProps> = ({ data, onClose }) => {
    if (!data) return null;

    const tags = data.Tags || {};
    const elevationProfile = tags.elevationProfile || {};
    const heights = elevationProfile.heights || [];
    const resolution = elevationProfile.resolution || 25;
    const type = data.GeometryGeoJSON.type || "LineString";

    const ref = tags.ref || "•";
    const difficulty: string = (data as Piste).Difficulty || tags.difficulty || "easy";
    const name: string = data.Name || tags.name || `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} ${(data as Piste).PisteType} area`;

    const diffMeta = getDifficultyMeta(difficulty);

    const chartData = useMemo(() => {
        if (heights.length === 0) return [];

        return heights.map((height: number, index: number) => {
            const distanceMeters = index * resolution;
            const distanceKm = (distanceMeters / 1000).toFixed(2);

            let slopePct = 0;
            if (index > 0) {
                const prevHeight = heights[index - 1];
                const elevationDiff = Math.abs(height - prevHeight);
                slopePct = (elevationDiff / resolution) * 100;
            }

            let color = '#00a859';
            if (slopePct >= 10 && slopePct < 20) color = '#0072bc';
            else if (slopePct >= 20 && slopePct < 35) color = '#f0141e';
            else if (slopePct >= 35) color = '#111827';

            return {
                distance: parseFloat(distanceKm),
                elevation: Math.round(height),
                slope: Math.round(slopePct),
                color: color,
            };
        });
    }, [heights, resolution]);

    const gradientStops = useMemo(() => {
        if (chartData.length < 2) return [];

        return chartData.map((point: any, index: number) => {
            const offsetPct = (index / (chartData.length - 1)) * 100;
            return (
                <stop
                    key={index}
                    offset={`${offsetPct}%`}
                    stopColor={point.color}
                />
            );
        });
    }, [chartData]);

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
    const skiArea = skiAreas[0]?.properties?.name;

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
                return liftType;
        }
    }

    return (
        <div className="absolute top-4 left-4 z-1000 w-95 bg-white rounded-lg shadow-xl border border-gray-100 p-5 font-sans text-gray-800">
            <div className="flex justify-between items-start mb-2">
                <div className="text-xs text-gray-500 font-medium tracking-wide">
                    {country} <span className="mx-1">›</span> {region} <span className="mx-1">›</span>
                    <div className="text-gray-600 hover:underline cursor-pointer mt-0.5">{skiArea}</div>
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
                {!(data as Lift).LiftType ? (
                    <div className={`w-8 h-8 rounded-full ${diffMeta.bg} ${diffMeta.text} flex items-center justify-center font-bold text-sm shadow-sm`}>
                        {ref}
                    </div>

                ) : (
                    <div className={`w-8 h-8 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-bold text-sm shadow-sm`}>
                        🚠
                    </div>
                )}
                <h2 className="text-2xl font-bold tracking-tight text-gray-900">{name}</h2>
            </div>

            {(!(data as Lift).LiftType && type === "LineString") && (
                <>
                    <div className="text-sm text-gray-500 capitalize mb-4 font-medium">
                        {diffMeta.label} downhill ski run
                    </div>


                    <div className="grid grid-cols-3 gap-2 border-t border-b border-gray-100 py-3 mb-3 text-xs font-semibold text-gray-700">
                        <div>
                            <span className="text-gray-400 block font-normal uppercase tracking-wider mb-0.5">Distance</span>
                            <span className="text-sm font-bold text-gray-900">{totalDistance}m</span>
                        </div>
                        <div>
                            <span className="text-gray-400 block font-normal uppercase tracking-wider mb-0.5">Ascent</span>
                            <span className="text-sm font-bold text-gray-900">{ascent}m</span>
                        </div>
                        <div>
                            <span className="text-gray-400 block font-normal uppercase tracking-wider mb-0.5">Descent</span>
                            <span className="text-sm font-bold text-gray-900">{descent}m</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-5 text-xs text-gray-700">
                        <div>
                            <span className="text-gray-400 block mb-0.5">Average Slope</span>
                            <span className="text-sm font-semibold text-gray-900">{avgSlopeDeg}° ({avgSlopePct}%)</span>
                        </div>
                        <div>
                            <span className="text-gray-400 block mb-0.5">Max Slope</span>
                            <span className="text-sm font-semibold text-gray-900">{maxSlopeDeg}° ({maxSlopePct}%)</span>
                        </div>
                    </div>

                    <div className="h-44 w-full mb-3">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="slopeColorGradient" x1="0" y1="0" x2="1" y2="0">
                                            {gradientStops}
                                        </linearGradient>
                                        <linearGradient id="verticalOpacity" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#9ca3af" stopOpacity={0.0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis
                                        dataKey="distance"
                                        tickFormatter={(val) => `${val} km`}
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={{ stroke: '#e5e7eb' }}
                                    />
                                    <YAxis
                                        domain={['auto', 'auto']}
                                        tickFormatter={(val) => `${val}m`}
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={{ stroke: '#e5e7eb' }}
                                    />

                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload;
                                                const slopeDeg = pctToDegrees(data.slope);
                                                return (
                                                    <div className="bg-white p-3 border border-gray-100 rounded-lg shadow-md text-xs font-sans">
                                                        <p className="text-gray-500 font-medium mb-1.5">Distance: <span className="text-gray-800 font-bold">{label} km</span></p>
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-1.5">
                                                                {/* <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: diffMeta.hex }}></span> */}
                                                                <span className="text-gray-500">Elevation:</span>
                                                                <span className="text-gray-950 font-semibold">{data.elevation}m</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                {/* <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }}></span> */}
                                                                <span className="text-gray-500">Slope:</span>
                                                                <span className="text-gray-950 font-semibold">{data.slope}% ({slopeDeg}°)</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />

                                    <Area
                                        type="monotone"
                                        dataKey="elevation"
                                        stroke="url(#slopeColorGradient)"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#verticalOpacity)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center border border-dashed border-gray-200 rounded-lg text-xs text-gray-400">
                                No elevation profile data available
                            </div>
                        )}
                    </div>
                </>
            )}

            {((data as Lift).LiftType && type === "LineString") && (
                <div className="grid grid-cols-3 gap-2 border-t border-b border-gray-100 py-3 mb-3 text-xs font-semibold text-gray-700">
                    <div>
                        <span className="text-gray-400 block font-normal uppercase tracking-wider mb-0.5">Type:</span>
                        <span className="text-sm font-bold text-gray-900">{parseLiftType((data as Lift).LiftType)}</span>
                    </div>
                    <div>
                        <span className="text-gray-400 block font-normal uppercase tracking-wider mb-0.5">Capacity:</span>
                        <span className="text-sm font-bold text-gray-900">{(data as Lift).Capacity} pers.</span>
                    </div>
                    <div>
                        <span className="text-gray-400 block font-normal uppercase tracking-wider mb-0.5">Hourly Capacity:</span>
                        <span className="text-sm font-bold text-gray-900">{(data as Lift).CapacityHourly} pers.</span>
                    </div>
                </div>
            )}

            <div className="text-[10px] text-gray-400 flex items-center justify-between border-t border-gray-100 pt-3">
                <span>Source: <a href="https://openstreetmap.org" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">OpenStreetMap</a></span>
            </div>
        </div>
    );
};