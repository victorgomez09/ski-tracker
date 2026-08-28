import { API_BASE_URL } from "constants/constants";
import { useRouter } from "expo-router";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "context/toast.context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from "constants/theme";

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
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

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
                showToast(t('success'), 'success');
                router.push("/login");
            } else {
                showToast(t('register_failed'), 'error');
            }
        } catch (err) {
            console.error("Register error:", err);
            showToast(t('register_failed'), 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isButtonDisabled = isSubmitting || Object.keys(errors).length > 0;

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
            <ScrollView 
                contentContainerStyle={styles.scrollContent} 
                style={styles.scrollView}
            >
                <View style={styles.card}>
                    <Text style={styles.title}>{t('register')}</Text>

                    {/* FIRST NAME */}
                    <Text style={styles.label}>{t('first_name')}</Text>
                    <Controller
                        control={control}
                        name="first_name"
                        rules={{ required: t('first_name_required') as string }}
                        render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                                style={[
                                    styles.input,
                                    errors.first_name ? styles.inputError : styles.inputNormal
                                ]}
                                placeholder={t('first_name') as string}
                                placeholderTextColor={colors.textLight}
                                onBlur={onBlur}
                                onChangeText={onChange}
                                value={value}
                            />
                        )}
                    />
                    {errors.first_name && (
                        <Text style={styles.errorText}>{errors.first_name.message}</Text>
                    )}

                    {/* LAST NAME */}
                    <Text style={[styles.label, styles.labelSpacing]}>{t('last_name')}</Text>
                    <Controller
                        control={control}
                        name="last_name"
                        rules={{ required: t('last_name_required') as string }}
                        render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                                style={[
                                    styles.input,
                                    errors.last_name ? styles.inputError : styles.inputNormal
                                ]}
                                placeholder={t('last_name') as string}
                                placeholderTextColor={colors.textLight}
                                onBlur={onBlur}
                                onChangeText={onChange}
                                value={value}
                            />
                        )}
                    />
                    {errors.last_name && (
                        <Text style={styles.errorText}>{errors.last_name.message}</Text>
                    )}

                    {/* DISPLAY NAME */}
                    <Text style={[styles.label, styles.labelSpacing]}>{t('display_name')}</Text>
                    <Controller
                        control={control}
                        name="display_name"
                        rules={{ required: t('display_name_required') as string }}
                        render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                                style={[
                                    styles.input,
                                    errors.display_name ? styles.inputError : styles.inputNormal
                                ]}
                                placeholder={t('display_name') as string}
                                placeholderTextColor={colors.textLight}
                                onBlur={onBlur}
                                onChangeText={onChange}
                                value={value}
                            />
                        )}
                    />
                    {errors.display_name && (
                        <Text style={styles.errorText}>{errors.display_name.message}</Text>
                    )}

                    {/* EMAIL */}
                    <Text style={[styles.label, styles.labelSpacing]}>{t('email')}</Text>
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
                            <Text style={styles.submitButtonText}>{t('register')}</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => router.push("/login")} style={styles.linkButton}>
                        <Text style={styles.linkText}>
                            {t('already_account_login')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
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