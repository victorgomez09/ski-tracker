import { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import { AlertTriangle } from "lucide-react-native";
import { View, Text, TouchableOpacity, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo } from 'react';

import { useOta } from "context/ota.context";
import { useTranslation } from "react-i18next";
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from "constants/theme";

export default function BottomTabs({ state, descriptors, navigation }: BottomTabBarProps) {
    const isWeb = Platform.OS === 'web';
    const { t } = useTranslation();
    const { hasOptionalUpdate, openOptionalModal } = useOta();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

    return (
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            {hasOptionalUpdate && (
                <TouchableOpacity
                    onPress={openOptionalModal}
                    accessibilityRole="button"
                    accessibilityLabel={t('ota_available_badge')}
                    style={styles.badge}
                >
                    <AlertTriangle size={16} color={colors.textPrimary} />
                    <View style={styles.badgeDot} />
                </TouchableOpacity>
            )}
            <View style={styles.container}>
                {state.routes.map((route, index) => {
                    const isFocused = state.index === index;
                    const descriptor = descriptors[route.key];

                    if (route.name === 'tracking' && isWeb) return null;

                    const onPress = () => {
                        const event = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        });

                        if (!isFocused && !event.defaultPrevented) {
                            navigation.navigate(route.name);
                        }
                    };

                    const activeColor = colors.primary;
                    const inactiveColor = colors.textSecondary;

                    return (
                        <TouchableOpacity
                            key={route.key}
                            onPress={onPress}
                            activeOpacity={0.7}
                            style={styles.tabButton}
                        >
                            {descriptor.options.tabBarIcon?.({
                                focused: isFocused,
                                color: isFocused ? activeColor : inactiveColor,
                                size: 20
                            })}
                            <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                                {descriptor.options.title}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </SafeAreaView>
    );
}

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
    safeArea: {
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        zIndex: 40,
        ...SHADOWS.md,
    },
    badge: {
        position: 'absolute',
        top: -48,
        right: 16,
        zIndex: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.xs,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.warning,
        paddingHorizontal: SPACING.sm + 4, // px-3
        paddingVertical: SPACING.sm, // py-2
        ...SHADOWS.lg,
    },
    badgeDot: {
        height: 8,
        width: 8,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.danger,
    },
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        height: 64,
        paddingHorizontal: SPACING.sm,
        backgroundColor: colors.card,
    },
    tabButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
    },
    tabLabel: {
        fontSize: 11,
        fontWeight: '600',
        marginTop: 4,
        color: colors.textSecondary,
    },
    tabLabelActive: {
        color: colors.primary,
        fontWeight: '700',
    },
});