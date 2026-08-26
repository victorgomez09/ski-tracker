import { X } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import {
  useThemeColors,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  LIGHT_COLORS,
} from '../../constants/theme';

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
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={styles.overlay}>
      <View style={styles.modalContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {forceUpdate ? t('force_update') : t('new_version_available')}
          </Text>
          {!forceUpdate && (
            <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.versionText}>
          {t('version')} {latestVersion}
        </Text>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.changelogSection}>
            <Text style={styles.sectionHeader}>{t('changelogs')}</Text>

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

const getStyles = (colors: typeof LIGHT_COLORS) =>
  StyleSheet.create({
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
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
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
      color: colors.textSecondary,
    },
    closeButton: {
      padding: 4,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.surface,
    },
    versionText: {
      fontSize: 12,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: SPACING.sm,
    },
    scrollContent: {
      flexDirection: 'column',
    },
    changelogSection: {
      backgroundColor: colors.surface,
      padding: 14,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    sectionHeader: {
      fontSize: 12,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    changelogWrapper: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    changelogCard: {
      backgroundColor: colors.card,
      padding: 8,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      width: '100%',
    },
    changelogScroll: {
      maxHeight: 150,
    },
    changelogItem: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    buttonContainer: {
      gap: SPACING.sm,
      marginTop: SPACING.md,
    },
    updateButton: {
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      ...SHADOWS.md,
    },
    laterButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      ...SHADOWS.sm,
    },
    buttonText: {
      color: colors.textOnPrimary,
      fontWeight: 'bold',
      fontSize: 16,
    },
    laterButtonText: {
      color: colors.textPrimary,
      fontWeight: 'bold',
      fontSize: 16,
    },
    gap1: {
      gap: 4,
    },
  });
