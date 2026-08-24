import { X } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface Props {
    forceUpdate: boolean;
    latestVersion: string;
    changelog: string[];
    onUpdate: () => void;
    onDismiss: () => void;
}

export const UpdateModal: React.FC<Props> = ({
    forceUpdate,
    latestVersion,
    changelog,
    onUpdate,
    onDismiss,
}) => {
    const { t } = useTranslation();

    return (
        <View style={styles.overlay}>
            <View style={styles.modalContainer}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>
                        {forceUpdate ? t('force_update') : t('new_version_available')}
                    </Text>
                    {!forceUpdate && (
                        <TouchableOpacity
                            onPress={onDismiss}
                            style={styles.closeButton}
                        >
                            <X size={18} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>
                <Text style={styles.versionText}>{t("version")} {latestVersion}</Text>

                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.changelogSection}>
                        <Text style={styles.sectionHeader}>
                            {t('changelogs')}
                        </Text>

                        <View style={styles.changelogWrapper}>
                            {changelog.length > 0 && (
                                <View style={styles.changelogCard}>
                                    <ScrollView style={styles.changelogScroll} contentContainerStyle={styles.gap1}>
                                        {changelog.map((item, index) => (
                                            <Text key={index} style={styles.changelogItem}>
                                                • {item}
                                            </Text>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
                        </View>
                    </View>
                </ScrollView>

                <View style={styles.buttonContainer}>
                    <TouchableOpacity style={styles.updateButton} onPress={onUpdate}>
                        <Text style={styles.buttonText}>{t('update')}</Text>
                    </TouchableOpacity>

                    {!forceUpdate && (
                        <TouchableOpacity style={styles.laterButton} onPress={onDismiss}>
                            <Text style={styles.laterButtonText}>{t('later')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 50,
        padding: SPACING.sm,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.xl,
        width: '100%',
        height: '83.333333%',
        ...SHADOWS.lg,
        display: 'flex',
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
        color: COLORS.textSecondary,
    },
    closeButton: {
        padding: 4,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: COLORS.surface,
    },
    versionText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: SPACING.sm,
    },
    scrollContent: {
        flexDirection: 'column',
    },
    changelogSection: {
        backgroundColor: COLORS.surface,
        padding: 14,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        gap: 8,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: 8,
    },
    changelogWrapper: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    changelogCard: {
        backgroundColor: COLORS.card,
        padding: 8,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        width: '100%',
    },
    changelogScroll: {
        maxHeight: 150,
    },
    changelogItem: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    buttonContainer: {
        gap: SPACING.sm,
        marginTop: SPACING.md,
    },
    updateButton: {
        backgroundColor: COLORS.primary,
        padding: 16,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        ...SHADOWS.md,
    },
    laterButton: {
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: 16,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        ...SHADOWS.sm,
    },
    buttonText: {
        color: COLORS.textOnPrimary,
        fontWeight: 'bold',
        fontSize: 16,
    },
    laterButtonText: {
        color: COLORS.textPrimary,
        fontWeight: 'bold',
        fontSize: 16,
    },
    gap1: {
        gap: 4,
    },
});