import React, { useMemo } from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    Crosshair,
    Footprints,
    MapPin,
    Navigation,
    Route,
    X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from '../../constants/theme';
import { RouteLeg, RouteResult, SkillLevel } from '../../utils/ski-routing.util';

interface RouteNavigationPanelProps {
    route: RouteResult;
    resortName?: string;
    onClose: () => void;
    onFitBounds?: () => void;
    onChangeOrigin?: () => void;
    currentLevel?: SkillLevel;
    onLevelChange?: (level: SkillLevel) => void;
    onSelectLeg?: (leg: RouteLeg) => void;
}

const getDifficultyMeta = (difficulty?: string) => {
    switch (difficulty?.toLowerCase()) {
        case 'novice':
            return { labelKey: 'novice', hex: '#00a859' };
        case 'easy':
            return { labelKey: 'easy', hex: '#0072bc' };
        case 'intermediate':
            return { labelKey: 'intermediate', hex: '#f0141e' };
        case 'advanced':
        case 'expert':
            return { labelKey: 'expert', hex: '#000000' };
        default:
            return { labelKey: 'other', hex: '#64748b' };
    }
};

const formatDuration = (totalSeconds: number): string => {
    const mins = Math.round(totalSeconds / 60);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
};

const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${meters} m`;
    return `${(meters / 1000).toFixed(1)} km`;
};

export const RouteNavigationPanel: React.FC<RouteNavigationPanelProps> = ({
    route,
    resortName,
    onClose,
    onFitBounds,
    onChangeOrigin,
    currentLevel = 'all',
    onLevelChange,
    onSelectLeg,
}) => {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const isWeb = Platform.OS === 'web';
    const styles = useMemo(() => getStyles(colors), [colors]);

    const difficultyDistribution = useMemo(() => {
        const { novice, easy, intermediate, advanced } = route.difficultyBreakdown;
        return [
            { key: 'novice', pct: novice },
            { key: 'easy', pct: easy },
            { key: 'intermediate', pct: intermediate },
            { key: 'advanced', pct: advanced },
        ].filter((item) => item.pct > 0);
    }, [route.difficultyBreakdown]);

    return (
        <View style={styles.overlay} pointerEvents="box-none">
            <View style={[styles.panel, isWeb ? styles.panelWeb : styles.panelMobile]}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header with Breadcrumb and Actions */}
                    <View style={styles.header}>
                        <View style={styles.breadcrumbContainer}>
                            <Route size={14} color={colors.primary} />
                            <Text style={styles.breadcrumbText}>
                                {resortName || t('ski_resort', 'Estación')} › {t('route_navigation', 'Indicaciones GPS')}
                            </Text>
                        </View>
                        <View style={styles.headerActions}>
                            {onFitBounds && (
                                <TouchableOpacity
                                    onPress={onFitBounds}
                                    style={styles.iconButton}
                                    accessibilityLabel={t('fit_route', 'Centrar ruta')}
                                >
                                    <Crosshair size={16} color={colors.textSecondary} />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                                <X size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Origin -> Destination Box */}
                    <View style={styles.routePointsBox}>
                        <View style={styles.pointRow}>
                            <View style={[styles.pointDot, { backgroundColor: '#16a34a' }]} />
                            <Text style={styles.pointLabel}>{t('from', 'Desde')}:</Text>
                            <Text style={styles.pointValue} numberOfLines={1}>
                                {route.originName || t('origin_current_gps', 'Mi posición actual')}
                            </Text>
                            {onChangeOrigin && (
                                <TouchableOpacity onPress={onChangeOrigin} style={styles.changePointBtn}>
                                    <Text style={styles.changePointText}>{t('change', 'Cambiar')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <View style={styles.pointDivider} />
                        <View style={styles.pointRow}>
                            <View style={[styles.pointDot, { backgroundColor: '#dc2626' }]} />
                            <Text style={styles.pointLabel}>{t('to', 'Hasta')}:</Text>
                            <Text style={styles.pointValue} numberOfLines={1}>
                                {route.destinationName}
                            </Text>
                        </View>
                    </View>

                    {/* Skill Level Selector Pills */}
                    {onLevelChange && (
                        <View style={styles.levelFilterRow}>
                            <TouchableOpacity
                                style={[
                                    styles.levelChip,
                                    currentLevel === 'all' && styles.levelChipActive,
                                ]}
                                onPress={() => onLevelChange('all')}
                            >
                                <Text
                                    style={[
                                        styles.levelChipText,
                                        currentLevel === 'all' && styles.levelChipTextActive,
                                    ]}
                                >
                                    {t('skill_all', 'Todas')}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.levelChip,
                                    currentLevel === 'noblack' && styles.levelChipActive,
                                ]}
                                onPress={() => onLevelChange('noblack')}
                            >
                                <Text
                                    style={[
                                        styles.levelChipText,
                                        currentLevel === 'noblack' && styles.levelChipTextActive,
                                    ]}
                                >
                                    {t('skill_noblack', 'Evitar negras')}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.levelChip,
                                    currentLevel === 'easy' && styles.levelChipActive,
                                ]}
                                onPress={() => onLevelChange('easy')}
                            >
                                <Text
                                    style={[
                                        styles.levelChipText,
                                        currentLevel === 'easy' && styles.levelChipTextActive,
                                    ]}
                                >
                                    {t('skill_easy', 'Solo fáciles')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Stats Container (Resembling resort-detail-panel) */}
                    <View style={styles.statsContainer}>
                        <View style={styles.statBox}>
                            <Text style={styles.statLabel}>{t('estimated_time', 'Tiempo')}</Text>
                            <Text style={[styles.statValue, { color: colors.primary }]}>
                                {formatDuration(route.totalDurationSeconds)}
                            </Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statLabel}>{t('distance', 'Distancia')}</Text>
                            <Text style={styles.statValue}>
                                {formatDistance(route.totalDistanceMeters)}
                            </Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statLabel}>{t('pistes', 'Pistas')}</Text>
                            <Text style={styles.statValue}>{route.pistesCount}</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statLabel}>{t('lifts', 'Remontes')}</Text>
                            <Text style={styles.statValue}>{route.liftsCount}</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statLabel}>{t('drop', 'Desnivel')}</Text>
                            <Text style={styles.statValue}>
                                -{route.totalDescentMeters}m
                            </Text>
                        </View>
                    </View>

                    {/* Difficulty breakdown bar */}
                    {difficultyDistribution.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionHeader}>{t('difficulty_breakdown', 'Dificultad de la ruta')}</Text>
                            <View style={styles.barContainer}>
                                {difficultyDistribution.map((item) => {
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

                    {/* Step-by-Step Directions */}
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>{t('step_by_step_directions', 'Indicaciones paso a paso')}</Text>
                        <View style={styles.stepList}>
                            {route.legs.map((leg, index) => {
                                const diffMeta = leg.kind === 'run' ? getDifficultyMeta(leg.difficulty) : null;
                                return (
                                    <TouchableOpacity
                                        key={`leg-${index}`}
                                        style={styles.stepItem}
                                        activeOpacity={0.7}
                                        onPress={() => onSelectLeg?.(leg)}
                                    >
                                        <View style={styles.stepIndicatorCol}>
                                            {leg.kind === 'run' ? (
                                                <View style={[styles.stepDot, { backgroundColor: diffMeta?.hex || '#0072bc' }]} />
                                            ) : leg.kind === 'lift' ? (
                                                <View style={styles.stepLiftBadge}>
                                                    <Text style={styles.stepLiftEmoji}>🚠</Text>
                                                </View>
                                            ) : (
                                                <View style={styles.stepWalkBadge}>
                                                    <Footprints size={12} color={colors.textSecondary} />
                                                </View>
                                            )}
                                            {index < route.legs.length - 1 && <View style={styles.stepLine} />}
                                        </View>

                                        <View style={styles.stepContent}>
                                            <View style={styles.stepTitleRow}>
                                                <Text style={styles.stepTitle}>{leg.instruction}</Text>
                                            </View>
                                            <View style={styles.stepMetaRow}>
                                                <Text style={styles.stepMetaText}>
                                                    {formatDistance(leg.distanceMeters)} · ~{formatDuration(leg.durationSeconds)}
                                                </Text>
                                                {leg.descentMeters > 0 && (
                                                    <Text style={[styles.stepMetaText, { color: '#0284c7' }]}>
                                                        ↓ {leg.descentMeters}m
                                                    </Text>
                                                )}
                                                {leg.ascentMeters > 0 && (
                                                    <Text style={[styles.stepMetaText, { color: '#16a34a' }]}>
                                                        ↑ {leg.ascentMeters}m
                                                    </Text>
                                                )}
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}

                            {/* Destination Arrival Item */}
                            <View style={styles.stepItem}>
                                <View style={styles.stepIndicatorCol}>
                                    <View style={[styles.stepDot, { backgroundColor: '#dc2626', width: 14, height: 14 }]}>
                                        <MapPin size={9} color="#FFFFFF" />
                                    </View>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={[styles.stepTitle, { fontWeight: '700' }]}>
                                        {t('arrival_at', 'Llegada a')} {route.destinationName}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Bottom Action Buttons */}
                    <View style={styles.bottomActions}>
                        {onFitBounds && (
                            <TouchableOpacity style={styles.primaryActionBtn} onPress={onFitBounds}>
                                <Navigation size={15} color="#FFFFFF" />
                                <Text style={styles.primaryActionBtnText}>{t('fit_route', 'Centrar ruta')}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.secondaryActionBtn} onPress={onClose}>
                            <Text style={styles.secondaryActionBtnText}>{t('finish_route', 'Cerrar ruta')}</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </View>
        </View>
    );
};

const getStyles = (colors: typeof LIGHT_COLORS) =>
    StyleSheet.create({
        overlay: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'transparent',
            zIndex: 50,
        },
        panel: {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            padding: SPACING.md,
            borderRadius: BORDER_RADIUS.xl,
            ...SHADOWS.lg,
            display: 'flex',
            position: 'absolute',
        },
        panelWeb: {
            left: 20,
            top: 16,
            bottom: 16,
            width: 380,
            maxHeight: 'calc(100vh - 32px)' as any,
        },
        panelMobile: {
            bottom: 16,
            left: 16,
            right: 16,
            maxHeight: '60%',
        },
        scrollContent: {
            flexDirection: 'column',
            gap: SPACING.md,
            paddingBottom: SPACING.md,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        breadcrumbContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            flex: 1,
        },
        breadcrumbText: {
            fontSize: 12,
            color: colors.textSecondary,
            fontWeight: '600',
        },
        headerActions: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        iconButton: {
            padding: 6,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
        },
        routePointsBox: {
            backgroundColor: colors.surface,
            borderRadius: BORDER_RADIUS.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: SPACING.sm,
            gap: 6,
        },
        pointRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        pointDot: {
            width: 10,
            height: 10,
            borderRadius: 5,
            flexShrink: 0,
        },
        pointLabel: {
            fontSize: 11,
            fontWeight: '600',
            color: colors.textSecondary,
            width: 40,
        },
        pointValue: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.textPrimary,
            flex: 1,
        },
        changePointBtn: {
            paddingHorizontal: 8,
            paddingVertical: 2,
            backgroundColor: colors.border,
            borderRadius: 999,
        },
        changePointText: {
            fontSize: 10,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        pointDivider: {
            height: 1,
            backgroundColor: colors.border,
            marginLeft: 18,
        },
        levelFilterRow: {
            flexDirection: 'row',
            gap: 8,
        },
        levelChip: {
            flex: 1,
            paddingVertical: 6,
            paddingHorizontal: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
        },
        levelChipActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        levelChipText: {
            fontSize: 11,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        levelChipTextActive: {
            color: '#FFFFFF',
        },
        statsContainer: {
            flexDirection: 'row',
            gap: SPACING.xs,
        },
        statBox: {
            flex: 1,
            backgroundColor: colors.surface,
            padding: SPACING.xs,
            borderRadius: BORDER_RADIUS.md,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
        },
        statLabel: {
            fontSize: 10,
            color: colors.textSecondary,
            marginBottom: 2,
            textAlign: 'center',
        },
        statValue: {
            fontSize: 12,
            fontWeight: '700',
            color: colors.textPrimary,
            textAlign: 'center',
        },
        section: {
            gap: 8,
        },
        sectionHeader: {
            fontSize: 13,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        barContainer: {
            flexDirection: 'row',
            height: 6,
            borderRadius: 3,
            overflow: 'hidden',
            backgroundColor: colors.border,
            width: '100%',
        },
        stepList: {
            gap: 0,
        },
        stepItem: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
            paddingVertical: 6,
        },
        stepIndicatorCol: {
            alignItems: 'center',
            width: 20,
        },
        stepDot: {
            width: 12,
            height: 12,
            borderRadius: 6,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 2,
        },
        stepLiftBadge: {
            width: 20,
            height: 20,
            borderRadius: 4,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        stepLiftEmoji: {
            fontSize: 11,
        },
        stepWalkBadge: {
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            borderStyle: 'dashed',
            alignItems: 'center',
            justifyContent: 'center',
        },
        stepLine: {
            width: 2,
            flex: 1,
            minHeight: 18,
            backgroundColor: colors.border,
            marginVertical: 2,
        },
        stepContent: {
            flex: 1,
            paddingTop: 1,
        },
        stepTitleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        stepTitle: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.textPrimary,
            lineHeight: 17,
        },
        stepMetaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginTop: 3,
        },
        stepMetaText: {
            fontSize: 11,
            color: colors.textSecondary,
        },
        bottomActions: {
            flexDirection: 'row',
            gap: 8,
            marginTop: SPACING.xs,
        },
        primaryActionBtn: {
            flex: 1,
            backgroundColor: colors.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: BORDER_RADIUS.lg,
            ...SHADOWS.sm,
        },
        primaryActionBtnText: {
            color: '#FFFFFF',
            fontSize: 13,
            fontWeight: '600',
        },
        secondaryActionBtn: {
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: BORDER_RADIUS.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
        },
        secondaryActionBtnText: {
            color: colors.textSecondary,
            fontSize: 13,
            fontWeight: '600',
        },
    });
