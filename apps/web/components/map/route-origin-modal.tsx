import React from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Crosshair, MapPin, Navigation, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from '../../constants/theme';
import { Piste } from 'models/ski-resort.model';

interface RouteOriginModalProps {
    visible: boolean;
    onClose: () => void;
    targetPiste: Piste | null;
    onSelectCurrentLocation: () => void;
    onSelectPickOnMap: () => void;
    isLoadingLocation?: boolean;
}

export const RouteOriginModal: React.FC<RouteOriginModalProps> = ({
    visible,
    onClose,
    targetPiste,
    onSelectCurrentLocation,
    onSelectPickOnMap,
    isLoadingLocation = false,
}) => {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const styles = React.useMemo(() => getStyles(colors), [colors]);

    if (!visible || !targetPiste) return null;

    return (
        <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View
                    style={[
                        styles.panel,
                        Platform.OS === 'web' ? styles.panelWeb : styles.panelMobile,
                    ]}
                >
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{t('calculate_route', 'Calcular Ruta')}</Text>
                            <Text style={styles.subtitle} numberOfLines={1}>
                                {t('destination', 'Destino')}: {targetPiste.Name || 'Pista'}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <X size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.promptText}>
                        {t('choose_origin_prompt', '¿Desde dónde deseas calcular el trayecto?')}
                    </Text>

                    <View style={styles.optionsContainer}>
                        {/* Option 1: Current GPS Position */}
                        <TouchableOpacity
                            style={styles.optionCard}
                            onPress={onSelectCurrentLocation}
                            disabled={isLoadingLocation}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.iconCircle, { backgroundColor: '#16a34a15' }]}>
                                {isLoadingLocation ? (
                                    <ActivityIndicator size="small" color="#16a34a" />
                                ) : (
                                    <Crosshair size={22} color="#16a34a" />
                                )}
                            </View>
                            <View style={styles.optionInfo}>
                                <Text style={styles.optionTitle}>
                                    {t('origin_current_gps', 'Mi posición actual (GPS)')}
                                </Text>
                                <Text style={styles.optionSubtitle}>
                                    {isLoadingLocation
                                        ? t('getting_gps', 'Obteniendo ubicación GPS...')
                                        : t('origin_current_gps_desc', 'Ruta desde donde te encuentras ahora mismo')}
                                </Text>
                            </View>
                            <Navigation size={16} color={colors.textSecondary} />
                        </TouchableOpacity>

                        {/* Option 2: Pick point on map */}
                        <TouchableOpacity
                            style={styles.optionCard}
                            onPress={onSelectPickOnMap}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
                                <MapPin size={22} color={colors.primary} />
                            </View>
                            <View style={styles.optionInfo}>
                                <Text style={styles.optionTitle}>
                                    {t('origin_pick_map', 'Elegir origen en el mapa')}
                                </Text>
                                <Text style={styles.optionSubtitle}>
                                    {t('origin_pick_map_desc', 'Toca cualquier punto o pista en el mapa como salida')}
                                </Text>
                            </View>
                            <Navigation size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const getStyles = (colors: typeof LIGHT_COLORS) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: SPACING.md,
        },
        panel: {
            backgroundColor: colors.card,
            borderRadius: BORDER_RADIUS.xl,
            padding: SPACING.lg,
            ...SHADOWS.lg,
            gap: SPACING.md,
        },
        panelWeb: {
            width: 420,
        },
        panelMobile: {
            width: '95%',
            maxWidth: 420,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
        },
        title: {
            fontSize: 18,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        subtitle: {
            fontSize: 12,
            color: colors.textSecondary,
            marginTop: 2,
        },
        closeButton: {
            padding: 4,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surface,
        },
        promptText: {
            fontSize: 13,
            color: colors.textPrimary,
            fontWeight: '500',
        },
        optionsContainer: {
            gap: SPACING.sm,
        },
        optionCard: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.lg,
            padding: SPACING.md,
            gap: SPACING.md,
        },
        iconCircle: {
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        },
        optionInfo: {
            flex: 1,
        },
        optionTitle: {
            fontSize: 14,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        optionSubtitle: {
            fontSize: 11,
            color: colors.textSecondary,
            marginTop: 2,
            lineHeight: 14,
        },
    });
