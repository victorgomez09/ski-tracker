import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform } from 'react-native';
import { Flag, Clock } from 'lucide-react-native';
import { BORDER_RADIUS, SHADOWS, SPACING, useThemeColors } from '../../constants/theme';
import { MeetingPoint } from '../../models/meeting-point.model';

let MarkerComponent: any = View;
if (Platform.OS !== 'web') {
    MarkerComponent = require('@maplibre/maplibre-react-native').Marker;
}

interface MeetingPointMarkerProps {
    point: MeetingPoint;
    onPress: (point: MeetingPoint) => void;
}

export const MeetingPointMarker: React.FC<MeetingPointMarkerProps> = ({ point, onPress }) => {
    const colors = useThemeColors();

    if (!point.latitude || !point.longitude) {
        return null;
    }

    const content = (
        <TouchableOpacity
            style={styles.container}
            activeOpacity={0.8}
            onPress={() => onPress(point)}
        >
            <View style={styles.pinWrapper}>
                <View style={styles.bubble}>
                    <Flag size={13} color="#ffffff" />
                    {point.meet_time ? (
                        <View style={styles.timeTag}>
                            <Clock size={8} color="#ffffff" />
                            <Text style={styles.timeText}>{point.meet_time}</Text>
                        </View>
                    ) : null}
                </View>
                <View style={styles.triangle} />
            </View>

            <View style={[styles.nameTag, { backgroundColor: colors.surface }]}>
                <Text style={[styles.nameText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {point.title}
                </Text>
            </View>
        </TouchableOpacity>
    );

    if (Platform.OS === 'web') {
        // On web, React-Map-GL Marker wrapper is rendered by the parent map component or custom marker
        return content;
    }

    return (
        <MarkerComponent
            id={`meeting-point-${point.id}`}
            lngLat={[point.longitude, point.latitude]}
        >
            {content}
        </MarkerComponent>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    pinWrapper: {
        alignItems: 'center',
    },
    bubble: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#f59e0b',
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: BORDER_RADIUS.round,
        borderWidth: 2,
        borderColor: '#ffffff',
        ...SHADOWS.md,
    },
    timeTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(0,0,0,0.25)',
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: BORDER_RADIUS.round,
    },
    timeText: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    triangle: {
        width: 0,
        height: 0,
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderLeftWidth: 5,
        borderRightWidth: 5,
        borderBottomWidth: 0,
        borderTopWidth: 6,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: '#f59e0b',
        marginTop: -1,
    },
    nameTag: {
        marginTop: 2,
        paddingHorizontal: SPACING.xs,
        paddingVertical: 1,
        borderRadius: BORDER_RADIUS.sm,
        maxWidth: 100,
        ...SHADOWS.sm,
    },
    nameText: {
        fontSize: 10,
        fontWeight: '700',
    },
});
