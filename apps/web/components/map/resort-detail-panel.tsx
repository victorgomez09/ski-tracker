import { Resort, ResortDetail, Piste } from 'models/ski-resort.model';
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking, Platform, StyleSheet } from 'react-native';
import { Star, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useFavorites } from '../../context/favorites.context';
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from '../../constants/theme';
import { ResortLogo } from '../resorts/resort-logo';

interface ResortDetailPanelProps {
    resort: Resort | ResortDetail;
    onClose: () => void;
}

const getDifficultyMeta = (difficulty: string) => {
    switch (difficulty?.toLowerCase()) {
        case 'novice':
            return { labelKey: 'novice', hex: '#00a859' };
        case 'easy':
            return { labelKey: 'easy', hex: '#0072bc' };
        case 'intermediate':
            return { labelKey: 'intermediate', hex: '#f0141e' };
        case 'advanced':
            return { labelKey: 'expert', hex: '#000000' };
        case 'expert':
            return { labelKey: 'expert', hex: '#000000' };
        default:
            return { labelKey: 'other', hex: '#9ca3af' };
    }
};

const getPisteDistance = (piste: Piste) => {
    const heights = piste.Tags?.elevationProfile?.heights || [];
    const resolution = piste.Tags?.elevationProfile?.resolution || 25;
    if (heights.length > 1) {
        return Math.round((heights.length - 1) * resolution);
    }
    const coords = piste.GeometryGeoJSON?.coordinates || [];
    let dist = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const R = 6371e3;
        const phi1 = p1[1] * Math.PI / 180;
        const phi2 = p2[1] * Math.PI / 180;
        const deltaPhi = (p2[1] - p1[1]) * Math.PI / 180;
        const deltaLambda = (p2[0] - p1[0]) * Math.PI / 180;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        dist += R * c;
    }
    return Math.round(dist);
};

const parseLiftType = (liftType: string, t: any) => {
    switch (liftType?.toLowerCase()) {
        case 'chair_lift': return t('chair_lift');
        case 'drag_lift': return t('drag_lift');
        case 'gondola': return t('gondola');
        case 'cable_car': return t('cable_car');
        case 'funicular': return t('funicular');
        case 'magic_carpet': return t('magic_carpet');
        default: return liftType ? liftType.replace(/_/g, ' ') : t('lift');
    }
};

export const ResortDetailPanel: React.FC<ResortDetailPanelProps> = ({ resort, onClose }) => {
    const { t } = useTranslation();
    const { isFavorite, toggleFavorite } = useFavorites();
    const isWeb = Platform.OS === 'web';
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

    const stats = useMemo(() => {
        const pistes = resort?.pistes || [];
        const lifts = resort?.lifts || [];

        const tagsStats = resort?.Tags?.statistics;
        if (tagsStats) {
            const liftsType = tagsStats.lifts?.byType;

            const difficultyCounts = {
                novice: pistes.filter(p => p.Difficulty?.toLowerCase() === 'novice').length ?? 0,
                easy: pistes.filter(p => p.Difficulty?.toLowerCase() === 'easy').length ?? 0,
                intermediate: pistes.filter(p => p.Difficulty?.toLowerCase() === 'intermediate').length ?? 0,
                advanced: pistes.filter(p => p.Difficulty?.toLowerCase() === 'advanced' || p.Difficulty?.toLowerCase() === 'expert').length ?? 0,
                other: 0
            };

            const difficultyLengths = {
                novice: pistes.filter(p => p.Difficulty?.toLowerCase() === 'novice').reduce((sum, p) => sum + getPisteDistance(p), 0),
                easy: pistes.filter(p => p.Difficulty?.toLowerCase() === 'easy').reduce((sum, p) => sum + getPisteDistance(p), 0),
                intermediate: pistes.filter(p => p.Difficulty?.toLowerCase() === 'intermediate').reduce((sum, p) => sum + getPisteDistance(p), 0),
                advanced: pistes.filter(p => p.Difficulty?.toLowerCase() === 'advanced' || p.Difficulty?.toLowerCase() === 'expert').reduce((sum, p) => sum + getPisteDistance(p), 0),
                other: 0
            };

            const totalPisteLength = difficultyLengths.novice + difficultyLengths.easy + difficultyLengths.intermediate + difficultyLengths.advanced;
            const totalPistes = difficultyCounts.novice + difficultyCounts.easy + difficultyCounts.intermediate + difficultyCounts.advanced;

            const minElev = tagsStats.minElevation ?? tagsStats.runs?.minElevation ?? tagsStats.lifts?.minElevation ?? null;
            const maxElev = tagsStats.maxElevation ?? tagsStats.runs?.maxElevation ?? tagsStats.lifts?.maxElevation ?? null;

            const liftTypeCounts: Record<string, number> = {};
            let totalLifts = 0;
            if (liftsType) {
                Object.entries(liftsType).forEach(([type, data]: [string, any]) => {
                    if (data && typeof data.count === 'number') {
                        liftTypeCounts[type] = data.count;
                        totalLifts += data.count;
                    }
                });
            }

            return {
                totalPistes,
                totalPisteLength: Math.round(totalPisteLength),
                difficultyCounts,
                difficultyLengths,
                minElev: minElev ? Math.round(minElev) : null,
                maxElev: maxElev ? Math.round(maxElev) : null,
                totalLifts,
                totalCapacity: 0,
                totalHourlyCapacity: 0,
                liftTypeCounts
            };
        }

        let totalPisteLength = 0;
        const difficultyCounts = { novice: 0, easy: 0, intermediate: 0, advanced: 0, other: 0 };
        const difficultyLengths = { novice: 0, easy: 0, intermediate: 0, advanced: 0, other: 0 };

        pistes.forEach(p => {
            const len = getPisteDistance(p);
            totalPisteLength += len;
            const diff = p.Difficulty?.toLowerCase() || '';
            if (diff === 'novice') {
                difficultyCounts.novice++;
                difficultyLengths.novice += len;
            } else if (diff === 'easy') {
                difficultyCounts.easy++;
                difficultyLengths.easy += len;
            } else if (diff === 'intermediate') {
                difficultyCounts.intermediate++;
                difficultyLengths.intermediate += len;
            } else if (diff === 'advanced' || diff === 'expert') {
                difficultyCounts.advanced++;
                difficultyLengths.advanced += len;
            } else {
                difficultyCounts.other++;
                difficultyLengths.other += len;
            }
        });

        let minElev = Infinity;
        let maxElev = -Infinity;
        pistes.forEach(p => {
            const coords = p.GeometryGeoJSON?.coordinates || [];
            coords.forEach(coord => {
                if (coord[2] !== undefined && coord[2] > 0) {
                    if (coord[2] < minElev) minElev = coord[2];
                    if (coord[2] > maxElev) maxElev = coord[2];
                }
            });
        });

        if (minElev === Infinity) minElev = resort.Tags?.statistics?.minElevation || 0;
        if (maxElev === -Infinity) maxElev = resort.Tags?.statistics?.maxElevation || 0;

        let totalCapacity = 0;
        let totalHourlyCapacity = 0;
        const liftTypeCounts: Record<string, number> = {};

        lifts.forEach(l => {
            totalCapacity += l.Capacity || 0;
            totalHourlyCapacity += l.CapacityHourly || 0;
            const type = l.LiftType || 'unknown';
            liftTypeCounts[type] = (liftTypeCounts[type] || 0) + 1;
        });

        return {
            totalPistes: pistes.length,
            totalPisteLength: Math.round(totalPisteLength),
            difficultyCounts,
            difficultyLengths,
            minElev: minElev !== Infinity ? Math.round(minElev) : null,
            maxElev: maxElev !== -Infinity ? Math.round(maxElev) : null,
            totalLifts: lifts.length,
            totalCapacity,
            totalHourlyCapacity,
            liftTypeCounts
        };
    }, [resort]);

    const formattedPisteLength = (stats.totalPisteLength / 1000).toFixed(1);

    const difficultyDistribution = useMemo(() => {
        const total = stats.totalPisteLength || 1;
        return [
            { key: 'novice', pct: (stats.difficultyLengths.novice / total) * 100 },
            { key: 'easy', pct: (stats.difficultyLengths.easy / total) * 100 },
            { key: 'intermediate', pct: (stats.difficultyLengths.intermediate / total) * 100 },
            { key: 'advanced', pct: (stats.difficultyLengths.advanced / total) * 100 },
            { key: 'other', pct: (stats.difficultyLengths.other / total) * 100 },
        ].filter(item => item.pct > 0);
    }, [stats]);

    if (!resort) return null;

    return (
        <View style={styles.overlay} pointerEvents="box-none">
            <View style={[styles.modalContainer, isWeb ? styles.panelWeb : styles.panelMobile]}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.header}>
                        <Text style={styles.breadcrumbText}>
                            {resort.Country || t('ski_resort')}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity
                                onPress={() => toggleFavorite(resort as Resort)}
                                style={styles.closeButton}
                            >
                                <Star
                                    size={16}
                                    color={isFavorite(resort.ID) ? '#F59E0B' : colors.textSecondary}
                                    fill={isFavorite(resort.ID) ? '#F59E0B' : 'transparent'}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <X size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.titleRow}>
                        <ResortLogo website={resort.Website} size={44} />
                        <View style={styles.titleInfo}>
                            <Text style={styles.titleText}>{resort.Name}</Text>
                            {resort.Website && (
                                <TouchableOpacity onPress={() => Linking.openURL(resort.Website!)}>
                                    <Text style={styles.websiteText} numberOfLines={1}>
                                        {resort.Website.replace(/^https?:\/\//, '')}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    <View style={styles.statsContainer}>
                        <View style={styles.statBox}>
                            <Text style={styles.statLabel}>{t('distance')}</Text>
                            <Text style={styles.statValue}>{formattedPisteLength} {t('km')}</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statLabel}>{t('lifts')}</Text>
                            <Text style={styles.statValue}>{stats.totalLifts}</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statLabel}>{t('elevation')}</Text>
                            <Text style={styles.statValue}>
                                {stats.minElev && stats.maxElev ? `${stats.minElev}m - ${stats.maxElev}m` : t('n_a')}
                            </Text>
                        </View>
                    </View>

                    {difficultyDistribution.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionHeader}>{t('difficulty_breakdown')}</Text>
                            <View style={styles.barContainer}>
                                {difficultyDistribution.map(item => {
                                    const meta = getDifficultyMeta(item.key);
                                    return (
                                        <View
                                            key={item.key}
                                            style={{
                                                width: `${item.pct}%`,
                                                backgroundColor: meta.hex,
                                                height: '100%',
                                            }}
                                        />
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>{t('pistes')}</Text>
                        <View style={styles.pistesGrid}>
                            {Object.entries(stats.difficultyCounts).map(([diff, count]) => {
                                if (count === 0 && diff === 'other') return null;
                                const meta = getDifficultyMeta(diff);
                                const len = stats.difficultyLengths[diff as keyof typeof stats.difficultyLengths] || 0;
                                return (
                                    <View key={diff} style={styles.pisteCard}>
                                        <View style={[styles.colorDot, { backgroundColor: meta.hex }]} />
                                        <View>
                                            <Text style={styles.pisteCardTitle}>{count} <Text style={styles.pisteCardSubtitle}>{t(meta.labelKey)}</Text></Text>
                                            <Text style={styles.pisteCardLen}>{(len / 1000).toFixed(1)} {t('km')}</Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </View>

                    {stats.totalLifts > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionHeader}>{t('lifts_capacity')}</Text>
                            {stats.totalCapacity > 0 && (
                                <View style={styles.hourlyContainer}>
                                    <Text style={styles.hourlyLabel}>{t('hourly_capacity')}</Text>
                                    <Text style={styles.hourlyValue}>
                                        {stats.totalHourlyCapacity ? t('person_per_hour', { count: stats.totalHourlyCapacity }) : t('n_a')}
                                    </Text>
                                </View>
                            )}
                            <View style={styles.liftsBadgeContainer}>
                                {Object.entries(stats.liftTypeCounts).map(([type, count]) => (
                                    <View key={type} style={styles.liftBadge}>
                                        <Text style={styles.liftBadgeText}>
                                            {count}x {parseLiftType(type, t)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                </ScrollView>
            </View>
        </View>
    );
};

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        zIndex: 50,
    },
    modalContainer: {
        position: 'absolute',
        zIndex: 50,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.xl,
        ...SHADOWS.lg,
    },
    panelWeb: {
        left: 20,
        top: 16,
        bottom: 16,
        width: 380,
        height: 'auto',
    },
    panelMobile: {
        bottom: 16,
        left: 16,
        right: 16,
        maxHeight: '45%',
    },
    scrollContent: {
        flexDirection: 'column',
        gap: SPACING.md,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    breadcrumbText: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    closeButton: {
        padding: 6,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.surface,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    avatarCircle: {
        width: 40,
        height: 40,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.primary,
        ...SHADOWS.sm,
    },
    avatarEmoji: {
        fontSize: 20,
    },
    titleInfo: {
        flex: 1,
    },
    titleText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.textPrimary,
        lineHeight: 28,
    },
    websiteText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.primary,
        textDecorationLine: 'underline',
        textAlign: 'left',
        marginTop: 2,
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.border,
        paddingVertical: 12,
        marginVertical: 4,
    },
    statBox: {
        alignItems: 'center',
        flex: 1,
    },
    statLabel: {
        fontSize: 10,
        color: colors.textSecondary,
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    statValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginTop: 2,
    },
    section: {
        marginVertical: 4,
    },
    sectionHeader: {
        fontSize: 12,
        color: colors.textSecondary,
        textTransform: 'uppercase',
        fontWeight: '600',
        marginBottom: 8,
    },
    barContainer: {
        width: '100%',
        height: 12,
        borderRadius: BORDER_RADIUS.round,
        overflow: 'hidden',
        flexDirection: 'row',
        backgroundColor: colors.surface,
    },
    pistesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    pisteCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.md,
        padding: 10,
        borderWidth: 1,
        borderColor: colors.border,
        width: '48%',
    },
    colorDot: {
        width: 12,
        height: 12,
        borderRadius: BORDER_RADIUS.round,
        marginRight: 8,
    },
    pisteCardTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    pisteCardSubtitle: {
        fontWeight: '500',
        color: colors.textSecondary,
    },
    pisteCardLen: {
        fontSize: 10,
        color: colors.textLight,
        marginTop: 2,
    },
    hourlyContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderColor: colors.border,
        paddingBottom: 8,
        marginBottom: 8,
    },
    hourlyLabel: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    hourlyValue: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    liftsBadgeContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    liftBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: colors.primaryLight,
        borderWidth: 1,
        borderColor: colors.primary,
        borderRadius: BORDER_RADIUS.md,
    },
    liftBadgeText: {
        fontSize: 10,
        color: colors.primaryDark,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
});
