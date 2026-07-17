import { API_BASE_URL } from "constants/constants";
import { useRouter } from "expo-router";
import { Resort } from "models/ski-resort.model";
import { useState } from "react";

export default function ResortsView() {
    const router = useRouter();

    const [resorts, setResorts] = useState<Resort[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    const handleSearch = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const term = event.target.value;
        setSearchTerm(term);

        if (term.length > 2) {
            try {
                const response = await fetch(`${API_BASE_URL}/resorts/by-name?name=${encodeURIComponent(term)}`);
                if (response.ok) {
                    const data = await response.json();
                    setResorts(data);
                } else {
                    console.error("Error fetching resorts:", response.statusText);
                }
            } catch (error) {
                console.error("Error fetching resorts:", error);
            }
        } else {
            setResorts([]);
        }
    };

    return (
        <div className="flex flex-col gap-4 p-2">
            {/* SEARCH INPUT */}
            <label className="input w-full">
                <svg className="h-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <g
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeWidth="2.5"
                        fill="none"
                        stroke="currentColor"
                    >
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.3-4.3"></path>
                    </g>
                </svg>
                <input type="search" className="grow" placeholder="Search" value={searchTerm} onChange={handleSearch} />
            </label>

            {/* RESORT LIST */}
            {resorts.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="p-4 pb-2 text-xs opacity-60 tracking-wide">Resorts matching "{searchTerm}"</div>
                    <ul className="list bg-base-100 rounded-box shadow-md overflow-auto max-h-[62vh]">
                        {resorts.map((resort) => (
                            <li key={resort.ID} className="list-row">
                                <div className="flex flex-col gap-2">
                                    <div className="font-semibold">{resort.Name}</div>
                                    <div className="text-xs opacity-60">{resort.total_lifts} lifts, {resort.total_pistes} pistes</div>
                                    <div className="text-xs opacity-60">{resort.distance_km?.toFixed(2)} km</div>
                                </div>
                                <div className="text-xs uppercase font-semibold opacity-60 badge badge-soft badge-primary">{resort.Country}</div>
                                <div className="flex flex-col gap-2">
                                <a href={resort.Website} className="text-xs opacity-60 link link-primary">{resort.Website}</a>
                                <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => router.push(`/?lat=${resort.Latitude}&lng=${resort.Longitude}&zoom=13`)}
                                >
                                    View on map
                                </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {resorts.length === 0 && searchTerm.length > 2 && (
                <div className="text-center text-sm opacity-60">No resorts found for "{searchTerm}"</div>
            )}

            {resorts.length === 0 && searchTerm.length <= 2 && (
                <div className="text-center text-sm opacity-60">Type at least 3 characters to search for resorts.</div>
            )}
        </div>
    )
}