import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import BottomTabs from 'components/navigation/bottom-tabs';
import { LIGHT_COLORS, SPACING, useThemeColors } from 'constants/theme';
import { useAuth } from 'context/auth.context';

export default function RootLayout() {
  const { token, isLoading } = useAuth();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!token) {
    return <Redirect href="/login" />;
  }

  return (
    <>
      <Tabs tabBar={(props) => <BottomTabs {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen
          name="map"
          options={{
            title: t('map'),
            tabBarIcon: ({ color }) => <Ionicons name="map" size={16} color={color} />
          }}
        />
        <Tabs.Screen
          name="tracking"
          options={{
            title: t('tracking'),
            tabBarIcon: ({ color }) => <Ionicons name="navigate-outline" size={16} color={color} />
          }}
        />
        <Tabs.Screen
          name="resorts"
          options={{
            title: t('resorts'),
            tabBarIcon: ({ color }) => <Ionicons name="snow-outline" size={16} color={color} />
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: t('community'),
            tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={16} color={color} />
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('profile'),
            tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={16} color={color} />
          }}
        />
      </Tabs>
    </>
  );
}

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  message: {
    marginTop: SPACING.sm,
    color: colors.textSecondary,
  },
});