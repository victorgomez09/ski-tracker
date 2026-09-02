import React from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';

interface ResortErrorModalProps {
    visible: boolean;
    onClose: () => void;
}

export const ResortErrorModal: React.FC<ResortErrorModalProps> = ({ visible, onClose }) => {
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
                        <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                            {t('not_in_resort_title', 'Estación incorrecta')}
                        </Text>
                        <TouchableOpacity
                            onPress={onClose}
                            style={[styles.modalCloseButton, { backgroundColor: colors.surface }]}
                        >
                            <X size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <View style={{ paddingVertical: SPACING.md }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 15, lineHeight: 22 }}>
                            {t(
                                'not_in_resort_message',
                                'No te encuentras en la estación seleccionada. No se puede iniciar el trackeo para esta estación.'
                            )}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={[
                            styles.confirmButton,
                            { backgroundColor: colors.primary, borderRadius: BORDER_RADIUS.md },
                        ]}
                        onPress={onClose}
                    >
                        <Text style={styles.confirmButtonText}>{t('ok', 'OK')}</Text>
                    </TouchableOpacity>
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
    confirmButton: {
        padding: SPACING.md,
        alignItems: 'center',
        marginTop: SPACING.xs,
    },
    confirmButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
});
