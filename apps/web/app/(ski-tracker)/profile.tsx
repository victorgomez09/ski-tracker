import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Modal } from "react-native";
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
    const [theme, setTheme] = useState<string>("winter");
    const [themeModalVisible, setThemeModalVisible] = useState(false);
    const { token, signOut } = useAuth();

    useEffect(() => {
        const loadTheme = async () => {
            if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
                const saved = localStorage.getItem('theme');
                if (saved) {
                    try { setTheme(JSON.parse(saved)); } catch {}
                }
            } else {
                const saved = await SecureStore.getItemAsync('theme');
                if (saved) setTheme(saved);
            }
        };
        loadTheme();
    }, []);

    useEffect(() => {
        const saveTheme = async () => {
            if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
                localStorage.setItem('theme', JSON.stringify(theme));
                if (typeof document !== 'undefined') {
                    document.documentElement.setAttribute('data-theme', theme);
                }
            } else {
                await SecureStore.setItemAsync('theme', theme);
            }
        };
        saveTheme();
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
                    setUser({ ...user, activity_type: type });
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

        if (token) {
            fetchProfile();
        }
    }, [token]);

    const handleLogout = async () => {
        await signOut();
    };

    return (
        <ScrollView contentContainerStyle={{ 
                    flexGrow: 1, 
                    justifyContent: 'center', 
                    alignItems: 'center' 
                }} 
                className="bg-slate-900 p-6">
            <View className="w-full max-w-md space-y-6">
                {/* USER INFORMATION CARD */}
                <View className="bg-slate-800 rounded-3xl p-6 shadow-xl border border-slate-700 items-center">
                    <View className="w-20 h-20 rounded-full bg-slate-700 items-center justify-center mb-3 border-2 border-blue-500">
                        <Text className="text-3xl font-bold text-white">
                            {user?.first_name ? user.first_name[0].toUpperCase() : "⛷️"}
                        </Text>
                    </View>
                    {user ? (
                        <>
                            <Text className="text-xl font-bold text-white mb-1">
                                {user.display_name || `${user.first_name} ${user.last_name}`}
                            </Text>
                            <Text className="text-sm text-slate-400">{user.email}</Text>
                        </>
                    ) : (
                        <ActivityIndicator color="#3b82f6" className="my-2" />
                    )}
                </View>

                {/* SNOW SPORT SELECTOR */}
                <View className="bg-slate-800 rounded-3xl p-6 shadow-xl border border-slate-700">
                    <Text className="text-base font-semibold text-white mb-4">Snow modality</Text>
                    <View className="flex-row gap-3">
                        <TouchableOpacity
                            className={`flex-1 p-4 rounded-2xl items-center border ${
                                user?.activity_type === 'ski'
                                    ? 'bg-blue-600 border-blue-500'
                                    : 'bg-slate-700 border-slate-600'
                            }`}
                            onPress={() => updateActivityType("ski")}
                        >
                            <Text className="text-white font-bold text-base">🎿 Ski</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className={`flex-1 p-4 rounded-2xl items-center border ${
                                user?.activity_type === 'snow'
                                    ? 'bg-blue-600 border-blue-500'
                                    : 'bg-slate-700 border-slate-600'
                            }`}
                            onPress={() => updateActivityType("snow")}
                        >
                            <Text className="text-white font-bold text-base">🏂 Snowboard</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* LOGOUT BUTTON */}
                <TouchableOpacity
                    className="bg-red-600 rounded-3xl p-4 shadow-xl items-center justify-center"
                    onPress={handleLogout}
                >
                    <Text className="text-white font-bold text-base">Logout</Text>
                </TouchableOpacity>
            </View>

            {/* THEME SELECTION MODAL */}
            <Modal
                visible={themeModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setThemeModalVisible(false)}
            >
                <TouchableOpacity
                    className="flex-1 bg-black/70 justify-center items-center p-6"
                    activeOpacity={1}
                    onPress={() => setThemeModalVisible(false)}
                >
                    <View className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-sm max-h-[70vh]">
                        <Text className="text-lg font-bold text-white mb-4">Select Theme</Text>
                        <ScrollView className="space-y-2">
                            {Object.entries(themes).map(([key, value]) => (
                                <TouchableOpacity
                                    key={key}
                                    className={`p-3 rounded-xl mb-2 ${
                                        theme === key ? 'bg-blue-600' : 'bg-slate-700'
                                    }`}
                                    onPress={() => {
                                        setTheme(key);
                                        setThemeModalVisible(false);
                                    }}
                                >
                                    <Text className="text-white font-semibold text-sm">{value}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>
        </ScrollView>
    );
}