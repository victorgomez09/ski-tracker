import { useRouter } from 'expo-router';
import { ArrowLeft, Snowflake } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { SnowForecastView } from '../components/snow/snow-forecast-view';
import { BORDER_RADIUS, LIGHT_COLORS, SPACING, useThemeColors } from '../constants/theme';

export default function SnowForecastScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel={t('back', 'Volver')}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Snowflake size={18} color={colors.primary} />
          <Text style={styles.titleText}>{t('snow_forecast_title', 'Previsión de Nevadas')}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <SnowForecastView
        showHeader={false}
        onSelectResort={(resort) => {
          router.navigate({
            pathname: '/map',
            params: { lat: resort.Latitude, lon: resort.Longitude, zoom: 12 },
          });
        }}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: typeof LIGHT_COLORS) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.round,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    titleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    titleText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
  });
