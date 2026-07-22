import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";

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
        // If the current search term already matches what we last fetched, skip calling API
        if (searchTerm === lastFetchedSearchTerm) {
            return;
        }

        if (searchTerm.trim().length <= 2) {
            setResortsWithCache([]);
            lastFetchedSearchTerm = "";
            return;
        }

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
        }
    }

    const handleSessionClick = (session: any) => {
        if (!selectedResort) return;
        router.push(`/?sessionId=${session.id}&lat=${selectedResort.Latitude}&lng=${selectedResort.Longitude}&zoom=14`);
    }

    const selectedResortSummary = useMemo(() => {
        if (!selectedResort) return null;

        return {
            lifts: selectedResort.total_lifts ?? 0,
            pistes: selectedResort.total_pistes ?? 0,
            distance: selectedResort.distance_km ?? 0,
            country: selectedResort.Country || "Unknown",
            website: selectedResort.Website || null,
        };
    }, [selectedResort]);

    return (
        <div className="flex h-[calc(100vh-20rem)] flex-col gap-4 p-2 pb-24">
            <label className="input input-bordered flex w-full min-h-10 items-center gap-2">
                <svg className="h-[1em] w-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <g strokeLinejoin="round" strokeLinecap="round" strokeWidth="2.5" fill="none" stroke="currentColor">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.3-4.3"></path>
                    </g>
                </svg>
                <input type="search" className="grow" placeholder="Search resorts" value={searchTerm} onChange={handleSearch} />
            </label>

            {resorts.length > 0 && (
                <div className="flex flex-col gap-3 flex-1 max-h-[calc(100vh-4rem)]">
                    <div className="px-1 text-xs uppercase tracking-[0.2em] opacity-60">
                        Resorts matching “{searchTerm}”
                    </div>
                    <div className="grid flex-1 gap-3 overflow-y-auto pr-1 h-[calc(100vh-4rem)]">
                        {resorts.map((resort) => (
                            <button
                                key={resort.ID}
                                type="button"
                                className="card border border-base-300 bg-base-100 shadow-sm transition cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
                                onClick={() => handleResortSelect(resort)}
                            >
                                <div className="card-body p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex gap-1">
                                            <h3 className="card-title text-base">{resort.Name}</h3>
                                            <span className="badge badge-soft badge-info">{resort.Country}</span>
                                        </div>
                                        <div className="badge badge-primary badge-soft">{resort.total_lifts ?? 0} lifts</div>
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-2 text-xs opacity-70">
                                        <span className="badge badge-ghost">{resort.total_pistes ?? 0} pistes</span>
                                        <span className="badge badge-ghost">{resort.distance_km?.toFixed(2) ?? "0.00"} km</span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {resorts.length === 0 && searchTerm.length > 2 && (
                <div className="text-center text-sm opacity-60">No resorts found for “{searchTerm}”</div>
            )}

            {resorts.length === 0 && searchTerm.length <= 2 && (
                <div className="text-center text-sm opacity-60">Type at least 3 characters to search for resorts.</div>
            )}

            {selectedResort && (
                <div className="fixed inset-x-0 bottom-16 z-50 flex justify-center px-2 pb-2 w-full">
                    <div className="w-full rounded-2xl border border-info bg-base-100 max-h-[70vh] flex flex-col shadow-xl">
                        <div className="flex items-center justify-between border-b border-base-300 px-4 py-3 shrink-0">
                            <div>
                                <h4 className="font-semibold">{selectedResort.Name}</h4>
                                <p className="text-sm opacity-70">{selectedResort.Country}</p>
                            </div>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelectedResortWithCache(null)}>
                                Close
                            </button>
                        </div>

                        <div className="overflow-y-auto p-4 space-y-4 flex-1">
                            <div className="grid gap-2 grid-cols-3">
                                <div className="rounded-box bg-base-200 p-3">
                                    <div className="text-xs uppercase opacity-60">Lifts</div>
                                    <div className="mt-1 text-lg font-semibold">{selectedResortSummary?.lifts ?? 0}</div>
                                </div>
                                <div className="rounded-box bg-base-200 p-3">
                                    <div className="text-xs uppercase opacity-60">Pistes</div>
                                    <div className="mt-1 text-lg font-semibold">{selectedResortSummary?.pistes ?? 0}</div>
                                </div>
                                <div className="rounded-box bg-base-200 p-3">
                                    <div className="text-xs uppercase opacity-60">Distance</div>
                                    <div className="mt-1 text-lg font-semibold">{selectedResortSummary?.distance.toFixed(2) ?? "0.00"} km</div>
                                </div>
                            </div>

                            {selectedResortSummary?.website ? (
                                <a href={selectedResortSummary.website} target="_blank" rel="noreferrer" className="link link-primary inline-block">
                                    Open official website
                                </a>
                            ) : null}

                            {/* Sessions section */}
                            <div>
                                <h5 className="font-semibold text-sm mb-2 opacity-80">Ski Sessions ({sessions.length})</h5>
                                {sessions.length > 0 ? (
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {sessions.map((session) => (
                                            <button
                                                key={session.id}
                                                type="button"
                                                onClick={() => handleSessionClick(session)}
                                                className="w-full text-left p-3 rounded-lg bg-base-200 hover:bg-base-300 transition flex justify-between items-center border border-base-300"
                                            >
                                                <div>
                                                    <div className="font-medium text-xs text-base-content">
                                                        Session: {new Date(session.start_time).toLocaleDateString()} {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                    <div className="text-[10px] text-base-content/75 mt-0.5">
                                                        Dist: {(session.total_distance / 1000).toFixed(2)} km | Max Speed: {(session.max_speed * 3.6).toFixed(1)} km/h
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="badge badge-sm badge-info badge-soft">{session.runs?.length || 0} runs</span>
                                                    <span className="text-xs text-primary font-semibold">View map</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-xs opacity-60 italic text-center py-2">No recorded sessions for this resort.</div>
                                )}
                            </div>

                            <div className="flex gap-2 pt-2 border-t border-base-200 shrink-0">
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm flex-1"
                                    onClick={() => router.push(`/map?lat=${selectedResort.Latitude}&lon=${selectedResort.Longitude}&zoom=12`)}
                                >
                                    View on map
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedResortWithCache(null)}>
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}