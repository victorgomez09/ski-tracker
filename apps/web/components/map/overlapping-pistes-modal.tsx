import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Platform } from 'react-native';
import { X, Layers, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Piste, Lift } from '../../models/ski-resort.model';
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from '../../constants/theme';

interface OverlappingPistesModalProps {
    visible: boolean;
    features: (Piste | Lift)[];
    onSelect: (feature: Piste | Lift) => void;
    onClose: () => void;
}

const getDifficultyMeta = (difficulty: string) => {
    const diff = difficulty?.toLowerCase() || '';
    switch (diff) {
        case 'novice':
            return { labelKey: 'novice', hex: '#00a859', name: 'Verde / Muy fácil' };
        case 'easy':
            return { labelKey: 'easy', hex: '#0072bc', name: 'Azul / Fácil' };
        case 'intermediate':
            return { labelKey: 'intermediate', hex: '#f0141e', name: 'Roja / Difícil' };
        case 'advanced':
        case 'expert':
            return { labelKey: 'expert', hex: '#000000', name: 'Negra / Muy difícil' };
        default:
            return { labelKey: 'easy', hex: '#0072bc', name: 'Pista' };
    }
};

export const OverlappingPistesModal: React.FC<OverlappingPistesModalProps> = ({
    visible,
    features,
    onSelect,
    onClose,
}) => {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const isWeb = Platform.OS === 'web';
    const styles = useMemo(() => getStyles(colors, isWeb), [colors, isWeb]);

    if (!visible || !features || features.length === 0) return null;

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.backdrop}
                activeOpacity={1}
                onPress={onClose}
            >
                <View
                    style={styles.modalCard}
                    onStartShouldSetResponder={() => true}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.titleRow}>
                            <View style={styles.iconCircle}>
                                <Layers size={18} color={colors.primary} />
                            </View>
                            <View style={styles.titleTextContainer}>
                                <Text style={styles.title}>
                                    {t('overlapping_slopes_title', 'Pistas superpuestas')}
                                </Text>
                                <Text style={styles.subtitle}>
                                    {t('overlapping_slopes_subtitle', 'Este tramo es compartido por varias pistas. Selecciona la que deseas ver:')}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            style={styles.closeButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <X size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Features List */}
                    <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                        {features.map((item, idx) => {
                            const isLift = Boolean((item as Lift).LiftType);
                            const piste = item as Piste;
                            const diffMeta = getDifficultyMeta(piste.Difficulty || '');
                            const name = item.Name || (isLift ? t('lift', 'Remonte') : t('piste', 'Pista'));

                            return (
                                <TouchableOpacity
                                    key={item.ID || idx}
                                    style={styles.itemCard}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        onSelect(item);
                                    }}
                                >
                                    <View style={styles.itemLeft}>
                                        {isLift ? (
                                            <View style={styles.liftBadge}>
                                                <Text style={styles.liftEmoji}>🚠</Text>
                                            </View>
                                        ) : (
                                            <View style={[styles.pisteBadge, { backgroundColor: diffMeta.hex }]}>
                                                <Text style={styles.pisteBadgeText}>
                                                    {piste.Tags?.ref || '•'}
                                                </Text>
                                            </View>
                                        )}
                                        <View style={styles.itemInfo}>
                                            <Text style={styles.itemName} numberOfLines={1}>
                                                {name}
                                            </Text>
                                            <Text style={styles.itemMeta}>
                                                {isLift
                                                    ? (item as Lift).LiftType
                                                    : t(diffMeta.labelKey, diffMeta.name)}
                                            </Text>
                                        </View>
                                    </View>
                                    <ChevronRight size={18} color={colors.textSecondary} />
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

const getStyles = (colors: typeof LIGHT_COLORS, isWeb: boolean) =>
    StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: SPACING.md,
        },
        modalCard: {
            backgroundColor: colors.surface,
            borderRadius: BORDER_RADIUS.lg,
            width: isWeb ? 420 : '92%',
            maxWidth: 480,
            maxHeight: '80%',
            overflow: 'hidden',
            ...SHADOWS.lg,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            paddingHorizontal: SPACING.md,
            paddingTop: SPACING.md,
            paddingBottom: SPACING.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        titleRow: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            flex: 1,
            marginRight: SPACING.sm,
        },
        iconCircle: {
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: `${colors.primary}15`,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: SPACING.sm,
            marginTop: 2,
        },
        titleTextContainer: {
            flex: 1,
        },
        title: {
            fontSize: 16,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        subtitle: {
            fontSize: 12,
            color: colors.textSecondary,
            marginTop: 2,
            lineHeight: 16,
        },
        closeButton: {
            padding: 4,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.background,
        },
        list: {
            padding: SPACING.md,
        },
        itemCard: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.background,
            paddingVertical: SPACING.sm + 2,
            paddingHorizontal: SPACING.md,
            borderRadius: BORDER_RADIUS.md,
            marginBottom: SPACING.xs + 2,
            borderWidth: 1,
            borderColor: colors.border,
        },
        itemLeft: {
            flexDirection: 'row',
            alignItems: 'center',
            flex: 1,
            marginRight: SPACING.sm,
        },
        pisteBadge: {
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: SPACING.sm,
        },
        pisteBadgeText: {
            color: '#ffffff',
            fontWeight: '700',
            fontSize: 12,
        },
        liftBadge: {
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: '#f1f5f9',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: SPACING.sm,
        },
        liftEmoji: {
            fontSize: 14,
        },
        itemInfo: {
            flex: 1,
        },
        itemName: {
            fontSize: 14,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        itemMeta: {
            fontSize: 11,
            color: colors.textSecondary,
            marginTop: 1,
            textTransform: 'capitalize',
        },
    });
