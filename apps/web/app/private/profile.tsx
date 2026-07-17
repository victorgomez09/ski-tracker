import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL } from "constants/constants";
import type { User } from "models/user.model";

export default function ProfileView() {
    const [user, setUser] = useState<User | null>(null);

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