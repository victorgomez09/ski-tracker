import { Checkbox } from 'expo-checkbox';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Check, Pencil, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_BASE_URL } from "constants/constants";
import { useTheme, useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from "constants/theme";
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
    const colors = useThemeColors();
    const { isDark, toggleTheme } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);

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
                contentContainerStyle={styles.container}
            >
                <View style={styles.wrapper}>
                    <View style={styles.card}>
                        <TouchableOpacity
                            onPress={() => (isEditing ? handleCancel() : setIsEditing(true))}
                            style={styles.editToggleButton}
                        >
                            {isEditing ? <X size={16} color={colors.textSecondary} /> : <Pencil size={16} color={colors.primary} />}
                        </TouchableOpacity>

                        <View style={styles.avatarWrapper}>
                            <View style={styles.avatarContainer}>
                                {avatarUrl ? (
                                    <Image
                                        source={{ uri: avatarUrl }}
                                        style={styles.avatarImage}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <Text style={styles.avatarInitials}>
                                        {firstName ? firstName[0].toUpperCase() : '⛷️'}
                                    </Text>
                                )}
                            </View>

                            {isEditing && (
                                <TouchableOpacity
                                    onPress={handlePickImage}
                                    style={styles.cameraButton}
                                >
                                    <Camera size={14} color={colors.textOnPrimary} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {!isEditing ? (
                            user ? (
                                <View style={styles.profileInfo}>
                                    <Text style={styles.displayName}>
                                        {user.display_name || `${user.first_name} ${user.last_name}`}
                                    </Text>
                                    <Text style={styles.email}>{user.email}</Text>
                                </View>
                            ) : (
                                <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
                            )
                        ) : (
                            <View style={styles.form}>
                                <View style={styles.row}>
                                    <View style={styles.col}>
                                        <Text style={styles.label}>{t('first_name')}</Text>
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
                                                    placeholderTextColor={colors.textLight}
                                                    style={[styles.input, errors.first_name && styles.inputError]}
                                                />
                                            )}
                                        />
                                        {errors.first_name && (
                                            <Text style={styles.errorText}>{errors.first_name.message}</Text>
                                        )}
                                    </View>

                                    <View style={styles.col}>
                                        <Text style={styles.label}>{t('last_name')}</Text>
                                        <Controller
                                            control={control}
                                            name="last_name"
                                            render={({ field: { onChange, onBlur, value } }) => (
                                                <TextInput
                                                    onBlur={onBlur}
                                                    onChangeText={onChange}
                                                    value={value}
                                                    placeholder={t('last_name') as string}
                                                    placeholderTextColor={colors.textLight}
                                                    style={styles.input}
                                                />
                                            )}
                                        />
                                    </View>
                                </View>

                                <View>
                                    <Text style={styles.label}>{t('display_name')}</Text>
                                    <Controller
                                        control={control}
                                        name="display_name"
                                        render={({ field: { onChange, onBlur, value } }) => (
                                            <TextInput
                                                onBlur={onBlur}
                                                onChangeText={onChange}
                                                value={value}
                                                placeholder={t('skier_master_placeholder') as string}
                                                placeholderTextColor={colors.textLight}
                                                style={styles.input}
                                            />
                                        )}
                                    />
                                </View>

                                <View>
                                    <Text style={styles.label}>{t('email')}</Text>
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
                                                placeholderTextColor={colors.textLight}
                                                style={[styles.input, errors.email && styles.inputError]}
                                            />
                                        )}
                                    />
                                    {errors.email && (
                                        <Text style={styles.errorText}>{errors.email.message}</Text>
                                    )}
                                </View>

                                <View>
                                    <Text style={styles.label}>{t('time_tracking')}</Text>
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
                                        render={({ field: { value } }) => (
                                            <View style={styles.checkboxGroup}>
                                                <View style={styles.checkboxRow}>
                                                    <Checkbox
                                                        style={[styles.checkbox, errors.time_tracking && styles.inputError]}
                                                        value={value === 1000}
                                                        onValueChange={() => setValue('time_tracking', 1000)}
                                                        color={value === 1000 ? colors.primary : undefined}
                                                    />
                                                    <Text style={styles.checkboxText}>{t('each_1_second')}</Text>
                                                </View>

                                                <View style={styles.checkboxRow}>
                                                    <Checkbox
                                                        style={[styles.checkbox, errors.time_tracking && styles.inputError]}
                                                        value={value === 3000}
                                                        onValueChange={() => setValue('time_tracking', 3000)}
                                                        color={value === 3000 ? colors.primary : undefined}
                                                    />
                                                    <Text style={styles.checkboxText}>{t('each_3_seconds')}</Text>
                                                </View>

                                                <View style={styles.checkboxRow}>
                                                    <Checkbox
                                                        style={[styles.checkbox, errors.time_tracking && styles.inputError]}
                                                        value={value === 5000}
                                                        onValueChange={() => setValue('time_tracking', 5000)}
                                                        color={value === 5000 ? colors.primary : undefined}
                                                    />
                                                    <Text style={styles.checkboxText}>{t('each_5_seconds')}</Text>
                                                </View>
                                            </View>
                                        )}
                                    />
                                    <Text style={styles.helperText}>{t('time_tracking_desc')}</Text>
                                    {errors.time_tracking && (
                                        <Text style={styles.errorText}>{errors.time_tracking.message}</Text>
                                    )}
                                </View>

                                <View style={styles.formActions}>
                                    <TouchableOpacity
                                        onPress={handleCancel}
                                        disabled={saving}
                                        style={styles.cancelButton}
                                    >
                                        <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={handleSubmit(onSubmit)}
                                        disabled={saving}
                                        style={styles.saveButton}
                                    >
                                        {saving ? (
                                            <ActivityIndicator size="small" color={colors.textOnPrimary} />
                                        ) : (
                                            <>
                                                <Check size={14} color={colors.textOnPrimary} />
                                                <Text style={styles.saveButtonText}>{t('save')}</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>

                    <View style={styles.modalityCard}>
                        <Text style={styles.modalityTitle}>{t('snow_modality')}</Text>
                        <View style={styles.modalityButtons}>
                            <TouchableOpacity
                                style={[
                                    styles.modalityButton,
                                    user?.activity_type === 'ski' ? styles.modalityButtonActive : styles.modalityButtonInactive
                                ]}
                                onPress={() => updateActivityType('ski')}
                             >
                                 <Text style={user?.activity_type === 'ski' ? styles.modalityButtonText : styles.modalityButtonTextInactive}>{t('ski_emoji')}</Text>
                             </TouchableOpacity>
 
                             <TouchableOpacity
                                 style={[
                                     styles.modalityButton,
                                     user?.activity_type === 'snow' ? styles.modalityButtonActive : styles.modalityButtonInactive
                                 ]}
                                 onPress={() => updateActivityType('snow')}
                             >
                                 <Text style={user?.activity_type === 'snow' ? styles.modalityButtonText : styles.modalityButtonTextInactive}>{t('snowboard_emoji')}</Text>
                             </TouchableOpacity>
                         </View>
                     </View>
 
                     <TouchableOpacity
                        style={styles.themeButton}
                        onPress={toggleTheme}
                    >
                        <Text style={styles.themeButtonText}>
                            {isDark ? "Oscuro 🌙" : "Claro ☀️"}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                         style={styles.logoutButton}
                         onPress={handleLogout}
                     >
                         <Text style={styles.logoutButtonText}>{t('logout')}</Text>
                     </TouchableOpacity>
                 </View>
             </ScrollView>
         </SafeAreaView>
     );
 }
 
 const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
     container: {
         flexGrow: 1,
         justifyContent: 'center',
         alignItems: 'center',
         backgroundColor: colors.background,
         padding: SPACING.lg,
     },
     wrapper: {
         width: '100%',
         maxWidth: 400,
         gap: SPACING.md,
     },
     card: {
         backgroundColor: colors.card,
         borderRadius: BORDER_RADIUS.md,
         padding: SPACING.lg,
         borderWidth: 1,
         borderColor: colors.border,
         alignItems: 'center',
         position: 'relative',
         ...SHADOWS.md,
     },
     editToggleButton: {
         position: 'absolute',
         top: SPACING.md,
         right: SPACING.md,
         backgroundColor: colors.surface,
         padding: 8,
         borderRadius: BORDER_RADIUS.round,
         borderWidth: 1,
         borderColor: colors.border,
     },
     avatarWrapper: {
         position: 'relative',
         marginBottom: SPACING.md,
     },
     avatarContainer: {
         width: 96,
         height: 96,
         borderRadius: BORDER_RADIUS.round,
         backgroundColor: colors.surface,
         alignItems: 'center',
         justifyContent: 'center',
         borderWidth: 2,
         borderColor: colors.primary,
         overflow: 'hidden',
     },
     avatarImage: {
         width: '100%',
         height: '100%',
     },
     avatarInitials: {
         fontSize: 36,
         fontWeight: '700',
         color: colors.textPrimary,
     },
     cameraButton: {
         position: 'absolute',
         bottom: 0,
         right: 0,
         backgroundColor: colors.primary,
         padding: 8,
         borderRadius: BORDER_RADIUS.round,
         borderWidth: 2,
         borderColor: colors.card,
         ...SHADOWS.sm,
     },
     profileInfo: {
         alignItems: 'center',
     },
     displayName: {
         fontSize: 20,
         fontWeight: '700',
         color: colors.textPrimary,
         marginBottom: 4,
     },
     email: {
         fontSize: 14,
         color: colors.textSecondary,
     },
     form: {
         width: '100%',
         gap: 12,
         marginTop: 8,
     },
     row: {
         flexDirection: 'row',
         gap: SPACING.sm,
     },
     col: {
         flex: 1,
     },
     label: {
         fontSize: 10,
         fontWeight: '700',
         color: colors.textSecondary,
         textTransform: 'uppercase',
         marginBottom: 4,
     },
     input: {
         backgroundColor: colors.surface,
         borderWidth: 1,
         borderColor: colors.border,
         color: colors.textPrimary,
         padding: 10,
         borderRadius: BORDER_RADIUS.md,
         fontSize: 14,
     },
     inputError: {
         borderColor: colors.danger,
     },
     errorText: {
         color: colors.danger,
         fontSize: 10,
         marginTop: 4,
     },
     checkboxGroup: {
         gap: 12,
     },
     checkboxRow: {
         flexDirection: 'row',
         alignItems: 'center',
         gap: 8,
     },
     checkbox: {
         backgroundColor: colors.surface,
         borderWidth: 1,
         borderColor: colors.border,
         borderRadius: BORDER_RADIUS.sm,
         padding: 10,
     },
     checkboxText: {
         fontSize: 10,
         fontWeight: '700',
         color: colors.textSecondary,
     },
     helperText: {
         color: colors.textSecondary,
         fontSize: 10,
         marginTop: 4,
         fontStyle: 'italic',
     },
     formActions: {
         flexDirection: 'row',
         gap: SPACING.sm,
         marginTop: SPACING.md,
         paddingTop: SPACING.sm,
         borderTopWidth: 1,
         borderTopColor: colors.border,
     },
     cancelButton: {
         flex: 1,
         backgroundColor: colors.surface,
         padding: 12,
         borderRadius: BORDER_RADIUS.md,
         alignItems: 'center',
         justifyContent: 'center',
         borderWidth: 1,
         borderColor: colors.border,
     },
     cancelButtonText: {
         color: colors.textSecondary,
         fontWeight: '700',
         fontSize: 12,
     },
     saveButton: {
         flex: 1,
         backgroundColor: colors.primary,
         padding: 12,
         borderRadius: BORDER_RADIUS.md,
         alignItems: 'center',
         justifyContent: 'center',
         flexDirection: 'row',
         gap: 4,
         ...SHADOWS.sm,
     },
     saveButtonText: {
         color: colors.textOnPrimary,
         fontWeight: '700',
         fontSize: 12,
     },
     modalityCard: {
         backgroundColor: colors.card,
         borderRadius: BORDER_RADIUS.md,
         padding: SPACING.lg,
         borderWidth: 1,
         borderColor: colors.border,
         ...SHADOWS.md,
     },
     modalityTitle: {
         fontSize: 16,
         fontWeight: '600',
         color: colors.textPrimary,
         marginBottom: 16,
     },
     modalityButtons: {
         flexDirection: 'row',
         gap: SPACING.sm,
     },
     modalityButton: {
         flex: 1,
         padding: 16,
         borderRadius: BORDER_RADIUS.md,
         alignItems: 'center',
         borderWidth: 1,
     },
     modalityButtonActive: {
         backgroundColor: colors.primary,
         borderColor: colors.primaryDark,
     },
     modalityButtonInactive: {
         backgroundColor: colors.surface,
         borderColor: colors.border,
     },
     modalityButtonText: {
         color: colors.textOnPrimary,
         fontWeight: '700',
         fontSize: 16,
     },
     modalityButtonTextInactive: {
         color: colors.textPrimary,
         fontWeight: '700',
         fontSize: 16,
     },
     logoutButton: {
         backgroundColor: colors.danger,
         borderRadius: BORDER_RADIUS.md,
         padding: 16,
         alignItems: 'center',
         justifyContent: 'center',
         ...SHADOWS.md,
     },
     logoutButtonText: {
         color: colors.textOnPrimary,
         fontWeight: '700',
         fontSize: 16,
     },
     themeButton: {
         backgroundColor: colors.surface,
         borderRadius: BORDER_RADIUS.md,
         padding: 16,
         alignItems: 'center',
         justifyContent: 'center',
         borderWidth: 1,
         borderColor: colors.border,
         ...SHADOWS.sm,
     },
     themeButtonText: {
         color: colors.textPrimary,
         fontWeight: '700',
         fontSize: 16,
     },
 });