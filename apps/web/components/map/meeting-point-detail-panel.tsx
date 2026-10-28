import React, { useMemo } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
    Clock,
    Crosshair,
    Flag,
    MapPin,
    Navigation,
    Trash2,
    Users,
    X,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from '../../constants/theme';
import { MeetingPoint } from '../../models/meeting-point.model';

interface MeetingPointDetailPanelProps {
    point: MeetingPoint;
    userLocation?: { latitude: number; longitude: number } | null;
    onClose: () => void;
    onNavigate: (point: MeetingPoint) => void;
    onDelete?: (point: MeetingPoint) => void;
}

const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const formatDistance = (km: number): string => {
    if (km < 1) {
        return `${Math.round(km * 1000)} m`;
    }
    return `${km.toFixed(1)} km`;
};

export const MeetingPointDetailPanel: React.FC<MeetingPointDetailPanelProps> = ({
    point,
    userLocation,
    onClose,
    onNavigate,
    onDelete,
}) => {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

    const distanceStr = useMemo(() => {
        if (!userLocation || !userLocation.latitude || !userLocation.longitude) return null;
        const km = getDistanceKm(
            userLocation.latitude,
            userLocation.longitude,
            point.latitude,
            point.longitude
        );
        return formatDistance(km);
    }, [userLocation, point.latitude, point.longitude]);

    const creatorName =
        point.creator?.display_name ||
        `${point.creator?.first_name || ''} ${point.creator?.last_name || ''}`.trim() ||
        t('friend', 'Amigo');
    const creatorInitials = (creatorName[0] || 'U').toUpperCase();

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <View style={styles.iconBadge}>
                        <Flag size={18} color="#ffffff" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title} numberOfLines={1}>
                            {point.title}
                        </Text>
                        <View style={styles.metaRow}>
                            {point.meet_time ? (
                                <View style={styles.timeTag}>
                                    <Clock size={11} color="#b45309" />
                                    <Text style={styles.timeText}>{point.meet_time}</Text>
                                </View>
                            ) : null}
                            <View style={styles.targetAudienceBadge}>
                                <Users size={11} color={colors.textSecondary} />
                                <Text style={styles.targetAudienceText} numberOfLines={1}>
                                    {point.crew?.name || t('friends_group', 'Amigos')}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <X size={18} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>

            {/* Description if present */}
            {point.description ? (
                <Text style={styles.description}>{point.description}</Text>
            ) : null}

            {/* Creator & Distance Info */}
            <View style={styles.infoRow}>
                <View style={styles.creatorInfo}>
                    <View style={styles.creatorAvatar}>
                        {point.creator?.avatar_url ? (
                            <Image
                                source={{ uri: point.creator.avatar_url }}
                                style={{ width: '100%', height: '100%' }}
                            />
                        ) : (
                            <Text style={styles.creatorInitials}>{creatorInitials}</Text>
                        )}
                    </View>
                    <View>
                        <Text style={styles.createdByLabel}>{t('created_by', 'Fijado por')}</Text>
                        <Text style={styles.creatorNameText} numberOfLines={1}>
                            {creatorName}
                        </Text>
                    </View>
                </View>

                {distanceStr && (
                    <View style={styles.distanceBadge}>
                        <Crosshair size={12} color={colors.primary} />
                        <Text style={styles.distanceText}>{distanceStr}</Text>
                    </View>
                )}
            </View>

            {/* Actions */}
            <View style={styles.actionsRow}>
                <TouchableOpacity
                    style={styles.navigateBtn}
                    onPress={() => onNavigate(point)}
                    activeOpacity={0.8}
                >
                    <Navigation size={14} color="#ffffff" />
                    <Text style={styles.navigateBtnText}>
                        {t('route_to_meeting_point', 'Cómo llegar')}
                    </Text>
                </TouchableOpacity>

                {point.can_delete && onDelete && (
                    <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => onDelete(point)}
                        activeOpacity={0.8}
                    >
                        <Trash2 size={16} color={colors.danger} />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

const getStyles = (colors: typeof LIGHT_COLORS) =>
    StyleSheet.create({
        container: {
            position: 'absolute',
            bottom: SPACING.md,
            left: SPACING.md,
            right: SPACING.md,
            backgroundColor: colors.card,
            borderRadius: BORDER_RADIUS.xl,
            padding: SPACING.md,
            borderWidth: 1,
            borderColor: colors.border,
            ...SHADOWS.lg,
            zIndex: 100,
            gap: 12,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
        },
        headerLeft: {
            flexDirection: 'row',
            gap: 10,
            flex: 1,
            marginRight: 8,
        },
        iconBadge: {
            width: 38,
            height: 38,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: '#f59e0b',
            alignItems: 'center',
            justifyContent: 'center',
            ...SHADOWS.sm,
        },
        title: {
            fontSize: 16,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        metaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginTop: 4,
            flexWrap: 'wrap',
        },
        timeTag: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: '#fef3c7',
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: BORDER_RADIUS.round,
            borderWidth: 1,
            borderColor: '#fde68a',
        },
        timeText: {
            fontSize: 11,
            fontWeight: '700',
            color: '#b45309',
        },
        targetAudienceBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.surface,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: BORDER_RADIUS.round,
            borderWidth: 1,
            borderColor: colors.border,
        },
        targetAudienceText: {
            fontSize: 11,
            color: colors.textSecondary,
            fontWeight: '600',
        },
        closeBtn: {
            padding: 4,
        },
        description: {
            fontSize: 13,
            color: colors.textSecondary,
            lineHeight: 18,
        },
        infoRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: colors.background,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: BORDER_RADIUS.md,
            borderWidth: 1,
            borderColor: colors.border,
        },
        creatorInfo: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            flex: 1,
        },
        creatorAvatar: {
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.primary,
        },
        creatorInitials: {
            fontSize: 11,
            fontWeight: 'bold',
            color: colors.primaryDark,
        },
        createdByLabel: {
            fontSize: 9,
            color: colors.textSecondary,
            textTransform: 'uppercase',
            fontWeight: '600',
        },
        creatorNameText: {
            fontSize: 12,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        distanceBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.surface,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: BORDER_RADIUS.sm,
            borderWidth: 1,
            borderColor: colors.primary,
        },
        distanceText: {
            fontSize: 12,
            fontWeight: 'bold',
            color: colors.primaryDark,
        },
        actionsRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
        },
        navigateBtn: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            backgroundColor: colors.primary,
            paddingVertical: 10,
            borderRadius: BORDER_RADIUS.md,
            ...SHADOWS.sm,
        },
        navigateBtnText: {
            fontSize: 13,
            fontWeight: 'bold',
            color: '#ffffff',
        },
        deleteBtn: {
            padding: 10,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: '#fef2f2',
            borderWidth: 1,
            borderColor: '#fecaca',
            alignItems: 'center',
            justifyContent: 'center',
        },
    });
