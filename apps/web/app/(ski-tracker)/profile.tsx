import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from 'expo-secure-store';
import axios from "axios";

import { API_BASE_URL } from "constants/constants";
import type { User } from "models/user.model";
import { useAuth } from "context/auth.context";

const themes: { [key: string]: string } = {
    "light": "Default",
    "dark": "Dark",
    "winter": "Winter",
    "forest": "Forest",
    "dracula": "Dracula",
    "cyberpunk": "Cyberpunk",
    "synthwave": "Synthwave",
    "valentine": "Valentine",
    "night": "Night",
    "retro": "Retro",
    "halloween": "Halloween",
    "garden": "Garden",
    "business": "Business",
    "acid": "Acid",
    "lemonade": "Lemonade",
    "coffee": "Coffee",
    "cupcake": "Cupcake"
};

export default function ProfileView() {
    const [user, setUser] = useState<User | null>(null);
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('theme');
        return saved ? JSON.parse(saved) : "winter";
    });
    const { token } = useAuth();

    useEffect(() => {
        localStorage.setItem('theme', JSON.stringify(theme));
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const updateActivityType = async (type: "snow" | "ski") => {
        if (user) {
            try {
                const request = await axios.put<User>(`${API_BASE_URL}/users/${user.id}`, {
                    ...user,
                    activity_type: type,
                }, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (request.status === 200) {
                    setUser({...user!, activity_type: type});
                }
            } catch (error) {
                console.error("Error updating activity type:", error);
            }
        }
    };

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/users/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                setUser(data);
            } catch (error) {
                console.error("Error fetching profile:", error);
            }
        };

        fetchProfile();
    }, []);

    const handleLogout = async () => {
        if (Platform.OS === 'web') {
            localStorage.removeItem('jwt_key');
        } else {
            await SecureStore.deleteItemAsync('jwt_key');
        }
        window.location.reload();
    };

    return (
        <div className="hero bg-base-200 max-h-[calc(100vh-4rem)] py-8">
            <div className="hero-content flex-col w-full max-w-md gap-6">
                {/* USER INFORMATION CARD */}
                <div className="card bg-base-100 w-full shadow-xl">
                    <div className="card-body items-center text-center">
                        <div className="avatar placeholder mb-2">
                            <div className="flex items-center justify-center bg-neutral text-neutral-content w-20 rounded-full text-2xl font-bold">
                                {user?.first_name ? user.first_name[0].toUpperCase() : "⛷️"}
                            </div>
                        </div>
                        {user ? (
                            <>
                                <h2 className="card-title text-xl font-bold">{user.display_name || `${user.first_name} ${user.last_name}`}</h2>
                                <p className="text-sm opacity-70">{user.email}</p>
                            </>
                        ) : (
                            <div className="flex flex-col gap-2 w-full animate-pulse">
                                <div className="h-4 bg-base-300 rounded w-3/4 mx-auto"></div>
                                <div className="h-3 bg-base-300 rounded w-1/2 mx-auto"></div>
                            </div>
                        )}
                    </div>
                </div>

                {/* SNOW SPORT SELECTOR */}
                <div className="card bg-base-100 w-full shadow-xl">
                    <div className="card-body">
                        <h3 className="card-title text-base font-semibold mb-2">Snow modality</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                className={`btn ${user?.activity_type === 'ski' ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => { updateActivityType("ski"); }}
                            >
                                🎿 Ski
                            </button>
                            <button 
                                className={`btn ${user?.activity_type === 'snow' ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => { updateActivityType("snow"); }}
                            >
                                🏂 Snowboard
                            </button>
                        </div>
                    </div>
                </div>

                {/* THEME SELECTOR */}
                <div className="card bg-base-100 w-full shadow-xl">
                    <div className="card-body flex-row items-center justify-between py-4">
                        <div>
                            <h3 className="font-semibold">Appearance</h3>
                            <p className="text-xs opacity-60">Actual theme: <span className="font-bold">{themes[theme]}</span></p>
                        </div>
                        <div className="dropdown dropdown-end">
                            <div tabIndex={0} role="button" className="btn btn-sm m-1">
                                Change theme
                                <svg width="10px" height="10px" className="inline-block h-2 w-2 fill-current opacity-60 ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048">
                                    <path d="M1799 349l242 241-1017 1017L7 590l242-241 775 775 775-775z"></path>
                                </svg>
                            </div>
                            <ul tabIndex={0} className="dropdown-content bg-base-300 rounded-box z-50 w-52 h-48 overflow-y-auto p-2 shadow-2xl">
                                {Object.entries(themes).map(([key, value]) => (
                                    <li key={key} className="my-1">
                                        <button 
                                            className={`btn btn-sm btn-block justify-start ${theme === key ? 'btn-active btn-primary' : 'btn-ghost'}`}
                                            onClick={() => setTheme(key)}
                                        >
                                            {value}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* LOGOUT BUTTON */}
                <div className="card bg-error text-error-content w-full shadow-md cursor-pointer hover:opacity-90 transition-opacity" onClick={handleLogout}>
                    <div className="card-body py-4 flex-row justify-center items-center font-semibold gap-2">
                        <span>Logout</span>
                    </div>
                </div>
            </div>
        </div>
    );
}