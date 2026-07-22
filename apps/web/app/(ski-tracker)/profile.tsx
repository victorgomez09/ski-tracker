import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL } from "constants/constants";
import type { User } from "models/user.model";

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
    const [theme, setTheme] = useState(
        JSON.parse(localStorage.getItem('theme') || '{}') || "winter"
    );

    useEffect(() => {
        localStorage.setItem('theme', JSON.stringify(theme));
    }, [theme]);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const token = localStorage.getItem('jwt_key');
                if (!token) {
                    console.error("No JWT token found in localStorage");
                    return;
                }

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

    return (
        <div className="hero bg-base-200 min-h-screen">
            <div className="hero-content flex-col">
                <div className="card bg-base-100 w-80 shrink-0 shadow-md">
                    <div className="card-body">
                        <div className="flex items-center gap-2">
                            <div className="dropdown">
                                <div tabIndex={0} role="button" className="btn m-1">
                                    Change!
                                    <svg
                                        width="12px"
                                        height="12px"
                                        className="inline-block h-2 w-2 fill-current opacity-60"
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 2048 2048">
                                        <path d="M1799 349l242 241-1017 1017L7 590l242-241 775 775 775-775z"></path>
                                    </svg>
                                </div>
                                <ul tabIndex={-1} className="dropdown-content bg-base-300 rounded-box z-1 w-52 h-32 overflow-y-auto p-2 shadow-2xl">
                                    {Object.entries(themes).map(([key, value]) => (
                                        <li key={key}>
                                            <input
                                                type="radio"
                                                name="theme-dropdown"
                                                className="theme-controller w-full btn btn-sm btn-block btn-ghost justify-start"
                                                aria-label={value}
                                                value={key}
                                                onClick={() => setTheme(key)} />
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <p>Current theme: <span className="ml-2">{themes[theme]}</span></p>
                        </div>
                    </div>
                </div>

                <div className="card bg-base-100 w-80 shrink-0 shadow-md">
                    <div className="card-body">
                        <h1 className="card-title">Profile</h1>
                        {user ? (
                            <div>
                                <p>Display Name: {user.display_name}</p>
                                <p>Email: {user.email}</p>
                                <p>First Name: {user.first_name}</p>
                                <p>Last Name: {user.last_name}</p>
                            </div>
                        ) : (
                            <p>Loading profile...</p>
                        )}
                    </div>
                </div>

                <div className="card bg-error/20 w-80 shrink-0 shadow-md cursor-pointer hover:boder-2 hover:border-error" onClick={async () => {
                    Platform.OS === 'web' ? localStorage.removeItem('jwt_key') : await SecureStore.deleteItemAsync('jwt_key');
                    window.location.reload();
                }}>
                    <div className="card-body font-semibold">
                        <p>Logout</p>
                    </div>
                </div>
            </div>
        </div>
    );
}