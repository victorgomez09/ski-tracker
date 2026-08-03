import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { 
  Search, 
  MapPin, 
  Activity, 
  ChevronRight, 
  ExternalLink, 
  Globe, 
  Calendar, 
  Navigation, 
  X, 
  Info,
  Compass,
  ArrowRight,
  TrendingUp,
  Map,
  User,
  Lock,
  Unlock
} from "lucide-react";

import { API_BASE_URL } from "constants/constants";
import { Resort } from "models/ski-resort.model";
import { useAuth } from "context/auth.context";

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
                const response = await axios.get(`${API_BASE_URL}/resorts/by-name`, {
                    params: { name: searchTerm },
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
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
        }, 350); // 350ms debounce

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm, token]);

    const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
        const term = event.target.value;
        setSearchTermWithCache(term);
        setSelectedResortWithCache(null);
    };

    const handleResortSelect = async (resort: Resort) => {
        setSelectedResortWithCache(resort);
        setSessionsWithCache([]);
        setIsLoadingSessions(true);

        try {
            const request = await axios.get(`${API_BASE_URL}/ski-sessions`, {
                params: { resort_id: resort.ID },
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });

            if (request.status === 200) {
                setSessionsWithCache(request.data.sessions || []);
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

    // Detail Panel JSX helper to avoid duplication between desktop pane and mobile modal
    const renderDetailsContent = (isMobileView: boolean) => {
        if (!selectedResort) return null;

        return (
            <div className="flex flex-col h-full bg-base-100">
                {/* Header Banner */}
                <div className="card relative bg-base-300 text-base-content border-2 border-primary shrink-0">
                    <div className="card-body flex flex-row justify-between items-start">
                        <div className="space-y-1 pr-6">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/20 text-primary border border-primary/30">
                                <Globe className="w-3 h-3" />
                                {selectedResort.Country}
                            </span>
                            <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight mt-1">{selectedResort.Name}</h2>
                        </div>
                        {isMobileView && (
                            <button 
                                type="button" 
                                className="btn btn-circle btn-sm btn-ghost text-base-content border-0"
                                onClick={() => setSelectedResortWithCache(null)}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Dashboard Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Key Metrics Grid */}
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/50 mb-3">Resort Metrics</h3>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-base-200/60 border border-base-300/80 p-4 rounded-xl flex flex-col justify-between hover:border-primary/20 transition-all">
                                <span className="text-base-content/60 text-xs font-medium">Lifts</span>
                                <div className="flex items-baseline gap-1 mt-2">
                                    <span className="text-2xl font-bold tracking-tight text-base-content">{selectedResortSummary?.lifts}</span>
                                </div>
                            </div>
                            <div className="bg-base-200/60 border border-base-300/80 p-4 rounded-xl flex flex-col justify-between hover:border-primary/20 transition-all">
                                <span className="text-base-content/60 text-xs font-medium">Pistes</span>
                                <div className="flex items-baseline gap-1 mt-2">
                                    <span className="text-2xl font-bold tracking-tight text-base-content">{selectedResortSummary?.pistes}</span>
                                </div>
                            </div>
                            <div className="bg-base-200/60 border border-base-300/80 p-4 rounded-xl flex flex-col justify-between hover:border-primary/20 transition-all">
                                <span className="text-base-content/60 text-xs font-medium">Distance</span>
                                <div className="flex items-baseline gap-1 mt-2">
                                    <span className="text-2xl font-bold tracking-tight text-base-content">{selectedResortSummary?.distance.toFixed(1)}</span>
                                    <span className="text-xs text-base-content/60 font-semibold">km</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Pistes Breakdown */}
                    {selectedResortSummary && (
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/50 mb-3">Pistes Breakdown</h3>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                    <span className="w-3 h-3 rounded-full bg-[#00a859] shrink-0"></span>
                                    <div>
                                        <div className="text-[10px] text-base-content/60 font-semibold uppercase">Novice</div>
                                        <div className="text-sm font-extrabold text-base-content">{selectedResortSummary.pistesBreakdown.novice} runs</div>
                                    </div>
                                </div>
                                <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                    <span className="w-3 h-3 rounded-full bg-[#0072bc] shrink-0"></span>
                                    <div>
                                        <div className="text-[10px] text-base-content/60 font-semibold uppercase">Easy</div>
                                        <div className="text-sm font-extrabold text-base-content">{selectedResortSummary.pistesBreakdown.easy} runs</div>
                                    </div>
                                </div>
                                <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                    <span className="w-3 h-3 rounded-full bg-[#f0141e] shrink-0"></span>
                                    <div>
                                        <div className="text-[10px] text-base-content/60 font-semibold uppercase">Intermediate</div>
                                        <div className="text-sm font-extrabold text-base-content">{selectedResortSummary.pistesBreakdown.intermediate} runs</div>
                                    </div>
                                </div>
                                <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                    <span className="w-3 h-3 rounded-full bg-neutral-900 dark:bg-white shrink-0"></span>
                                    <div>
                                        <div className="text-[10px] text-base-content/60 font-semibold uppercase">Expert</div>
                                        <div className="text-sm font-extrabold text-base-content">{selectedResortSummary.pistesBreakdown.advanced} runs</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Lifts Breakdown */}
                    {selectedResortSummary && (
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/50 mb-3">Lifts Breakdown</h3>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                    <span className="text-base shrink-0">🚡</span>
                                    <div>
                                        <div className="text-[10px] text-base-content/60 font-semibold uppercase">Chair Lifts</div>
                                        <div className="text-sm font-extrabold text-base-content">{selectedResortSummary.liftsBreakdown.chair_lift}</div>
                                    </div>
                                </div>
                                <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                    <span className="text-base shrink-0">⛷️</span>
                                    <div>
                                        <div className="text-[10px] text-base-content/60 font-semibold uppercase">Drag Lifts</div>
                                        <div className="text-sm font-extrabold text-base-content">{selectedResortSummary.liftsBreakdown.drag_lift}</div>
                                    </div>
                                </div>
                                <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                    <span className="text-base shrink-0">🛹</span>
                                    <div>
                                        <div className="text-[10px] text-base-content/60 font-semibold uppercase">Magic Carpets</div>
                                        <div className="text-sm font-extrabold text-base-content">{selectedResortSummary.liftsBreakdown.magic_carpet}</div>
                                    </div>
                                </div>
                                <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                    <span className="text-base shrink-0">🪢</span>
                                    <div>
                                        <div className="text-[10px] text-base-content/60 font-semibold uppercase">Rope Tows</div>
                                        <div className="text-sm font-extrabold text-base-content">{selectedResortSummary.liftsBreakdown.rope_tow}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Official Website CTA */}
                    {selectedResortSummary?.website && (
                        <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center text-info shrink-0">
                                    <Globe className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-sm">Resort Website</h4>
                                    <p className="text-xs text-base-content/60">Visit the official page for details</p>
                                </div>
                            </div>
                            <a 
                                href={selectedResortSummary.website} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="btn btn-sm btn-ghost text-info hover:bg-info/10 gap-1"
                            >
                                Open <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        </div>
                    )}

                    {/* Sessions Log */}
                    <div className="flex flex-col flex-1 min-h-62.5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/50">Ski Sessions ({sessions.length})</h3>
                            {isLoadingSessions && <span className="loading loading-spinner loading-xs text-primary"></span>}
                        </div>

                        {sessions.length > 0 ? (
                            <div className="space-y-3">
                                {sessions.map((session) => (
                                    <button
                                        key={session.id}
                                        type="button"
                                        onClick={() => handleSessionClick(session)}
                                        className="w-full text-left p-4 rounded-xl cursor-pointer bg-base-200/40 hover:bg-base-200 border border-base-300 hover:border-primary/40 transition-all duration-200 flex justify-between items-center group shadow-sm hover:shadow"
                                    >
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-success"></span>
                                                <span className="font-semibold text-xs text-base-content">
                                                    {new Date(session.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                </span>
                                                <span className="text-[10px] text-base-content/50">
                                                    {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[11px] text-base-content/60">
                                                <User className="w-3 h-3 text-base-content/40" />
                                                <span className="font-medium text-base-content/85">
                                                    {session.user ? (session.user.display_name || `${session.user.first_name} ${session.user.last_name}`.trim() || session.user.email) : 'Usuario desconocido'}
                                                </span>
                                                <span className="text-base-content/30">•</span>
                                                {session.is_public ? (
                                                    <span className="flex items-center gap-0.5 text-[9px] text-success/80 font-semibold">
                                                        <Unlock className="w-2.5 h-2.5" /> Pública
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-0.5 text-[9px] text-warning/80 font-semibold">
                                                        <Lock className="w-2.5 h-2.5" /> Privada
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-[11px] text-base-content/75">
                                                <span className="flex items-center gap-1"><Navigation className="w-3 h-3 text-base-content/40" /> {(session.total_distance / 1000).toFixed(2)} km</span>
                                                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-base-content/40" /> {(session.max_speed * 3.6).toFixed(1)} km/h</span>
                                                <span className="px-1.5 py-0.5 rounded bg-base-300/80 text-[9px] uppercase font-bold text-base-content/70">{session.activity_type}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="badge badge-sm badge-neutral/10 text-base-content font-medium px-2 py-2">{session.runs?.length || 0} runs</span>
                                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                                <ChevronRight className="w-4 h-4" />
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : !isLoadingSessions ? (
                            <div className="flex-1 border border-dashed border-base-300 rounded-xl flex flex-col items-center justify-center p-6 text-center bg-base-200/20">
                                <Activity className="w-8 h-8 text-base-content/20 mb-2" />
                                <h4 className="font-semibold text-sm text-base-content/70">No sessions recorded</h4>
                                <p className="text-xs text-base-content/55 max-w-xs mt-1">You haven't recorded any sessions at this ski resort yet.</p>
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Footer Action Bar */}
                <div className="p-4 border-t border-base-200 bg-base-100 shrink-0 flex gap-3">
                    <button
                        type="button"
                        className="btn btn-primary flex-1 shadow-md hover:shadow-lg font-bold gap-2"
                        onClick={() => router.push(`/map?lat=${selectedResort.Latitude}&lon=${selectedResort.Longitude}&zoom=12`)}
                    >
                        <Map className="w-4 h-4" />
                        View on Map
                    </button>
                    {!isMobileView && (
                        <button 
                            type="button" 
                            className="btn btn-ghost hover:bg-base-200 text-base-content/70" 
                            onClick={() => setSelectedResortWithCache(null)}
                        >
                            Clear Selection
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-[calc(100vh-4.5rem)] lg:h-screen w-full flex-row bg-base-200 overflow-hidden font-sans lg:pl-64">
            {/* Left Column: Search & Results List */}
            <div className="flex flex-col w-full lg:w-105 bg-base-100 border-r border-base-300 shrink-0 h-full overflow-hidden shadow-sm">
                
                {/* Search Header Container */}
                <div className="p-4 border-b border-base-200 bg-base-100/80 backdrop-blur space-y-3 shrink-0">
                    <div className="flex items-center justify-between">
                        <h1 className="text-lg font-bold tracking-tight text-base-content">Ski Resorts</h1>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-base-content/40">
                            {isLoadingResorts ? (
                                <span className="loading loading-spinner loading-xs text-primary"></span>
                            ) : (
                                <Search className="w-4 h-4" />
                            )}
                        </div>
                        <input 
                            type="search" 
                            className="input input-bordered w-full pl-9 pr-4 text-sm bg-base-200/50 focus:bg-base-100 focus:border-primary/50 transition-all placeholder:text-base-content/40" 
                            placeholder="Search by name, country..." 
                            value={searchTerm} 
                            onChange={handleSearch} 
                        />
                    </div>
                </div>

                {/* List Body Container */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-base-200/30">
                    {resorts.length > 0 && (
                        <>
                            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-base-content/45">
                                Matching Resorts ({resorts.length})
                            </div>
                            <div className="space-y-2">
                                {resorts.map((resort) => {
                                    const isSelected = selectedResort?.ID === resort.ID;
                                    return (
                                        <button
                                            key={resort.ID}
                                            type="button"
                                            className={`w-full text-left rounded-xl border p-4 transition-all duration-200 cursor-pointer flex flex-col gap-2.5 relative overflow-hidden group hover:shadow-sm ${
                                                isSelected 
                                                ? "border-primary bg-primary/5 shadow-inner" 
                                                : "border-base-300/80 bg-base-100 hover:border-base-300 hover:bg-base-50"
                                            }`}
                                            onClick={() => handleResortSelect(resort)}
                                        >
                                            {/* Selection indicator line */}
                                            {isSelected && (
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
                                            )}

                                            <div className="flex items-start justify-between gap-3">
                                                <div className="space-y-0.5">
                                                    <h3 className="font-bold text-sm text-base-content tracking-tight group-hover:text-primary transition-colors">
                                                        {resort.Name}
                                                    </h3>
                                                    <div className="flex items-center gap-1 text-[11px] text-base-content/60">
                                                        <MapPin className="w-3 h-3 text-base-content/40" />
                                                        <span>{resort.Country}</span>
                                                    </div>
                                                </div>
                                                <div className="badge badge-sm badge-neutral/10 font-semibold px-2 py-2 shrink-0">
                                                    {resort.total_lifts ?? 0} Lifts
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 pt-2 border-t border-base-200/50 text-[10px] text-base-content/50">
                                                <span className="font-medium">{resort.total_pistes ?? 0} Pistes</span>
                                                <span className="w-1 h-1 rounded-full bg-base-300"></span>
                                                <span className="font-medium">{resort.distance_km?.toFixed(1) ?? "0.0"} km runs</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* Welcome / Initial State */}
                    {resorts.length === 0 && searchTerm.length <= 2 && (
                        <div className="flex flex-col items-center justify-center p-8 text-center h-70">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4 shadow-sm">
                                <Compass className="w-6 h-6 animate-pulse" />
                            </div>
                            <h3 className="font-bold text-sm text-base-content">Explore Ski Resorts</h3>
                            <p className="text-xs text-base-content/60 max-w-xs mt-1.5 leading-relaxed">
                                Enter 3 or more characters in the search bar above to look up global ski resorts and check metrics.
                            </p>
                        </div>
                    )}

                    {/* No results state */}
                    {resorts.length === 0 && searchTerm.length > 2 && !isLoadingResorts && (
                        <div className="flex flex-col items-center justify-center p-8 text-center h-70">
                            <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center text-error mb-4">
                                <X className="w-6 h-6" />
                            </div>
                            <h3 className="font-bold text-sm text-base-content">No Resorts Found</h3>
                            <p className="text-xs text-base-content/60 max-w-xs mt-1.5 leading-relaxed">
                                We couldn't find any resorts matching “{searchTerm}”. Check spelling or try another term.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Resort Dashboard (Desktop View) */}
            <div className="hidden lg:flex flex-1 h-full bg-base-200 overflow-hidden">
                {selectedResort ? (
                    <div className="w-full h-full p-6">
                        <div className="w-full h-full rounded-2xl border border-base-300 bg-base-100 shadow-sm overflow-hidden">
                            {renderDetailsContent(false)}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-base-200/50">
                        <div className="w-16 h-16 rounded-2xl bg-base-300/40 border border-base-300 flex items-center justify-center text-base-content/30 mb-4">
                            <Map className="w-8 h-8" />
                        </div>
                        <h2 className="font-bold text-base text-base-content">Resort Dashboard Console</h2>
                        <p className="text-xs text-base-content/50 max-w-sm mt-1.5 leading-relaxed">
                            Select a ski resort from the side list to open its statistics details, active sessions logs, and maps navigation panel.
                        </p>
                    </div>
                )}
            </div>

            {/* Floating Bottom Sheet (Mobile View Overlay) */}
            {selectedResort && (
                <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm">
                    {/* Backdrop Click Dismiss */}
                    <div className="absolute inset-0 -z-10" onClick={() => setSelectedResortWithCache(null)}></div>
                    
                    <div className="w-full bg-base-100 rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
                        {/* Drag Handle Indicator */}
                        <div className="w-12 h-1 bg-base-300 rounded-full mx-auto my-3 shrink-0"></div>
                        <div className="flex-1 overflow-hidden">
                            {renderDetailsContent(true)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}