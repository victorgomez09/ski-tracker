import { View, Text, StyleSheet } from "react-native";
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from "../../constants/theme";

export const AltitudeTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        return (
            <View style={styles.container}>
                <Text style={styles.text}>
                    {`${Math.round(Number(payload[0].value))}m Altitude`}
                </Text>
            </View>
        );
    }
    return null;
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: COLORS.textPrimary,
        padding: SPACING.sm,
        borderWidth: 1,
        borderColor: COLORS.textSecondary,
        borderRadius: BORDER_RADIUS.md,
        ...SHADOWS.md,
    },
    text: {
        fontWeight: "600",
        color: COLORS.primary,
        fontSize: 12,
    },
});