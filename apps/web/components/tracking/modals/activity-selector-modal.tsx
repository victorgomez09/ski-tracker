import React from 'react';
import {
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Check, Compass, MapPin, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';
import { ACTIVITY_CONFIGS, ActivityType } from 'models/activity.model';

interface ActivitySelectorModalProps {
    visible: boolean;
    onClose: () => void;
    selectedActivity: ActivityType;
    onSelect: (activity: ActivityType) => void;
}

export const ActivitySelectorModal: React.FC<ActivitySelectorModalProps> = ({
    visible,
    onClose,
    selectedActivity,
    onSelect,
}) => {
    const colors = useThemeColors();
    const { t } = useTranslation();
    const styles = React.useMemo(() => getStyles(colors), [colors]);

    const activityList = React.useMemo(() => Object.values(ACTIVITY_CONFIGS), []);

    const handleSelect = (activity: ActivityType) => {
        onSelect(activity);
        onClose();
    };

    return (
        <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View
                    style={[
                        styles.panel,
                        Platform.OS === 'web' ? styles.panelWeb : styles.panelMobile,
                    ]}
                >
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{t('activity_type', 'Tipo de actividad')}</Text>
                            <Text style={styles.subtitle}>
                                {t('activity_type_desc', 'Selecciona el deporte o transporte para optimizar el GPS y las métricas')}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <X size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {activityList.map((config) => {
                            const isSelected = config.type === selectedActivity;

                            return (
                                <TouchableOpacity
                                    key={config.type}
                                    style={[
                                        styles.itemCard,
                                        isSelected && styles.itemCardSelected,
                                    ]}
                                    onPress={() => handleSelect(config.type)}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.iconContainer}>
                                        <Text style={styles.emojiIcon}>{config.icon}</Text>
                                    </View>

                                    <View style={styles.itemInfo}>
                                        <View style={styles.itemTitleRow}>
                                            <Text
                                                style={[
                                                    styles.itemLabel,
                                                    isSelected && { color: colors.primary, fontWeight: '700' },
                                                ]}
                                            >
                                                {t(config.labelKey, config.defaultLabel)}
                                            </Text>
                                            {isSelected && (
                                                <View style={styles.checkCircle}>
                                                    <Check size={14} color="#FFFFFF" strokeWidth={3} />
                                                </View>
                                            )}
                                        </View>

                                        <View style={styles.badgesRow}>
                                            {config.requiresResort ? (
                                                <View style={[styles.badge, styles.badgeResort]}>
                                                    <MapPin size={10} color={colors.primary} />
                                                    <Text style={[styles.badgeText, { color: colors.primary }]}>
                                                        {t('requires_resort_badge', 'Estación requerida')}
                                                    </Text>
                                                </View>
                                            ) : (
                                                <View style={[styles.badge, styles.badgeFree]}>
                                                    <Compass size={10} color={colors.success || '#10b981'} />
                                                    <Text style={[styles.badgeText, { color: colors.success || '#10b981' }]}>
                                                        {t('free_mode_badge', 'Sin estación')}
                                                    </Text>
                                                </View>
                                            )}

                                            <View style={[styles.badge, styles.badgeUnit]}>
                                                <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                                                    {config.speedUnit === 'min/km' ? t('pace', 'Ritmo') + ' (min/km)' : 'km/h'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const getStyles = (colors: any) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: SPACING.md,
        },
        panel: {
            backgroundColor: colors.card,
            borderRadius: BORDER_RADIUS.xl,
            padding: SPACING.md,
            ...SHADOWS.lg,
            maxHeight: '85%',
        },
        panelWeb: {
            width: 440,
        },
        panelMobile: {
            width: '95%',
            maxWidth: 440,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: SPACING.md,
            gap: SPACING.sm,
        },
        title: {
            fontSize: 18,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        subtitle: {
            fontSize: 12,
            color: colors.textSecondary,
            marginTop: 2,
            lineHeight: 16,
        },
        closeButton: {
            padding: SPACING.xs,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surface,
        },
        scroll: {
            maxHeight: 450,
        },
        scrollContent: {
            gap: SPACING.xs + 2,
            paddingBottom: SPACING.xs,
        },
        itemCard: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: SPACING.sm + 2,
            paddingHorizontal: SPACING.md,
            borderRadius: BORDER_RADIUS.lg,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surface,
        },
        itemCardSelected: {
            borderColor: colors.primary,
            backgroundColor: colors.surface,
        },
        iconContainer: {
            width: 44,
            height: 44,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: colors.card,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: SPACING.md,
        },
        emojiIcon: {
            fontSize: 24,
        },
        itemInfo: {
            flex: 1,
        },
        itemTitleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        itemLabel: {
            fontSize: 15,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        checkCircle: {
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
        },
        badgesRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING.xs,
            marginTop: 4,
        },
        badge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: BORDER_RADIUS.sm,
            borderWidth: 1,
        },
        badgeResort: {
            borderColor: colors.primary + '40',
            backgroundColor: colors.primary + '10',
        },
        badgeFree: {
            borderColor: (colors.success || '#10b981') + '40',
            backgroundColor: (colors.success || '#10b981') + '10',
        },
        badgeUnit: {
            borderColor: colors.border,
            backgroundColor: colors.card,
        },
        badgeText: {
            fontSize: 10,
            fontWeight: '500',
        },
    });
