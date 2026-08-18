import * as ImagePicker from 'expo-image-picker';
import { Camera, Check, Pencil, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import RNPickerSelect from 'react-native-picker-select';
import { useTranslation } from "react-i18next";

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
    time_tracking: number;
};

export default function ProfileView() {
    const { t } = useTranslation();
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
            time_tracking: 5000,
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
                time_tracking: user.time_tracking || 5000,
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
            Alert.alert(t('permission_denied'), t('permission_denied_gallery'));
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
            Alert.alert(t('success'), t('profile_updated'));
        } catch (error) {
            Alert.alert(t('error'), t('failed_save_changes'));
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
        <SafeAreaView
            edges={['top']}
            style={{ flex: 1, backgroundColor: 'transparent' }}
        >
            <ScrollView
                contentContainerStyle={{
                    flexGrow: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
                className="bg-slate-900 p-6"
            >
                <View className="w-full max-w-md space-y-6 gap-4">
                    <View className="bg-slate-800 rounded-md p-6 shadow-md border border-slate-700 items-center relative">
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
                                        <Text className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('first_name')}</Text>
                                        <Controller
                                            control={control}
                                            name="first_name"
                                            rules={{ required: t('first_name_required') as string }}
                                            render={({ field: { onChange, onBlur, value } }) => (
                                                <TextInput
                                                    onBlur={onBlur}
                                                    onChangeText={onChange}
                                                    value={value}
                                                    placeholder={t('first_name') as string}
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
                                        <Text className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('last_name')}</Text>
                                        <Controller
                                            control={control}
                                            name="last_name"
                                            render={({ field: { onChange, onBlur, value } }) => (
                                                <TextInput
                                                    onBlur={onBlur}
                                                    onChangeText={onChange}
                                                    value={value}
                                                    placeholder={t('last_name') as string}
                                                    placeholderTextColor="#64748b"
                                                    className="bg-slate-700 border border-slate-600 text-white p-2.5 rounded-md text-sm"
                                                />
                                            )}
                                        />
                                    </View>
                                </View>

                                <View>
                                    <Text className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('display_name')}</Text>
                                    <Controller
                                        control={control}
                                        name="display_name"
                                        render={({ field: { onChange, onBlur, value } }) => (
                                            <TextInput
                                                onBlur={onBlur}
                                                onChangeText={onChange}
                                                value={value}
                                                placeholder={t('skier_master_placeholder') as string}
                                                placeholderTextColor="#64748b"
                                                className="bg-slate-700 border border-slate-600 text-white p-2.5 rounded-md text-sm"
                                            />
                                        )}
                                    />
                                </View>

                                <View>
                                    <Text className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('email')}</Text>
                                    <Controller
                                        control={control}
                                        name="email"
                                        rules={{
                                            required: t('email_required') as string,
                                            pattern: {
                                                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                                                message: t('email_not_valid') as string,
                                            },
                                        }}
                                        render={({ field: { onChange, onBlur, value } }) => (
                                            <TextInput
                                                onBlur={onBlur}
                                                onChangeText={onChange}
                                                value={value}
                                                keyboardType="email-address"
                                                autoCapitalize="none"
                                                placeholder={t('email_placeholder') as string}
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

                                <View>
                                    <Text className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('time_tracking')}</Text>
                                    <Controller
                                        control={control}
                                        name="time_tracking"
                                        rules={{
                                            required: t('time_tracking_required') as string,
                                            pattern: {
                                                value: /^[0-9]+$/,
                                                message: t('time_tracking_number') as string,
                                            },
                                        }}
                                        render={({ field: { onChange, value } }) => (
                                            <RNPickerSelect
                                            onValueChange={onChange}
                                            items={[
                                                { label: t('each_5_seconds'), value: 5000 },
                                                { label: t('each_3_seconds'), value: 3000 },
                                                { label: t('each_1_second'), value: 1000 },
                                            ]}
                                            value={value}
                                        />
                                        )}
                                    />
                                    <Text className="text-slate-400 text-[10px] mt-1">{t('time_tracking_desc')}</Text>
                                    {errors.time_tracking && (
                                        <Text className="text-rose-400 text-[10px] mt-1">{errors.time_tracking.message}</Text>
                                    )}
                                </View>

                                <View className="flex-row gap-2 mt-4 pt-2 border-t border-slate-700">
                                    <TouchableOpacity
                                        onPress={handleCancel}
                                        disabled={saving}
                                        className="flex-1 bg-slate-700 p-3 rounded-md items-center justify-center border border-slate-600"
                                    >
                                        <Text className="text-slate-300 font-bold text-xs">{t('cancel')}</Text>
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
                                                <Text className="text-white font-bold text-xs">{t('save')}</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>

                    <View className="bg-slate-800 rounded-md p-6 shadow-md border border-slate-700">
                        <Text className="text-base font-semibold text-white mb-4">{t('snow_modality')}</Text>
                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                className={`flex-1 p-4 rounded-md items-center border ${user?.activity_type === 'ski'
                                    ? 'bg-blue-600 border-blue-500'
                                    : 'bg-slate-700 border-slate-600'
                                    }`}
                                onPress={() => updateActivityType('ski')}
                            >
                                <Text className="text-white font-bold text-base">{t('ski_emoji')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                className={`flex-1 p-4 rounded-md items-center border ${user?.activity_type === 'snow'
                                    ? 'bg-blue-600 border-blue-500'
                                    : 'bg-slate-700 border-slate-600'
                                    }`}
                                onPress={() => updateActivityType('snow')}
                            >
                                <Text className="text-white font-bold text-base">{t('snowboard_emoji')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <TouchableOpacity
                        className="bg-red-600 rounded-md p-4 shadow-md items-center justify-center"
                        onPress={handleLogout}
                    >
                        <Text className="text-white font-bold text-base">{t('logout')}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}