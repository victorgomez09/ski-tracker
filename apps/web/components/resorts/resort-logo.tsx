import React, { useState } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { getResortLogoUrl } from '../../utils/resort-logo';
import { BORDER_RADIUS, useThemeColors } from '../../constants/theme';

interface ResortLogoProps {
    website?: string | null;
    size?: number;
    fallbackEmoji?: string;
    style?: StyleProp<ViewStyle>;
}

export const ResortLogo: React.FC<ResortLogoProps> = ({
    website,
    size = 36,
    fallbackEmoji = '🏔️',
    style,
}) => {
    const colors = useThemeColors();
    const [hasError, setHasError] = useState(false);
    const logoUrl = getResortLogoUrl(website, Math.min(128, Math.max(64, size * 2)));

    const containerStyle = [
        styles.container,
        {
            width: size,
            height: size,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: colors.surface,
            borderColor: colors.border,
        },
        style,
    ];

    if (!logoUrl || hasError) {
        return (
            <View style={containerStyle}>
                <Text style={{ fontSize: size * 0.5 }}>{fallbackEmoji}</Text>
            </View>
        );
    }

    return (
        <View style={containerStyle}>
            <Image
                source={{ uri: logoUrl }}
                style={{
                    width: size * 0.7,
                    height: size * 0.7,
                    borderRadius: BORDER_RADIUS.sm,
                }}
                contentFit="contain"
                cachePolicy="memory-disk"
                onError={() => setHasError(true)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        overflow: 'hidden',
    },
});
