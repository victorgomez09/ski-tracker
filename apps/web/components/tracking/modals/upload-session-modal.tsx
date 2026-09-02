import React from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Activity, Trash2, Upload, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';
import { formatDuration } from '../hooks/use-live-stats';

interface UploadSessionModalProps {
    visible: boolean;
    onClose: () => void;
    resortName?: string;
    pointsCount: number;
    distanceKm: number;
    durationSeconds: number;
    isPublic: boolean;
    onTogglePublic: () => void;
    onDiscard: () => void;
    onUpload: () => void;
    isLoading: boolean;
}

export const UploadSessionModal: React.FC<UploadSessionModalProps> = ({
    visible,
    onClose,
    resortName,
    pointsCount,
    distanceKm,
    durationSeconds,
    isPublic,
    onTogglePublic,
    onDiscard,
    onUpload,
    isLoading,
}) => {
    const { t } = useTranslation();
    const colors = useThemeColors();

    return (
        <Modal visible={visible} animationType="fade" transparent={true}>
            <View style={styles.modalOverlay}>
                <View
                    style={[
                        styles.modalPanel,
                        { backgroundColor: colors.card, borderColor: colors.border },
                        Platform.OS === 'web' ? styles.modalPanelWeb : styles.modalPanelMobile,
                    ]}
                >
                    <View style={styles.modalHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Activity size={20} color={colors.primary} />
                            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                                {t('session_summary', 'Resumen de la sesión')}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            style={[styles.modalCloseButton, { backgroundColor: colors.surface }]}
                        >
                            <X size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <View style={{ marginVertical: SPACING.md, gap: SPACING.sm }}>
                        <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                                {t('resort_or_activity', 'Estación / Actividad')}:
                            </Text>
                            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                                {resortName || t('free_activity', 'Actividad libre')}
                            </Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                                {t('points', 'Puntos grabados')}:
                            </Text>
                            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                                {pointsCount}
                            </Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                                {t('distance', 'Distancia')}:
                            </Text>
                            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                                {distanceKm.toFixed(2)} km
                            </Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                                {t('duration', 'Duración')}:
                            </Text>
                            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                                {formatDuration(durationSeconds)}
                            </Text>
                        </View>

                        <View style={styles.privacyRow}>
                            <Text style={[styles.privacyLabel, { color: colors.textSecondary }]}>
                                {t('public_session_question', '¿Sesión pública?')}
                            </Text>
                            <TouchableOpacity
                                onPress={onTogglePublic}
                                style={[
                                    styles.privacyButton,
                                    isPublic
                                        ? { backgroundColor: colors.primary }
                                        : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.privacyButtonText,
                                        { color: isPublic ? '#FFFFFF' : colors.textPrimary },
                                    ]}
                                >
                                    {isPublic ? t('public', 'Pública') : t('private', 'Privada')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs }}>
                        <TouchableOpacity
                            style={[
                                styles.discardButton,
                                {
                                    backgroundColor: colors.surface,
                                    borderColor: colors.danger,
                                    borderWidth: 1,
                                    borderRadius: BORDER_RADIUS.md,
                                },
                            ]}
                            onPress={onDiscard}
                            disabled={isLoading}
                        >
                            <Trash2 size={16} color={colors.danger} />
                            <Text style={[styles.discardButtonText, { color: colors.danger }]}>
                                {t('discard', 'Descartar')}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.modalUploadButton,
                                { backgroundColor: colors.primary, borderRadius: BORDER_RADIUS.md },
                            ]}
                            onPress={onUpload}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <>
                                    <Upload size={16} color="#FFFFFF" />
                                    <Text style={styles.modalUploadButtonText}>
                                        {t('upload_session', 'Subir sesión')}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.md,
    },
    modalPanel: {
        borderWidth: 1,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.xl,
        ...SHADOWS.lg,
    },
    modalPanelWeb: {
        width: 400,
    },
    modalPanelMobile: {
        width: '95%',
        maxWidth: 420,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    modalCloseButton: {
        padding: SPACING.xs + 2,
        borderRadius: BORDER_RADIUS.round,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
    },
    summaryLabel: {
        fontSize: 14,
    },
    summaryValue: {
        fontSize: 14,
        fontWeight: '600',
    },
    privacyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: SPACING.xs,
        paddingTop: SPACING.xs,
        borderTopWidth: 1,
        borderTopColor: 'rgba(150, 150, 150, 0.2)',
    },
    privacyLabel: {
        fontSize: 14,
        fontWeight: '500',
    },
    privacyButton: {
        paddingVertical: 6,
        paddingHorizontal: SPACING.md,
        borderRadius: BORDER_RADIUS.sm,
    },
    privacyButtonText: {
        fontSize: 13,
        fontWeight: 'bold',
    },
    discardButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: SPACING.sm + 2,
    },
    discardButtonText: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    modalUploadButton: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: SPACING.sm + 2,
    },
    modalUploadButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: 'bold',
    },
});
