import { Checkbox } from 'expo-checkbox';
import * as ImagePicker from 'expo-image-picker';
import { useNetworkState } from 'expo-network';
import {
  Camera,
  Check,
  Pencil,
  X,
  LogOut,
  Moon,
  Sun,
  User,
  Mail,
  Settings,
  Clock,
  Activity,
  ShieldAlert,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Constants from 'expo-constants';
import { API_BASE_URL } from 'constants/constants';
import {
  useTheme,
  useThemeColors,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  LIGHT_COLORS,
} from 'constants/theme';
import { useAuth } from 'context/auth.context';
import { useToast } from 'context/toast.context';
import api from 'interceptor/api';
import type { User as UserType } from 'models/user.model';
import appConfig from '../../app.json';

const appVersion = Constants.expoConfig?.version ?? appConfig.expo.version ?? '1.0.0';
const runtimeVersion = Constants.expoConfig?.runtimeVersion ?? appConfig.expo.runtimeVersion ?? '1.0.0';

export type ProfileFormValues = {
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  time_tracking: number;
  privacy_sessions: string;
  privacy_live_location: string;
  privacy_requests: string;
};

export default function ProfileView() {
  const { t } = useTranslation();
  const { token, signOut, user, updateUser, refreshUser } = useAuth();
  const { showToast } = useToast();
  const networkState = useNetworkState();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const colors = useThemeColors();
  const { isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  
  const isOffline = networkState?.isConnected === false;

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
      privacy_sessions: 'FRIENDS',
      privacy_live_location: 'WHILE_RECORDING',
      privacy_requests: 'EVERYONE',
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
        privacy_sessions: user.privacy_sessions || 'FRIENDS',
        privacy_live_location: user.privacy_live_location || 'WHILE_RECORDING',
        privacy_requests: user.privacy_requests || 'EVERYONE',
      });
    }
  }, [user, reset]);

  useEffect(() => {
    if (!isOffline && token) {
      refreshUser();
    }
  }, [token, isOffline]);

  const updateActivityType = async (type: 'snow' | 'ski') => {
    if (isOffline) {
      showToast(t('offline_no_edit') || 'No puedes cambiar de modalidad sin conexión', 'info');
      return;
    }
    if (user) {
      try {
        const request = await api.put<UserType>(
          `${API_BASE_URL}/users/${user.id}`,
          {
            ...user,
            activity_type: type,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (request.status === 200) {
          updateUser({ ...user, activity_type: type });
        }
      } catch (error) {
        console.error('Error updating activity type:', error);
      }
    }
  };

  const handlePickImage = async () => {
    if (isOffline) {
      showToast(t('offline_no_edit') || 'No puedes editar el perfil sin conexión', 'info');
      return;
    }
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showToast(t('permission_denied_gallery'), 'error');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const mimeType = asset.mimeType || 'image/jpeg';
      const base64Data = `data:${mimeType};base64,${asset.base64}`;

      setValue('avatar_url', base64Data, { shouldDirty: true });
    }
  };

  const onSubmit = async (data: ProfileFormValues) => {
    if (isOffline) {
      showToast(t('offline_no_edit') || 'No puedes editar el perfil sin conexión', 'info');
      return;
    }
    try {
      setSaving(true);
      const response = await api.put<UserType>(`${API_BASE_URL}/users/${user?.id}`, {
        ...data,
        id: user?.id,
        avatar_url: avatarUrl,
        activity_type: user?.activity_type,
      });

      if (response.status !== 200) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      updateUser(response.data);
      setIsEditing(false);
      showToast(t('profile_updated'), 'success');
    } catch (error) {
      showToast(t('failed_save_changes'), 'error');
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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.wrapper}>
          {/* Header Hero Card */}
          <View style={styles.heroCard}>
            {/* Upper colorful accent bar */}
            <View style={[styles.heroAccentBar, { backgroundColor: colors.primary }]} />

            {!isOffline && (
              <TouchableOpacity
                onPress={() => (isEditing ? handleCancel() : setIsEditing(true))}
                style={styles.editToggleButton}
                activeOpacity={0.8}>
                {isEditing ? (
                  <X size={18} color={colors.textSecondary} />
                ) : (
                  <Pencil size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}

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
                  activeOpacity={0.8}>
                  <Camera size={14} color={colors.textOnPrimary} />
                </TouchableOpacity>
              )}
            </View>

            {!isEditing ? (
              user ? (
                <View style={styles.profileHeaderInfo}>
                  <Text style={styles.displayName}>
                    {user.display_name || `${user.first_name} ${user.last_name}`}
                  </Text>
                  <Text style={styles.emailText} numberOfLines={1} ellipsizeMode="tail">
                    {user.email}
                  </Text>

                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                      <Activity size={12} color={colors.primary} />
                      <Text style={styles.badgeText}>
                        {user.activity_type === 'ski'
                          ? t('ski_emoji') + ' Skiier'
                          : t('snowboard_emoji') + ' Snowboarder'}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: SPACING.md }} />
              )
            ) : (
              <Text style={styles.editTitle}>{t('edit_profile') || 'Editar Perfil'}</Text>
            )}
          </View>

          {/* Section: Personal Info / Fields */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <User size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>
                {t('personal_info') || 'Información Personal'}
              </Text>
            </View>

            {!isEditing ? (
              user ? (
                <View style={styles.infoList}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{t('first_name')}</Text>
                    <Text style={styles.infoValue}>{user.first_name || '-'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{t('last_name')}</Text>
                    <Text style={styles.infoValue}>{user.last_name || '-'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{t('display_name')}</Text>
                    <Text style={styles.infoValue}>{user.display_name || '-'}</Text>
                  </View>
                  <View style={styles.infoRowLast}>
                    <Text style={styles.infoLabel}>{t('email')}</Text>
                    <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">
                      {user.email}
                    </Text>
                  </View>
                </View>
              ) : null
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
                  {errors.email && <Text style={styles.errorText}>{errors.email.message}</Text>}
                </View>
              </View>
            )}
          </View>

          {/* Section: Modality */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Activity size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>{t('snow_modality')}</Text>
            </View>

            <View style={styles.modalityButtons}>
              <TouchableOpacity
                style={[
                  styles.modalityButton,
                  user?.activity_type === 'ski'
                    ? styles.modalityButtonActive
                    : styles.modalityButtonInactive,
                  { borderColor: user?.activity_type === 'ski' ? colors.primary : colors.border },
                ]}
                onPress={() => updateActivityType('ski')}
                activeOpacity={0.8}>
                <Text style={styles.modalityEmoji}>🎿</Text>
                <Text
                  style={[
                    styles.modalityText,
                    user?.activity_type === 'ski'
                      ? styles.modalityTextActive
                      : styles.modalityTextInactive,
                  ]}>
                  {t('ski')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalityButton,
                  user?.activity_type === 'snow'
                    ? styles.modalityButtonActive
                    : styles.modalityButtonInactive,
                  { borderColor: user?.activity_type === 'snow' ? colors.primary : colors.border },
                ]}
                onPress={() => updateActivityType('snow')}
                activeOpacity={0.8}>
                <Text style={styles.modalityEmoji}>🏂</Text>
                <Text
                  style={[
                    styles.modalityText,
                    user?.activity_type === 'snow'
                      ? styles.modalityTextActive
                      : styles.modalityTextInactive,
                  ]}>
                  {t('snowboard')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Section: Tracking Configuration */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Clock size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>{t('time_tracking')}</Text>
            </View>

            <Controller
              control={control}
              name="time_tracking"
              rules={{
                required: t('time_tracking_required') as string,
              }}
              render={({ field: { onChange, value } }) => (
                <View style={styles.trackingContainer}>
                  <View style={styles.trackingPillSelector}>
                    <TouchableOpacity
                      style={[styles.trackingPill, value === 1000 && styles.trackingPillActive]}
                      onPress={() => isEditing && onChange(1000)}
                      disabled={!isEditing}
                      activeOpacity={0.8}>
                      <Text
                        style={[
                          styles.trackingPillText,
                          value === 1000 && styles.trackingPillTextActive,
                        ]}>
                        1s
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.trackingPill, value === 3000 && styles.trackingPillActive]}
                      onPress={() => isEditing && onChange(3000)}
                      disabled={!isEditing}
                      activeOpacity={0.8}>
                      <Text
                        style={[
                          styles.trackingPillText,
                          value === 3000 && styles.trackingPillTextActive,
                        ]}>
                        3s
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.trackingPill, value === 5000 && styles.trackingPillActive]}
                      onPress={() => isEditing && onChange(5000)}
                      disabled={!isEditing}
                      activeOpacity={0.8}>
                      <Text
                        style={[
                          styles.trackingPillText,
                          value === 5000 && styles.trackingPillTextActive,
                        ]}>
                        5s
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.helperText}>
                    {value === 1000
                      ? t('each_1_second')
                      : value === 3000
                        ? t('each_3_seconds')
                        : t('each_5_seconds')}{' '}
                    — {t('time_tracking_desc')}
                  </Text>
                </View>
              )}
            />
          </View>

          {/* Section: App Preferences */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Settings size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>{t('settings') || 'Ajustes'}</Text>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>{t('app_theme')}</Text>
              <TouchableOpacity
                style={styles.themeToggle}
                onPress={toggleTheme}
                activeOpacity={0.8}>
                {isDark ? (
                  <>
                    <Moon size={16} color={colors.primary} />
                    <Text style={styles.themeToggleText}>{t('dark')}</Text>
                  </>
                ) : (
                  <>
                    <Sun size={16} color={colors.warning || '#f59e0b'} />
                    <Text style={styles.themeToggleText}>{t('light')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Section: Privacy Settings */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <ShieldAlert size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>{t('privacy_settings') || 'Ajustes de Privacidad'}</Text>
            </View>

            <View style={{ gap: 14 }}>
              <View>
                <Text style={styles.label}>{t('privacy_sessions')}</Text>
                <Controller
                  control={control}
                  name="privacy_sessions"
                  render={({ field: { onChange, value } }) => (
                    <View style={styles.privacySelector}>
                      <TouchableOpacity
                        style={[styles.privacyPill, value === 'PUBLIC' && styles.privacyPillActive]}
                        onPress={() => isEditing && onChange('PUBLIC')}
                        disabled={!isEditing}
                      >
                        <Text style={[styles.privacyPillText, value === 'PUBLIC' && styles.privacyPillTextActive]}>
                          {t('public')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.privacyPill, value === 'FRIENDS' && styles.privacyPillActive]}
                        onPress={() => isEditing && onChange('FRIENDS')}
                        disabled={!isEditing}
                      >
                        <Text style={[styles.privacyPillText, value === 'FRIENDS' && styles.privacyPillTextActive]}>
                          {t('only_friends')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.privacyPill, value === 'PRIVATE' && styles.privacyPillActive]}
                        onPress={() => isEditing && onChange('PRIVATE')}
                        disabled={!isEditing}
                      >
                        <Text style={[styles.privacyPillText, value === 'PRIVATE' && styles.privacyPillTextActive]}>
                          {t('private')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                />
              </View>

              <View>
                <Text style={styles.label}>{t('privacy_live_location')}</Text>
                <Controller
                  control={control}
                  name="privacy_live_location"
                  render={({ field: { onChange, value } }) => (
                    <View style={styles.privacySelector}>
                      <TouchableOpacity
                        style={[styles.privacyPill, value === 'ON' && styles.privacyPillActive]}
                        onPress={() => isEditing && onChange('ON')}
                        disabled={!isEditing}
                      >
                        <Text style={[styles.privacyPillText, value === 'ON' && styles.privacyPillTextActive]}>
                          {t('on') || 'SÍ'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.privacyPill, value === 'WHILE_RECORDING' && styles.privacyPillActive]}
                        onPress={() => isEditing && onChange('WHILE_RECORDING')}
                        disabled={!isEditing}
                      >
                        <Text style={[styles.privacyPillText, value === 'WHILE_RECORDING' && styles.privacyPillTextActive]}>
                          {t('while_recording')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.privacyPill, value === 'OFF' && styles.privacyPillActive]}
                        onPress={() => isEditing && onChange('OFF')}
                        disabled={!isEditing}
                      >
                        <Text style={[styles.privacyPillText, value === 'OFF' && styles.privacyPillTextActive]}>
                          {t('off') || 'NO'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                />
              </View>

              <View>
                <Text style={styles.label}>{t('privacy_requests')}</Text>
                <Controller
                  control={control}
                  name="privacy_requests"
                  render={({ field: { onChange, value } }) => (
                    <View style={styles.privacySelector}>
                      <TouchableOpacity
                        style={[styles.privacyPill, value === 'EVERYONE' && styles.privacyPillActive]}
                        onPress={() => isEditing && onChange('EVERYONE')}
                        disabled={!isEditing}
                      >
                        <Text style={[styles.privacyPillText, value === 'EVERYONE' && styles.privacyPillTextActive]}>
                          {t('everyone')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.privacyPill, value === 'NOONE' && styles.privacyPillActive]}
                        onPress={() => isEditing && onChange('NOONE')}
                        disabled={!isEditing}
                      >
                        <Text style={[styles.privacyPillText, value === 'NOONE' && styles.privacyPillTextActive]}>
                          {t('noone')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                />
              </View>
            </View>
          </View>

          {/* Save / Cancel actions if Editing */}
          {isEditing && (
            <View style={styles.formActions}>
              <TouchableOpacity
                onPress={handleCancel}
                disabled={saving}
                style={styles.cancelButton}
                activeOpacity={0.8}>
                <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSubmit(onSubmit)}
                disabled={saving}
                style={styles.saveButton}
                activeOpacity={0.8}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.textOnPrimary} />
                ) : (
                  <>
                    <Check size={16} color={colors.textOnPrimary} />
                    <Text style={styles.saveButtonText}>{t('save')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.9}>
            <LogOut size={18} color={colors.textOnPrimary} />
            <Text style={styles.logoutButtonText}>{t('logout')}</Text>
          </TouchableOpacity>

          {/* App Version */}
          <View style={styles.versionContainer}>
            <Text style={styles.versionText}>v{appVersion}({runtimeVersion.toString()})</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: typeof LIGHT_COLORS) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      padding: SPACING.md,
    },
    wrapper: {
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      gap: SPACING.md,
      paddingBottom: SPACING.xl,
    },
    heroCard: {
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.md,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      position: 'relative',
      overflow: 'hidden',
      ...SHADOWS.md,
    },
    heroAccentBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 6,
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
      ...SHADOWS.sm,
    },
    avatarWrapper: {
      position: 'relative',
      marginBottom: SPACING.sm,
      marginTop: SPACING.xs,
    },
    avatarContainer: {
      width: 104,
      height: 104,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: colors.primary,
      overflow: 'hidden',
      ...SHADOWS.md,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarInitials: {
      fontSize: 40,
      fontWeight: '700',
      color: colors.primary,
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
      ...SHADOWS.md,
    },
    profileHeaderInfo: {
      alignItems: 'center',
      marginTop: SPACING.xs,
    },
    displayName: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    emailText: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 2,
      maxWidth: '100%',
      paddingHorizontal: SPACING.sm,
      textAlign: 'center',
    },
    badgeRow: {
      flexDirection: 'row',
      marginTop: SPACING.sm,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.round,
      borderWidth: 1,
      borderColor: colors.border,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    editTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: SPACING.xs,
    },
    sectionCard: {
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.lg,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOWS.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: SPACING.sm,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      letterSpacing: -0.3,
    },
    infoList: {
      width: '100%',
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    infoRowLast: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
    },
    infoLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    infoValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      flexShrink: 1,
      textAlign: 'right',
      marginLeft: SPACING.md,
    },
    form: {
      width: '100%',
      gap: 14,
    },
    row: {
      flexDirection: 'row',
      gap: SPACING.md,
    },
    col: {
      flex: 1,
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 6,
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.textPrimary,
      padding: 12,
      borderRadius: BORDER_RADIUS.md,
      fontSize: 14,
    },
    inputError: {
      borderColor: colors.danger,
    },
    errorText: {
      color: colors.danger,
      fontSize: 11,
      marginTop: 4,
    },
    modalityButtons: {
      flexDirection: 'row',
      gap: SPACING.md,
    },
    modalityButton: {
      flex: 1,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2.5,
      gap: 6,
    },
    modalityButtonActive: {
      backgroundColor: colors.surface,
    },
    modalityButtonInactive: {
      backgroundColor: colors.surface,
    },
    modalityEmoji: {
      fontSize: 32,
    },
    modalityText: {
      fontSize: 14,
      fontWeight: '700',
    },
    modalityTextActive: {
      color: colors.primary,
    },
    modalityTextInactive: {
      color: colors.textSecondary,
    },
    trackingContainer: {
      gap: 12,
    },
    trackingPillSelector: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.round,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    trackingPill: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.round,
    },
    trackingPillActive: {
      backgroundColor: colors.primary,
    },
    trackingPillText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    trackingPillTextActive: {
      color: colors.textOnPrimary,
    },
    helperText: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 4,
    },
    settingLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    themeToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS.round,
      ...SHADOWS.sm,
    },
    themeToggleText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    formActions: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginTop: SPACING.sm,
    },
    cancelButton: {
      flex: 1,
      backgroundColor: colors.card,
      padding: 14,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelButtonText: {
      color: colors.textSecondary,
      fontWeight: '700',
      fontSize: 14,
    },
    saveButton: {
      flex: 1,
      backgroundColor: colors.primary,
      padding: 14,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      ...SHADOWS.md,
    },
    saveButtonText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
      fontSize: 14,
    },
    logoutButton: {
      flexDirection: 'row',
      backgroundColor: colors.danger,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      ...SHADOWS.md,
    },
    logoutButtonText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
      fontSize: 16,
    },
    versionContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.xs,
      marginTop: SPACING.xs,
    },
    versionText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textLight,
      letterSpacing: 0.5,
    },
    privacySelector: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.round,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    privacyPill: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.round,
    },
    privacyPillActive: {
      backgroundColor: colors.primary,
    },
    privacyPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    privacyPillTextActive: {
      color: colors.textOnPrimary,
    },
  });
