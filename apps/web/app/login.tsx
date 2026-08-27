import { useRouter } from "expo-router";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import axios from "axios";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { API_BASE_URL } from "constants/constants";
import { useAuth } from "context/auth.context";
import { useToast } from "context/toast.context";
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from "constants/theme";

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
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);
    
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
                router.replace("/resorts");
            } else {
                console.error("Login failed:", request.status, request.statusText);
                showToast(t('login_failed'), 'error');
            }
        } catch (err) {
            console.log("Login error:", err);
            showToast(t('login_failed'), 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isButtonDisabled = isSubmitting || Object.keys(errors).length > 0;

    return (
        <ScrollView 
            contentContainerStyle={styles.scrollContent} 
            style={styles.scrollView}
        >
            <View style={styles.card}>
                <Text style={styles.title}>{t('login')}</Text>

                {/* EMAIL */}
                <Text style={styles.label}>{t('email')}</Text>
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
                            style={[
                                styles.input,
                                errors.email ? styles.inputError : styles.inputNormal
                            ]}
                            placeholder={t('email') as string}
                            placeholderTextColor={colors.textLight}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            onBlur={onBlur}
                            onChangeText={onChange}
                            value={value}
                        />
                    )}
                />
                {errors.email && (
                    <Text style={styles.errorText}>{errors.email.message}</Text>
                )}

                {/* PASSWORD */}
                <Text style={[styles.label, styles.labelSpacing]}>{t('password')}</Text>
                <Controller
                    control={control}
                    name="password"
                    rules={{ required: t('password_required') as string }}
                    render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                            style={[
                                styles.input,
                                errors.password ? styles.inputError : styles.inputNormal
                            ]}
                            placeholder={t('password') as string}
                            placeholderTextColor={colors.textLight}
                            secureTextEntry
                            onBlur={onBlur}
                            onChangeText={onChange}
                            value={value}
                        />
                    )}
                />
                {errors.password && (
                    <Text style={styles.errorText}>{errors.password.message}</Text>
                )}

                {/* SUBMIT */}
                <TouchableOpacity
                    style={[
                        styles.submitButton,
                        isButtonDisabled && styles.submitButtonDisabled
                    ]}
                    onPress={handleSubmit(onSubmit)}
                    disabled={isButtonDisabled}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color={colors.textOnPrimary} />
                    ) : (
                        <Text style={styles.submitButtonText}>{t('login')}</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.push("/register")} style={styles.linkButton}>
                    <Text style={styles.linkText}>
                        {t('no_account_register')}
                    </Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
    scrollView: {
        backgroundColor: colors.background,
    },
    scrollContent: {
        flexGrow: 1, 
        justifyContent: 'center', 
        alignItems: 'center',
        padding: SPACING.lg,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.lg,
        width: '100%',
        maxWidth: 380,
        borderWidth: 1,
        borderColor: colors.border,
        ...SHADOWS.lg,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: SPACING.lg,
        textAlign: 'center',
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: SPACING.xs,
    },
    labelSpacing: {
        marginTop: SPACING.sm,
    },
    input: {
        backgroundColor: colors.surface,
        color: colors.textPrimary,
        padding: 14,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        marginBottom: SPACING.xs,
    },
    inputNormal: {
        borderColor: colors.border,
    },
    inputError: {
        borderColor: colors.danger,
    },
    errorText: {
        fontSize: 12,
        color: colors.danger,
        fontStyle: 'italic',
        marginBottom: SPACING.sm,
    },
    submitButton: {
        backgroundColor: colors.primary,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        marginTop: SPACING.lg,
        ...SHADOWS.sm,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonText: {
        color: colors.textOnPrimary,
        fontWeight: '700',
        fontSize: 16,
    },
    linkButton: {
        marginTop: SPACING.md,
    },
    linkText: {
        color: colors.primaryDark,
        fontSize: 12,
        textAlign: 'center',
        fontWeight: '500',
    },
});