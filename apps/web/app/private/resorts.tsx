import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import axios from "axios";

import { API_BASE_URL } from "constants/constants";
import { Resort } from "models/ski-resort.model";
import { useAuth } from "context/auth.context";

export default function ResortsView() {
    const router = useRouter();

    const [resorts, setResorts] = useState<Resort[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedResort, setSelectedResort] = useState<Resort | null>(null);
    const { token } = useAuth();

    const handleSearch = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const term = event.target.value;
        setSearchTerm(term);
        setSelectedResort(null);

        if (term.trim().length <= 2) {
            setResorts([]);
            return;
        }

        try {
            const response = await axios.get(`${API_BASE_URL}/resorts/by-name`, {
                params: { name: term },
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.status === 200) {
                setResorts(response.data);
            } else {
                console.error("Error fetching resorts:", response.statusText);
            }
        } catch (error) {
            console.error("Error fetching resorts:", error);
            setResorts([]);
        }
    };

    const handleResortSelect = async (resort: Resort) => {
        setSelectedResort(resort);

        const request = await axios.get(`${API_BASE_URL}/ski-sessions`, {
            params: { resort_id: resort.ID },
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
        });

        if (request.status === 200) {
            const sessions = request.data;
            console.log("Ski sessions for resort:", resort.Name, sessions);
        }
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
            <label className="input input-bordered flex w-full min-h-14 items-center gap-2">
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
                                className="card border border-base-300 bg-base-100 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                                onClick={() => handleResortSelect(resort)}
                            >
                                <div className="card-body p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="card-title text-base">{resort.Name}</h3>
                                            <p className="text-sm opacity-70">{resort.Country}</p>
                                        </div>
                                        <div className="badge badge-primary badge-soft">{resort.total_lifts ?? 0} lifts</div>
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-2 text-xs opacity-70">
                                        <span className="badge badge-ghost">{resort.total_pistes ?? 0} pistes</span>
                                        <span className="badge badge-ghost">{resort.distance_km?.toFixed(2) ?? "0.00"} km</span>
                                    </div>

                                    {resort.Website ? (
                                        <a
                                            href={resort.Website}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-2 text-sm link link-primary"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            Visit website
                                        </a>
                                    ) : null}
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
                <div className="fixed inset-x-0 bottom-16 z-50 flex justify-center px-2 pb-2 w-full h-6/12">
                    <div className="w-full rounded-t-2xl border border-base-300 bg-base-100 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
                            <div>
                                <h4 className="font-semibold">{selectedResort.Name}</h4>
                                <p className="text-sm opacity-70">{selectedResort.Country}</p>
                            </div>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelectedResort(null)}>
                                Close
                            </button>
                        </div>

                        <div className="space-y-3 p-4 text-sm">
                            <div className="grid gap-2 sm:grid-cols-3">
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
                                <a href={selectedResortSummary.website} target="_blank" rel="noreferrer" className="link link-primary">
                                    Open official website
                                </a>
                            ) : null}

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => router.push(`/private?minLat=${selectedResort.Latitude}&maxLat=${selectedResort.Latitude}&minLon=${selectedResort.Longitude}&maxLon=${selectedResort.Longitude}&lat=${selectedResort.Latitude}&lng=${selectedResort.Longitude}&zoom=13`)}
                                >
                                    View on map
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedResort(null)}>
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