import { useRouter } from "expo-router";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import axios from "axios";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { API_BASE_URL } from "constants/constants";
import { useAuth } from "context/auth.context";

interface Login {
    email: string;
    password: string;
}

interface LoginResponse {
    access_token: string;
    refresh_token: string;
}

export default function LoginView() {
    const { t } = useTranslation();
    const router = useRouter();
    const { signIn } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const {
        control,
        handleSubmit,
        formState: { errors },
    } = useForm<Login>({
        mode: "onTouched",
        defaultValues: {
            email: "",
            password: "",
        }
    });

    const onSubmit: SubmitHandler<Login> = async (data) => {
        setIsSubmitting(true);
        try {
            const request = await axios.post(`${API_BASE_URL}/auth/login`, data, {
                headers: {
                    "Content-Type": "application/json"
                }
            });

            if (request.status === 200) {
                const resData = request.data as LoginResponse;
                await signIn(resData.access_token);
                router.push("/map");
            } else {
                console.error("Login failed:", request.status, request.statusText);
            }
        } catch (err) {
            console.log("Login error:", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ScrollView contentContainerStyle={{ 
                    flexGrow: 1, 
                    justifyContent: 'center', 
                    alignItems: 'center' 
                }} 
                className="bg-slate-900 p-6">
            <View className="bg-slate-800 rounded-md p-6 w-full max-w-sm border border-slate-700 shadow-2xl">
                <Text className="text-2xl font-bold text-white mb-6 text-center">{t('login')}</Text>

                {/* EMAIL */}
                <Text className="text-sm font-semibold text-slate-300 mb-1">{t('email')}</Text>
                <Controller
                    control={control}
                    name="email"
                    rules={{
                        required: t('email_required') as string,
                        pattern: {
                            value: /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/,
                            message: t('invalid_email') as string
                        }
                    }}
                    render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                            className={`bg-slate-700 text-white p-3.5 rounded-md border ${errors.email ? "border-red-500" : "border-slate-600"} mb-1`}
                            placeholder={t('email') as string}
                            placeholderTextColor="#94a3b8"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            onBlur={onBlur}
                            onChangeText={onChange}
                            value={value}
                        />
                    )}
                />
                {errors.email && (
                    <Text className="text-xs text-red-400 italic mb-3">{errors.email.message}</Text>
                )}

                {/* PASSWORD */}
                <Text className="text-sm font-semibold text-slate-300 mt-2 mb-1">{t('password')}</Text>
                <Controller
                    control={control}
                    name="password"
                    rules={{ required: t('password_required') as string }}
                    render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                            className={`bg-slate-700 text-white p-3.5 rounded-md border ${errors.password ? "border-red-500" : "border-slate-600"} mb-1`}
                            placeholder={t('password') as string}
                            placeholderTextColor="#94a3b8"
                            secureTextEntry
                            onBlur={onBlur}
                            onChangeText={onChange}
                            value={value}
                        />
                    )}
                />
                {errors.password && (
                    <Text className="text-xs text-red-400 italic mb-3">{errors.password.message}</Text>
                )}

                {/* SUBMIT */}
                <TouchableOpacity
                    className={`bg-blue-600 p-4 rounded-md items-center mt-6 shadow-md ${isSubmitting || Object.keys(errors).length > 0 ? "opacity-60" : ""}`}
                    onPress={handleSubmit(onSubmit)}
                    disabled={isSubmitting || Object.keys(errors).length > 0}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color="#ffffff" />
                    ) : (
                        <Text className="text-white font-bold text-base">{t('login')}</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.push("/register")} className="mt-4">
                    <Text className="text-blue-400 text-xs text-center font-medium">
                        {t('no_account_register')}
                    </Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}