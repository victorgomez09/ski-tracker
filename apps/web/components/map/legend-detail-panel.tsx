import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from '../../constants/theme';

interface LegendDetailPanelProps {
    onClose: () => void;
}

export const LegendDetailPanel: React.FC<LegendDetailPanelProps> = ({ onClose }) => {
    const { t } = useTranslation();
    const isWeb = Platform.OS === 'web';
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

    const getDifficultyMeta = [
        { label: t('novice'), slope: '< 10°', color: '#00a859' },
        { label: t('easy'), slope: '10° - 14º', color: '#0072bc' },
        { label: t('intermediate'), slope: '15° - 24°', color: '#f0141e' },
        { label: t('expert'), slope: '> 24°', color: '#000000' },
        { label: t('other'), slope: '-', color: '#94A3B8' },
    ];

    return (
        <View style={styles.overlay} pointerEvents="box-none">
            <View style={[styles.panel, isWeb ? styles.panelWeb : styles.panelMobile]}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>
                        {t('legend')}
                    </Text>
                    <TouchableOpacity
                        onPress={onClose}
                        style={styles.closeButton}
                    >
                        <X size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{t('difficulty_levels')}</Text>
                        {getDifficultyMeta.map((meta) => (
                            <View key={meta.label} style={styles.itemRow}>
                                <View style={[styles.colorIndicator, { backgroundColor: meta.color }]} />
                                <Text style={styles.itemText}>{meta.label}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>
                            {t('slope_grading')}
                        </Text>

                        <View style={styles.gradingContainer}>
                            {getDifficultyMeta.filter(meta => meta.label !== t('other')).map((meta) => (
                                <View key={meta.label} style={styles.gradingItem}>
                                    <View style={[styles.gradingBar, { backgroundColor: meta.color }]} />
                                    <Text style={styles.gradingText}>{meta.slope}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </ScrollView>
            </View>
        </View>
    );
};

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        zIndex: 50,
    },
    panel: {
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.xl,
        ...SHADOWS.md,
        display: 'flex',
        position: 'absolute',
    },
    panelWeb: {
        left: 20,
        top: 16,
        bottom: 16,
        width: 380,
        height: 'auto',
    },
    panelMobile: {
        bottom: 16,
        left: 16,
        right: 16,
        maxHeight: '45%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.sm,
    },
    headerTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: colors.textSecondary,
    },
    closeButton: {
        padding: SPACING.xs,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.surface,
    },
    scrollContent: {
        flexDirection: 'column',
    },
    section: {
        backgroundColor: colors.surface,
        padding: 14,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: SPACING.md,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: SPACING.sm,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 4,
    },
    colorIndicator: {
        width: 16,
        height: 16,
        borderRadius: BORDER_RADIUS.sm,
        marginRight: SPACING.sm,
    },
    itemText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    gradingContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
    },
    gradingItem: {
        alignItems: 'center',
        marginRight: SPACING.sm,
        marginBottom: SPACING.sm,
    },
    gradingBar: {
        width: 56,
        height: 12,
        borderRadius: BORDER_RADIUS.sm,
        marginBottom: 4,
    },
    gradingText: {
        fontSize: 10,
        color: colors.textSecondary,
        textAlign: 'center',
    },
});
