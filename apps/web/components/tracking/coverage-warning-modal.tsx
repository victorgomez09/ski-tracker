import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { X, AlertTriangle } from 'lucide-react-native';
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { useTranslation } from 'react-i18next';

interface Props {
  resortName: string;
  onDownload: () => void;
  onDismiss: () => void;
}

export const CoverageWarningModal: React.FC<Props> = ({ resortName, onDownload, onDismiss }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();

  return (
    <View style={styles.overlay}>
      <View style={[styles.modalContainer, { backgroundColor: colors.surface }]}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {t('offline_warning_title', 'Mountain Warning')}
          </Text>
          <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <AlertTriangle size={48} color={colors.warning} style={styles.icon} />
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {t('offline_warning_message', 'Network coverage may fail on the slopes. Do you want to download the map of {{resortName}} for offline use?', { resortName })}
          </Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, { borderColor: colors.border }]}
            onPress={onDismiss}
          >
            <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{t('cancel', 'Cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={onDownload}
          >
            <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>{t('download', 'Download')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContainer: {
    width: '85%',
    maxWidth: 400,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: SPACING.xs,
  },
  content: {
    alignItems: 'center',
    marginVertical: SPACING.md,
  },
  icon: {
    marginBottom: SPACING.md,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  button: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  primaryButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
