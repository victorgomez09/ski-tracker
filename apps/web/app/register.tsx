import { API_BASE_URL } from "constants/constants";
import { useRouter } from "expo-router";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Register {
    email: string;
    password: string;
    display_name: string;
    first_name: string;
    last_name: string;
}

export default function RegisterView() {
    const { t } = useTranslation();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const {
        control,
        handleSubmit,
        formState: { errors },
    } = useForm<Register>({
        mode: "onTouched",
        defaultValues: {
            first_name: "",
            last_name: "",
            display_name: "",
            email: "",
            password: "",
        }
    });

    const onSubmit: SubmitHandler<Register> = async (data) => {
        setIsSubmitting(true);
        try {
            const request = await fetch(`${API_BASE_URL}/auth/register`, {
                body: JSON.stringify(data),
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }
            });

            if (request.ok) {
                router.push("/login");
            }
        } catch (err) {
            console.error("Register error:", err);
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
                <Text className="text-2xl font-bold text-white mb-6 text-center">{t('register')}</Text>

                {/* FIRST NAME */}
                <Text className="text-sm font-semibold text-slate-300 mb-1">{t('first_name')}</Text>
                <Controller
                    control={control}
                    name="first_name"
                    rules={{ required: t('first_name_required') as string }}
                    render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                            className={`bg-slate-700 text-white p-3.5 rounded-md border ${errors.first_name ? "border-red-500" : "border-slate-600"} mb-1`}
                            placeholder={t('first_name') as string}
                            placeholderTextColor="#94a3b8"
                            onBlur={onBlur}
                            onChangeText={onChange}
                            value={value}
                        />
                    )}
                />
                {errors.first_name && (
                    <Text className="text-xs text-red-400 italic mb-2">{errors.first_name.message}</Text>
                )}

                {/* LAST NAME */}
                <Text className="text-sm font-semibold text-slate-300 mt-2 mb-1">{t('last_name')}</Text>
                <Controller
                    control={control}
                    name="last_name"
                    rules={{ required: t('last_name_required') as string }}
                    render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                            className={`bg-slate-700 text-white p-3.5 rounded-md border ${errors.last_name ? "border-red-500" : "border-slate-600"} mb-1`}
                            placeholder={t('last_name') as string}
                            placeholderTextColor="#94a3b8"
                            onBlur={onBlur}
                            onChangeText={onChange}
                            value={value}
                        />
                    )}
                />
                {errors.last_name && (
                    <Text className="text-xs text-red-400 italic mb-2">{errors.last_name.message}</Text>
                )}

                {/* DISPLAY NAME */}
                <Text className="text-sm font-semibold text-slate-300 mt-2 mb-1">{t('display_name')}</Text>
                <Controller
                    control={control}
                    name="display_name"
                    rules={{ required: t('display_name_required') as string }}
                    render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                            className={`bg-slate-700 text-white p-3.5 rounded-md border ${errors.display_name ? "border-red-500" : "border-slate-600"} mb-1`}
                            placeholder={t('display_name') as string}
                            placeholderTextColor="#94a3b8"
                            onBlur={onBlur}
                            onChangeText={onChange}
                            value={value}
                        />
                    )}
                />
                {errors.display_name && (
                    <Text className="text-xs text-red-400 italic mb-2">{errors.display_name.message}</Text>
                )}

                {/* EMAIL */}
                <Text className="text-sm font-semibold text-slate-300 mt-2 mb-1">{t('email')}</Text>
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
                    <Text className="text-xs text-red-400 italic mb-2">{errors.email.message}</Text>
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
                    <Text className="text-xs text-red-400 italic mb-2">{errors.password.message}</Text>
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
                        <Text className="text-white font-bold text-base">{t('register')}</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.push("/login")} className="mt-4">
                    <Text className="text-blue-400 text-xs text-center font-medium">
                        {t('already_account_login')}
                    </Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}