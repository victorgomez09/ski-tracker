import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AlertTriangle, Camera as CameraIcon, Download, Pause, Play, Square } from 'lucide-react-native';
import { BORDER_RADIUS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';

interface TrackingControlsProps {
    isTracking: boolean;
    isPaused: boolean;
    isStartingTracking: boolean;
    hasTrackData: boolean;
    hasOfflinePacks: boolean;
    onToggleTracking: () => void;
    onTogglePause: () => void;
    onSOS: () => void;
    onOpenCamera: () => void;
    onOpenOfflineModal: () => void;
}

export const TrackingControls: React.FC<TrackingControlsProps> = ({
    isTracking,
    isPaused,
    isStartingTracking,
    hasTrackData,
    hasOfflinePacks,
    onToggleTracking,
    onTogglePause,
    onSOS,
    onOpenCamera,
    onOpenOfflineModal,
}) => {
    const colors = useThemeColors();

    return (
        <View style={styles.floatingControls}>
            {isTracking && (
                <>
                    <TouchableOpacity
                        style={[styles.iconButton, { backgroundColor: '#e11d48', borderColor: '#be123c' }]}
                        onPress={onSOS}
                    >
                        <AlertTriangle size={20} color={colors.textOnPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.iconButton,
                            { backgroundColor: colors.primary, borderColor: colors.primaryDark, marginTop: 10 },
                        ]}
                        onPress={onOpenCamera}
                    >
                        <CameraIcon size={20} color={colors.textOnPrimary} />
                    </TouchableOpacity>
                </>
            )}

            <TouchableOpacity
                style={[
                    styles.trackingButton,
                    isTracking
                        ? { backgroundColor: colors.danger, borderColor: colors.danger }
                        : { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={onToggleTracking}
                disabled={isStartingTracking}
            >
                {isStartingTracking ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                ) : isTracking ? (
                    <Square size={20} color={colors.textOnPrimary} />
                ) : (
                    <Play size={20} color={colors.primary} />
                )}
            </TouchableOpacity>

            {isTracking && (
                <TouchableOpacity
                    style={[
                        styles.trackingButton,
                        {
                            backgroundColor: isPaused ? colors.success : colors.warning,
                            borderColor: isPaused ? colors.success : colors.warning,
                        },
                    ]}
                    onPress={onTogglePause}
                >
                    {isPaused ? (
                        <Play size={20} color={colors.textOnPrimary} />
                    ) : (
                        <Pause size={20} color={colors.textOnPrimary} />
                    )}
                </TouchableOpacity>
            )}

            {!hasTrackData && (
                <TouchableOpacity
                    onPress={onOpenOfflineModal}
                    style={[styles.offlineButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                    <Download size={18} color={colors.primary} />
                    {hasOfflinePacks && <View style={[styles.notificationDot, { backgroundColor: colors.success }]} />}
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    floatingControls: {
        flexDirection: 'row',
        gap: SPACING.xs,
        position: 'absolute',
        zIndex: 50,
        bottom: 16,
        right: 16,
    },
    iconButton: {
        borderWidth: 1,
        padding: 12,
        borderRadius: BORDER_RADIUS.md,
        ...SHADOWS.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    trackingButton: {
        borderWidth: 1,
        padding: 12,
        borderRadius: BORDER_RADIUS.md,
        ...SHADOWS.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    offlineButton: {
        borderWidth: 1,
        padding: 12,
        borderRadius: BORDER_RADIUS.md,
        ...SHADOWS.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    notificationDot: {
        width: 8,
        height: 8,
        borderRadius: BORDER_RADIUS.round,
    },
});
