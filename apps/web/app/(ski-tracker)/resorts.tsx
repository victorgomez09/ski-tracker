import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    Search,
    MapPin,
    Activity,
    ChevronRight,
    ExternalLink,
    Globe,
    Navigation,
    X,
    Compass,
    TrendingUp,
    Map as MapIcon,
    User,
    Lock,
    Unlock
} from "lucide-react-native";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Linking, Modal } from "react-native";

import { API_BASE_URL } from "constants/constants";
import { Resort } from "models/ski-resort.model";
import { useAuth } from "context/auth.context";
import { WeatherForecast } from "models/weather.model";
import { WeatherForecastDetails } from "components/resorts/weather-forecast";
import api from "interceptor/api";

// Cache state to survive tab navigation / component remounting
let cachedResorts: Resort[] = [];
let cachedSearchTerm = "";
let cachedSelectedResort: Resort | null = null;
let cachedSessions: any[] = [];
let lastFetchedSearchTerm = cachedSearchTerm;

export default function ResortsView() {
    const router = useRouter();

    const [resorts, setResorts] = useState<Resort[]>(cachedResorts);
    const [searchTerm, setSearchTerm] = useState(cachedSearchTerm);
    const [selectedResort, setSelectedResort] = useState<Resort | null>(cachedSelectedResort);
    const [sessions, setSessions] = useState<any[]>(cachedSessions);
    const [isLoadingResorts, setIsLoadingResorts] = useState(false);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);
    const [weatherData, setWeatherData] = useState<WeatherForecast | null>(null);
    const { token } = useAuth();

    // Cache sync helpers
    const setResortsWithCache = (val: Resort[]) => {
        cachedResorts = val;
        setResorts(val);
    };

    const setSearchTermWithCache = (val: string) => {
        cachedSearchTerm = val;
        setSearchTerm(val);
    };

    const setSelectedResortWithCache = (val: Resort | null) => {
        cachedSelectedResort = val;
        setSelectedResort(val);
    };

    const setSessionsWithCache = (val: any[]) => {
        cachedSessions = val;
        setSessions(val);
    };

    // Debounce search API call
    useEffect(() => {
        if (searchTerm === lastFetchedSearchTerm) {
            return;
        }

        if (searchTerm.trim().length <= 2) {
            setResortsWithCache([]);
            lastFetchedSearchTerm = "";
            return;
        }

        setIsLoadingResorts(true);
        const delayDebounceFn = setTimeout(async () => {
            try {
                const response = await api.get(`${API_BASE_URL}/resorts/by-name`, {
                    params: { name: searchTerm },
                });

                if (response.status === 200) {
                    setResortsWithCache(response.data);
                    lastFetchedSearchTerm = searchTerm;
                } else {
                    console.error("Error fetching resorts:", response.statusText);
                }
            } catch (error) {
                console.error("Error fetching resorts:", error);
                setResortsWithCache([]);
            } finally {
                setIsLoadingResorts(false);
            }
        }, 350);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm, token]);

    const handleSearch = (term: string) => {
        setSearchTermWithCache(term);
        setSelectedResortWithCache(null);
    };

    const handleResortSelect = async (resort: Resort) => {
        setSelectedResortWithCache(resort);
        setSessionsWithCache([]);
        setIsLoadingSessions(true);

        try {
            const sessionsRequest = await api.get(`${API_BASE_URL}/ski-sessions/by-resort`, {
                params: { resort_id: resort.ID },
            });

            const weatherRequest = await api.get<WeatherForecast>(`${API_BASE_URL}/weather`, {
                params: { lat: resort.Latitude, lon: resort.Longitude },
            });

            if (sessionsRequest.status === 200 && weatherRequest.status === 200) {
                setSessionsWithCache(sessionsRequest.data.sessions || []);
                setWeatherData(weatherRequest.data);
            }
        } catch (err) {
            console.error("Error fetching sessions:", err);
            setSessionsWithCache([]);
        } finally {
            setIsLoadingSessions(false);
        }
    };

    const handleSessionClick = (session: any) => {
        if (!selectedResort) return;
        router.push(`/map?sessionId=${session.id}&lat=${selectedResort.Latitude}&lng=${selectedResort.Longitude}&zoom=14`);
        setSelectedResortWithCache(null);
    };

    const selectedResortSummary = useMemo(() => {
        if (!selectedResort) return null;

        const stats = selectedResort.Tags?.statistics;
        const liftsType = stats?.lifts?.byType;
        const pistes = selectedResort.pistes || [];

        return {
            lifts: selectedResort.total_lifts ?? 0,
            pistes: selectedResort.total_pistes ?? 0,
            distance: selectedResort.distance_km ?? 0,
            country: selectedResort.Country || "Unknown",
            website: selectedResort.Website || null,
            pistesBreakdown: {
                novice: pistes.filter(p => p.Difficulty?.toLowerCase() === 'novice').length ?? 0,
                easy: pistes.filter(p => p.Difficulty?.toLowerCase() === 'easy').length ?? 0,
                intermediate: pistes.filter(p => p.Difficulty?.toLowerCase() === 'intermediate').length ?? 0,
                advanced: pistes.filter(p => p.Difficulty?.toLowerCase() === 'advanced' || p.Difficulty?.toLowerCase() === 'expert').length ?? 0,
            },
            liftsBreakdown: {
                chair_lift: liftsType?.chair_lift?.count ?? 0,
                drag_lift: liftsType?.drag_lift?.count ?? 0,
                magic_carpet: liftsType?.magic_carpet?.count ?? 0,
                rope_tow: liftsType?.rope_tow?.count ?? 0,
            }
        };
    }, [selectedResort]);

    const renderDetailsContent = () => {
        if (!selectedResort) return null;

        return (
            <ScrollView className="flex-1 bg-slate-900 p-4 space-y-6">
                {/* Header Banner */}
                <View className="bg-slate-800 rounded-md p-5 border border-slate-700 shadow-xl flex-row justify-between items-start mb-4">
                    <View className="flex-1">
                        <View className="bg-blue-900/60 px-3 py-1 rounded-full self-start flex-row items-center gap-1 border border-blue-700">
                            <Globe size={12} color="#60a5fa" />
                            <Text className="text-xs text-blue-300 font-bold">{selectedResort.Country}</Text>
                        </View>
                        <Text className="text-2xl font-extrabold text-white mt-2 leading-tight">{selectedResort.Name}</Text>
                    </View>
                    <TouchableOpacity
                        className="p-2 bg-slate-700 rounded-full"
                        onPress={() => setSelectedResortWithCache(null)}
                    >
                        <X size={18} color="#94a3b8" />
                    </TouchableOpacity>
                </View>

                {/* Key Metrics Grid */}
                <View className="mb-4">
                    <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Resort Metrics</Text>
                    <View className="flex-row gap-3">
                        <View className="flex-1 bg-slate-800 border border-slate-700 p-4 rounded-md">
                            <Text className="text-slate-400 text-xs font-medium">Lifts</Text>
                            <Text className="text-2xl font-bold text-white mt-1">{selectedResortSummary?.lifts}</Text>
                        </View>

                        <View className="flex-1 bg-slate-800 border border-slate-700 p-4 rounded-md">
                            <Text className="text-slate-400 text-xs font-medium">Pistes</Text>
                            <Text className="text-2xl font-bold text-white mt-1">{selectedResortSummary?.pistes}</Text>
                        </View>

                        <View className="flex-1 bg-slate-800 border border-slate-700 p-4 rounded-md">
                            <Text className="text-slate-400 text-xs font-medium">Distance</Text>
                            <Text className="text-2xl font-bold text-white mt-1">
                                {selectedResortSummary?.distance.toFixed(1)} <Text className="text-xs text-slate-400">km</Text>
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Pistes Breakdown */}
                {selectedResortSummary && (
                    <View className="mb-4 w-full">
                        <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Pistes Breakdown</Text>
                        <View className="grid grid-cols-2 grid-wrap gap-2 w-full">
                            <View className="bg-slate-800 border border-slate-700 p-3 rounded-md flex-row items-center gap-2.5 mb-2">
                                <View className="w-3 h-3 rounded-full bg-[#00a859]" />
                                <View>
                                    <Text className="text-[10px] text-slate-400 uppercase font-semibold">Novice</Text>
                                    <Text className="text-sm font-bold text-white">{selectedResortSummary.pistesBreakdown.novice} runs</Text>
                                </View>
                            </View>

                            <View className="bg-slate-800 border border-slate-700 p-3 rounded-md flex-row items-center gap-2.5 mb-2">
                                <View className="w-3 h-3 rounded-full bg-[#0072bc]" />
                                <View>
                                    <Text className="text-[10px] text-slate-400 uppercase font-semibold">Easy</Text>
                                    <Text className="text-sm font-bold text-white">{selectedResortSummary.pistesBreakdown.easy} runs</Text>
                                </View>
                            </View>

                            <View className="bg-slate-800 border border-slate-700 p-3 rounded-md flex-row items-center gap-2.5 mb-2">
                                <View className="w-3 h-3 rounded-full bg-[#f0141e]" />
                                <View>
                                    <Text className="text-[10px] text-slate-400 uppercase font-semibold">Intermediate</Text>
                                    <Text className="text-sm font-bold text-white">{selectedResortSummary.pistesBreakdown.intermediate} runs</Text>
                                </View>
                            </View>

                            <View className="bg-slate-800 border border-slate-700 p-3 rounded-md flex-row items-center gap-2.5 mb-2">
                                <View className="w-3 h-3 rounded-full bg-black border border-slate-600" />
                                <View>
                                    <Text className="text-[10px] text-slate-400 uppercase font-semibold">Expert</Text>
                                    <Text className="text-sm font-bold text-white">{selectedResortSummary.pistesBreakdown.advanced} runs</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {/* Lifts Breakdown */}
                {selectedResortSummary && (
                    <View className="mb-4">
                        <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Lifts Breakdown</Text>
                        <View className="grid grid-cols-2 grid-wrap gap-2 w-full">
                            <View className="bg-slate-800 border border-slate-700 p-3 rounded-md flex-row items-center gap-2.5 mb-2">
                                <Text className="text-base">🚡</Text>
                                <View>
                                    <Text className="text-[10px] text-slate-400 uppercase font-semibold">Chair Lifts</Text>
                                    <Text className="text-sm font-bold text-white">{selectedResortSummary.liftsBreakdown.chair_lift}</Text>
                                </View>
                            </View>

                            <View className="bg-slate-800 border border-slate-700 p-3 rounded-md flex-row items-center gap-2.5 mb-2">
                                <Text className="text-base">⛷️</Text>
                                <View>
                                    <Text className="text-[10px] text-slate-400 uppercase font-semibold">Drag Lifts</Text>
                                    <Text className="text-sm font-bold text-white">{selectedResortSummary.liftsBreakdown.drag_lift}</Text>
                                </View>
                            </View>

                            <View className="bg-slate-800 border border-slate-700 p-3 rounded-md flex-row items-center gap-2.5 mb-2">
                                <Text className="text-base">🛹</Text>
                                <View>
                                    <Text className="text-[10px] text-slate-400 uppercase font-semibold">Magic Carpets</Text>
                                    <Text className="text-sm font-bold text-white">{selectedResortSummary.liftsBreakdown.magic_carpet}</Text>
                                </View>
                            </View>

                            <View className="bg-slate-800 border border-slate-700 p-3 rounded-md flex-row items-center gap-2.5 mb-2">
                                <Text className="text-base">🪢</Text>
                                <View>
                                    <Text className="text-[10px] text-slate-400 uppercase font-semibold">Rope Tows</Text>
                                    <Text className="text-sm font-bold text-white">{selectedResortSummary.liftsBreakdown.rope_tow}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {/* Website CTA */}
                {selectedResortSummary?.website && (
                    <View className="mb-4">
                        <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Website</Text>
                        <View className="bg-slate-800 border border-slate-700 p-4 rounded-md flex-row items-center justify-between">
                            <View className="flex-row items-center gap-3">
                                <View className="w-10 h-10 rounded-md bg-blue-900/60 items-center justify-center">
                                    <Globe size={20} color="#60a5fa" />
                                </View>
                                <View>
                                    <Text className="font-semibold text-sm text-white">Resort Website</Text>
                                    <Text className="text-xs text-slate-400">Visit official page</Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                className="bg-blue-600 px-3.5 py-2 rounded-md flex-row items-center gap-1"
                                onPress={() => Linking.openURL(selectedResortSummary.website!)}
                            >
                                <Text className="text-white text-xs font-bold">Open</Text>
                                <ExternalLink size={14} color="#ffffff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Weather Forecast */}
                {weatherData && (
                    <WeatherForecastDetails data={weatherData} />
                )}

                {/* Sessions Log */}
                <View className="my-4">
                    <View className="flex-row items-center justify-between mb-3">
                        <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">Ski Sessions ({sessions.length})</Text>
                        {isLoadingSessions && <ActivityIndicator size="small" color="#3b82f6" />}
                    </View>

                    {sessions.length > 0 ? (
                        <View className="space-y-3">
                            {sessions.map((session) => (
                                <TouchableOpacity
                                    key={session.id}
                                    onPress={() => handleSessionClick(session)}
                                    className="bg-slate-800 p-4 rounded-md border border-slate-700 flex-row items-center justify-between my-1"
                                >
                                    <View className="space-y-1">
                                        <View className="flex-row items-center gap-2">
                                            <View className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <Text className="font-bold text-xs text-white">
                                                {new Date(session.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                            </Text>
                                            <Text className="text-[10px] text-slate-400">
                                                {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </Text>
                                        </View>
                                        <View className="flex-row items-center gap-2 mt-1">
                                            <User size={12} color="#94a3b8" />
                                            <Text className="text-xs text-slate-300">
                                                {session.user ? (session.user.display_name || `${session.user.first_name} ${session.user.last_name}`.trim() || session.user.email) : 'User'}
                                            </Text>
                                            {session.is_public ? (
                                                <View className="flex-row items-center gap-1">
                                                    <Unlock size={10} color="#34d399" />
                                                    <Text className="text-[10px] text-emerald-400 font-semibold">Public</Text>
                                                </View>
                                            ) : (
                                                <View className="flex-row items-center gap-1">
                                                    <Lock size={10} color="#fbbf24" />
                                                    <Text className="text-[10px] text-amber-400 font-semibold">Private</Text>
                                                </View>
                                            )}
                                        </View>
                                        <View className="flex-row items-center gap-3 mt-1.5">
                                            <Text className="text-[11px] text-slate-300">{(session.total_distance / 1000).toFixed(2)} km</Text>
                                            <Text className="text-[11px] text-slate-300">{(session.max_speed * 3.6).toFixed(1)} km/h</Text>
                                            <Text className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-200 font-bold uppercase">{session.activity_type}</Text>
                                        </View>
                                    </View>

                                    <ChevronRight size={20} color="#60a5fa" />
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : !isLoadingSessions ? (
                        <View className="border border-dashed border-slate-700 rounded-md p-6 items-center justify-center bg-slate-800/40">
                            <Activity size={32} color="#64748b" />
                            <Text className="font-semibold text-sm text-slate-300 mt-2">No sessions recorded</Text>
                            <Text className="text-xs text-slate-500 text-center mt-1">No sessions at this ski resort yet.</Text>
                        </View>
                    ) : null}
                </View>

                {/* Footer Action Bar */}
                <TouchableOpacity
                    className="bg-blue-600 p-4 rounded-md flex-row items-center justify-center gap-2 mb-8 shadow-xl"
                    onPress={() => {
                        router.push(`/map?lat=${selectedResort.Latitude}&lon=${selectedResort.Longitude}&zoom=12`);
                        setSelectedResortWithCache(null);
                    }}
                >
                    <MapIcon size={18} color="#ffffff" />
                    <Text className="text-white font-bold text-base">View on Map</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    };

    return (
        <View className="flex-1 bg-slate-950 p-4 pt-6">
            {/* Search Header Container */}
            <View className="mb-4">
                <Text className="text-xl font-extrabold text-white mb-3">Ski Resorts</Text>
                <View className="relative flex-row items-center bg-slate-800 rounded-md px-4 border border-slate-700">
                    {isLoadingResorts ? (
                        <ActivityIndicator size="small" color="#3b82f6" />
                    ) : (
                        <Search size={18} color="#94a3b8" />
                    )}
                    <TextInput
                        className="flex-1 p-3.5 text-sm text-white ml-2"
                        placeholder="Search by name, country..."
                        placeholderTextColor="#94a3b8"
                        value={searchTerm}
                        onChangeText={handleSearch}
                    />
                </View>
            </View>

            {/* List Body Container */}
            <ScrollView className="flex-1 space-y-3">
                {resorts.length > 0 && (
                    <View className="mb-4">
                        <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                            Matching Resorts ({resorts.length})
                        </Text>
                        <View className="space-y-2">
                            {resorts.map((resort) => {
                                const isSelected = selectedResort?.ID === resort.ID;
                                return (
                                    <TouchableOpacity
                                        key={resort.ID}
                                        className={`rounded-md border p-4 mb-2 ${
                                            isSelected
                                                ? "border-blue-500 bg-blue-950/40"
                                                : "border-slate-800 bg-slate-900"
                                        }`}
                                        onPress={() => handleResortSelect(resort)}
                                    >
                                        <View className="flex-row justify-between items-start">
                                            <View>
                                                <Text className="font-bold text-base text-white">{resort.Name}</Text>
                                                <View className="flex-row items-center gap-1 mt-1">
                                                    <MapPin size={12} color="#94a3b8" />
                                                    <Text className="text-xs text-slate-400">{resort.Country}</Text>
                                                </View>
                                            </View>
                                            <View className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                                                <Text className="text-xs font-bold text-slate-200">{resort.total_lifts ?? 0} Lifts</Text>
                                            </View>
                                        </View>

                                        <View className="flex-row items-center gap-3 pt-3 mt-2 border-t border-slate-800">
                                            <Text className="text-xs text-slate-400">{resort.total_pistes ?? 0} Pistes</Text>
                                            <Text className="text-xs text-slate-400">•</Text>
                                            <Text className="text-xs text-slate-400">{resort.distance_km?.toFixed(1) ?? "0.0"} km runs</Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Welcome / Initial State */}
                {resorts.length === 0 && searchTerm.length <= 2 && (
                    <View className="items-center justify-center p-8 text-center my-12">
                        <View className="w-16 h-16 rounded-md bg-blue-900/40 items-center justify-center mb-4 border border-blue-700">
                            <Compass size={32} color="#60a5fa" />
                        </View>
                        <Text className="font-bold text-base text-white">Explore Ski Resorts</Text>
                        <Text className="text-xs text-slate-400 text-center mt-2 max-w-xs leading-relaxed">
                            Enter 3 or more characters in the search bar above to look up global ski resorts and check metrics.
                        </Text>
                    </View>
                )}

                {/* No results state */}
                {resorts.length === 0 && searchTerm.length > 2 && !isLoadingResorts && (
                    <View className="items-center justify-center p-8 text-center my-12">
                        <View className="w-16 h-16 rounded-md bg-red-900/40 items-center justify-center mb-4 border border-red-700">
                            <X size={32} color="#f87171" />
                        </View>
                        <Text className="font-bold text-base text-white">No Resorts Found</Text>
                        <Text className="text-xs text-slate-400 text-center mt-2 max-w-xs leading-relaxed">
                            We couldn't find any resorts matching “{searchTerm}”. Check spelling or try another term.
                        </Text>
                    </View>
                )}
            </ScrollView>

            {/* Modal Detail View for Selected Resort */}
            <Modal
                visible={!!selectedResort}
                animationType="slide"
                onRequestClose={() => setSelectedResortWithCache(null)}
            >
                <View className="flex-1 bg-slate-950">
                    {renderDetailsContent()}
                </View>
            </Modal>
        </View>
    );
}