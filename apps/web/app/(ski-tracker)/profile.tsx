import * as ImagePicker from 'expo-image-picker';
import { Camera, Check, Pencil, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

import { API_BASE_URL } from "constants/constants";
import { useAuth } from "context/auth.context";
import api from "interceptor/api";
import type { User } from "models/user.model";

export type ProfileFormValues = {
    first_name: string;
    last_name: string;
    display_name: string;
    email: string;
    avatar_url: string | null;
};

export default function ProfileView() {
    const { token, signOut } = useAuth();
    const [user, setUser] = useState<User | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    const {
        control,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors },
    } = useForm<ProfileFormValues>({
        defaultValues: {
            first_name: '',
            last_name: '',
            display_name: '',
            email: '',
            avatar_url: null,
        },
    });

    const avatarUrl = watch('avatar_url');
    const firstName = watch('first_name');

    useEffect(() => {
        if (user) {
            reset({
                first_name: user.first_name || '',
                last_name: user.last_name || '',
                display_name: user.display_name || '',
                email: user.email || '',
                avatar_url: user.avatar_url || null,
            });
        }
    }, [user, reset]);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await api.get<User>(`${API_BASE_URL}/users/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (response.status !== 200) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                setUser(response.data);
            } catch (error) {
                console.error("Error fetching profile:", error);
            }
        };

        if (token) {
            fetchProfile();
        }
    }, [token]);

    const updateActivityType = async (type: "snow" | "ski") => {
        if (user) {
            try {
                const request = await api.put<User>(`${API_BASE_URL}/users/${user.id}`, {
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

    const handlePickImage = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert('Permission denied', 'We need access to the gallery to change your photo.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
            base64: true
        });

        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const mimeType = asset.mimeType || 'image/jpeg';
            const base64Data = `data:${mimeType};base64,${asset.base64}`;

            setValue('avatar_url', base64Data, { shouldDirty: true });
        }
    };

    const onSubmit = async (data: ProfileFormValues) => {
        try {
            setSaving(true);
            const response = await api.put<User>(`${API_BASE_URL}/users/${user?.id}`, { ...data, id: user?.id, avatar_url: avatarUrl, activity_type: user?.activity_type })

            if (response.status !== 200) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            setUser(response.data);
            setIsEditing(false);
            Alert.alert('Success', 'Profile updated successfully');
        } catch (error) {
            Alert.alert('Error', 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        reset();
        setIsEditing(false);
    };

    const handleLogout = async () => {
        await signOut();
    };

    return (
        <ScrollView
            contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'center',
            }}
            className="bg-slate-900 p-6"
        >
            <View className="w-full max-w-md space-y-6 gap-4">
                <View className="bg-slate-800 rounded-md p-6 shadow-xl border border-slate-700 items-center relative">
                    <TouchableOpacity
                        onPress={() => (isEditing ? handleCancel() : setIsEditing(true))}
                        className="absolute top-4 right-4 bg-slate-700 p-2 rounded-full border border-slate-600"
                    >
                        {isEditing ? <X size={16} color="#94a3b8" /> : <Pencil size={16} color="#60a5fa" />}
                    </TouchableOpacity>

                    <View className="relative mb-4">
                        <View className="w-24 h-24 rounded-full bg-slate-700 items-center justify-center border-2 border-blue-500 overflow-hidden">
                            {avatarUrl ? (
                                <Image
                                    source={{ uri: avatarUrl }}
                                    className="w-full h-full"
                                    resizeMode="cover"
                                />
                            ) : (
                                <Text className="text-4xl font-bold text-white">
                                    {firstName ? firstName[0].toUpperCase() : '⛷️'}
                                </Text>
                            )}
                        </View>

                        {isEditing && (
                            <TouchableOpacity
                                onPress={handlePickImage}
                                className="absolute bottom-0 right-0 bg-blue-600 p-2 rounded-full border-2 border-slate-800 shadow-md"
                            >
                                <Camera size={14} color="#ffffff" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {!isEditing ? (
                        user ? (
                            <View className="items-center">
                                <Text className="text-xl font-bold text-white mb-1">
                                    {user.display_name || `${user.first_name} ${user.last_name}`}
                                </Text>
                                <Text className="text-sm text-slate-400">{user.email}</Text>
                            </View>
                        ) : (
                            <ActivityIndicator color="#3b82f6" className="my-2" />
                        )
                    ) : (
                        <View className="w-full space-y-3 mt-2">
                            <View className="flex-row gap-2">
                                <View className="flex-1">
                                    <Text className="text-[10px] font-bold text-slate-400 uppercase mb-1">First Name</Text>
                                    <Controller
                                        control={control}
                                        name="first_name"
                                        rules={{ required: 'First name is required' }}
                                        render={({ field: { onChange, onBlur, value } }) => (
                                            <TextInput
                                                onBlur={onBlur}
                                                onChangeText={onChange}
                                                value={value}
                                                placeholder="Name"
                                                placeholderTextColor="#64748b"
                                                className={`bg-slate-700 border text-white p-2.5 rounded-md text-sm ${errors.first_name ? 'border-rose-500' : 'border-slate-600'
                                                    }`}
                                            />
                                        )}
                                    />
                                    {errors.first_name && (
                                        <Text className="text-rose-400 text-[10px] mt-1">{errors.first_name.message}</Text>
                                    )}
                                </View>

                                <View className="flex-1">
                                    <Text className="text-[10px] font-bold text-slate-400 uppercase mb-1">Last Name</Text>
                                    <Controller
                                        control={control}
                                        name="last_name"
                                        render={({ field: { onChange, onBlur, value } }) => (
                                            <TextInput
                                                onBlur={onBlur}
                                                onChangeText={onChange}
                                                value={value}
                                                placeholder="Last Name"
                                                placeholderTextColor="#64748b"
                                                className="bg-slate-700 border border-slate-600 text-white p-2.5 rounded-md text-sm"
                                            />
                                        )}
                                    />
                                </View>
                            </View>

                            <View>
                                <Text className="text-[10px] font-bold text-slate-400 uppercase mb-1">Display Name</Text>
                                <Controller
                                    control={control}
                                    name="display_name"
                                    render={({ field: { onChange, onBlur, value } }) => (
                                        <TextInput
                                            onBlur={onBlur}
                                            onChangeText={onChange}
                                            value={value}
                                            placeholder="SkierMaster99"
                                            placeholderTextColor="#64748b"
                                            className="bg-slate-700 border border-slate-600 text-white p-2.5 rounded-md text-sm"
                                        />
                                    )}
                                />
                            </View>

                            <View>
                                <Text className="text-[10px] font-bold text-slate-400 uppercase mb-1">Email</Text>
                                <Controller
                                    control={control}
                                    name="email"
                                    rules={{
                                        required: 'Email is required',
                                        pattern: {
                                            value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                                            message: 'Email not valid',
                                        },
                                    }}
                                    render={({ field: { onChange, onBlur, value } }) => (
                                        <TextInput
                                            onBlur={onBlur}
                                            onChangeText={onChange}
                                            value={value}
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            placeholder="email@email.com"
                                            placeholderTextColor="#64748b"
                                            className={`bg-slate-700 border text-white p-2.5 rounded-md text-sm ${errors.email ? 'border-rose-500' : 'border-slate-600'
                                                }`}
                                        />
                                    )}
                                />
                                {errors.email && (
                                    <Text className="text-rose-400 text-[10px] mt-1">{errors.email.message}</Text>
                                )}
                            </View>

                            <View className="flex-row gap-2 mt-4 pt-2 border-t border-slate-700">
                                <TouchableOpacity
                                    onPress={handleCancel}
                                    disabled={saving}
                                    className="flex-1 bg-slate-700 p-3 rounded-md items-center justify-center border border-slate-600"
                                >
                                    <Text className="text-slate-300 font-bold text-xs">Cancel</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={handleSubmit(onSubmit)}
                                    disabled={saving}
                                    className="flex-1 bg-blue-600 p-3 rounded-md items-center justify-center flex-row gap-1 shadow-md"
                                >
                                    {saving ? (
                                        <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                        <>
                                            <Check size={14} color="#ffffff" />
                                            <Text className="text-white font-bold text-xs">Save</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>

                <View className="bg-slate-800 rounded-md p-6 shadow-xl border border-slate-700">
                    <Text className="text-base font-semibold text-white mb-4">Snow modality</Text>
                    <View className="flex-row gap-3">
                        <TouchableOpacity
                            className={`flex-1 p-4 rounded-md items-center border ${user?.activity_type === 'ski'
                                ? 'bg-blue-600 border-blue-500'
                                : 'bg-slate-700 border-slate-600'
                                }`}
                            onPress={() => updateActivityType('ski')}
                        >
                            <Text className="text-white font-bold text-base">🎿 Ski</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className={`flex-1 p-4 rounded-md items-center border ${user?.activity_type === 'snow'
                                ? 'bg-blue-600 border-blue-500'
                                : 'bg-slate-700 border-slate-600'
                                }`}
                            onPress={() => updateActivityType('snow')}
                        >
                            <Text className="text-white font-bold text-base">🏂 Snowboard</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity
                    className="bg-red-600 rounded-md p-4 shadow-xl items-center justify-center"
                    onPress={handleLogout}
                >
                    <Text className="text-white font-bold text-base">Logout</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}