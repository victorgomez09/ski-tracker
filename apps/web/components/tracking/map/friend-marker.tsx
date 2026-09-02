import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { Image } from 'expo-image';
import { BORDER_RADIUS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';

export interface FriendLocation {
    id: string;
    display_name?: string;
    first_name?: string;
    avatar_url?: string | null;
    last_latitude?: number | null;
    last_longitude?: number | null;
}

interface FriendMarkerProps {
    friend: FriendLocation;
}

export const FriendMarker: React.FC<FriendMarkerProps> = ({ friend }) => {
    const colors = useThemeColors();

    if (!friend.last_longitude || !friend.last_latitude) {
        return null;
    }

    const initials = ((friend.display_name || friend.first_name || 'U')[0]).toUpperCase();
    const displayName = friend.display_name || friend.first_name;

    return (
        <Marker
            id={`friend-marker-${friend.id}`}
            lngLat={[friend.last_longitude, friend.last_latitude]}
        >
            <View style={styles.friendMarkerContainer}>
                {friend.avatar_url ? (
                    <Image
                        source={{ uri: friend.avatar_url }}
                        style={[styles.friendMarkerAvatar, { borderColor: colors.primary }]}
                    />
                ) : (
                    <View style={[styles.friendMarkerInitialsContainer, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.friendMarkerInitials, { color: colors.textOnPrimary }]}>
                            {initials}
                        </Text>
                    </View>
                )}
                <View style={[styles.friendMarkerNameTag, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.friendMarkerNameText, { color: colors.textPrimary }]} numberOfLines={1}>
                        {displayName}
                    </Text>
                </View>
            </View>
        </Marker>
    );
};

const styles = StyleSheet.create({
    friendMarkerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    friendMarkerAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 2,
    },
    friendMarkerInitialsContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        ...SHADOWS.sm,
    },
    friendMarkerInitials: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    friendMarkerNameTag: {
        marginTop: 2,
        paddingHorizontal: SPACING.xs,
        paddingVertical: 1,
        borderRadius: BORDER_RADIUS.sm,
        maxWidth: 80,
        ...SHADOWS.sm,
    },
    friendMarkerNameText: {
        fontSize: 10,
        fontWeight: '600',
    },
});
