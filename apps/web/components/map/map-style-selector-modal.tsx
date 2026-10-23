import React from 'react';
import {
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Check, Globe, Layers, Map, MapPin, Moon, Mountain, Navigation, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';
import { MAP_STYLES, MapStyleId, MapStyleOption } from 'constants/map-styles';

interface MapStyleSelectorModalProps {
    visible: boolean;
    onClose: () => void;
    selectedStyle: MapStyleId;
    onSelect: (styleId: MapStyleId) => void;
    is3DMode?: boolean;
    onToggle3D?: (enabled: boolean) => void;
    isPoiEnabled?: boolean;
    onTogglePoi?: (enabled: boolean) => void;
}

export const MapStyleSelectorModal: React.FC<MapStyleSelectorModalProps> = ({
    visible,
    onClose,
    selectedStyle,
    onSelect,
    is3DMode = false,
    onToggle3D,
    isPoiEnabled = true,
    onTogglePoi,
}) => {
    const colors = useThemeColors();
    const { t } = useTranslation();
    const styles = React.useMemo(() => getStyles(colors), [colors]);

    const styleList = React.useMemo(() => Object.values(MAP_STYLES), []);

    const renderIcon = (id: MapStyleId, isSelected: boolean) => {
        const iconColor = isSelected ? colors.primary : colors.textPrimary;
        const iconSize = 22;
        switch (id) {
            case 'outdoor':
                return <Mountain size={iconSize} color={iconColor} />;
            case 'topo':
                return <Map size={iconSize} color={iconColor} />;
            case 'satellite':
                return <Globe size={iconSize} color={iconColor} />;
            case 'streets':
                return <Navigation size={iconSize} color={iconColor} />;
            case 'dark':
                return <Moon size={iconSize} color={iconColor} />;
            default:
                return <Layers size={iconSize} color={iconColor} />;
        }
    };

    const handleSelect = (id: MapStyleId) => {
        onSelect(id);
        onClose();
    };

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
                            <Text style={styles.title}>{t('map_style_title', 'Capas del Mapa')}</Text>
                            <Text style={styles.subtitle}>
                                {t('map_style_subtitle', 'Elige el estilo visual óptimo para tu entorno y actividad')}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            style={styles.closeButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <X size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* 3D Elevation Toggle Card */}
                        {onToggle3D && (
                            <View style={styles.elevation3DCard}>
                                <View style={styles.elevation3DIcon}>
                                    <Mountain size={22} color={is3DMode ? colors.primary : colors.textSecondary} />
                                </View>
                                <View style={styles.elevation3DInfo}>
                                    <Text style={styles.elevation3DTitle}>
                                        {t('terrain_3d', 'Relieve y elevaciones 3D')}
                                    </Text>
                                    <Text style={styles.elevation3DDesc}>
                                        {t('terrain_3d_desc', 'Visualiza el terreno y las montañas con elevación 3D realista')}
                                    </Text>
                                </View>
                                <Switch
                                    value={is3DMode}
                                    onValueChange={onToggle3D}
                                    trackColor={{ false: colors.border, true: colors.primary }}
                                    thumbColor="#FFFFFF"
                                />
                            </View>
                        )}

                        {/* POI Layer Toggle Card */}
                        {onTogglePoi && (
                            <View style={styles.elevation3DCard}>
                                <View style={styles.elevation3DIcon}>
                                    <MapPin size={22} color={isPoiEnabled ? colors.primary : colors.textSecondary} />
                                </View>
                                <View style={styles.elevation3DInfo}>
                                    <Text style={styles.elevation3DTitle}>
                                        {t('pois_layer', 'Puntos de interés (POIs)')}
                                    </Text>
                                    <Text style={styles.elevation3DDesc}>
                                        {t('pois_layer_desc', 'Restaurantes, cafeterías, aseos, taquillas y servicios')}
                                    </Text>
                                </View>
                                <Switch
                                    value={isPoiEnabled}
                                    onValueChange={onTogglePoi}
                                    trackColor={{ false: colors.border, true: colors.primary }}
                                    thumbColor="#FFFFFF"
                                />
                            </View>
                        )}

                        <Text style={styles.sectionTitle}>{t('base_maps', 'Estilo de Mapa')}</Text>

                        {styleList.map((option: MapStyleOption) => {
                            const isSelected = option.id === selectedStyle;

                            return (
                                <TouchableOpacity
                                    key={option.id}
                                    style={[
                                        styles.itemCard,
                                        isSelected && styles.itemCardSelected,
                                    ]}
                                    onPress={() => handleSelect(option.id)}
                                    activeOpacity={0.7}
                                >
                                    <View
                                        style={[
                                            styles.iconContainer,
                                            isSelected && { backgroundColor: colors.primary + '15' },
                                        ]}
                                    >
                                        {renderIcon(option.id, isSelected)}
                                    </View>

                                    <View style={styles.itemInfo}>
                                        <View style={styles.itemTitleRow}>
                                            <Text
                                                style={[
                                                    styles.itemLabel,
                                                    isSelected && { color: colors.primary, fontWeight: '700' },
                                                ]}
                                            >
                                                {t(option.labelKey, option.defaultLabel)}
                                            </Text>
                                            {isSelected && (
                                                <View style={styles.checkCircle}>
                                                    <Check size={14} color="#FFFFFF" strokeWidth={3} />
                                                </View>
                                            )}
                                        </View>

                                        <Text style={styles.itemDescription}>
                                            {t(option.descriptionKey, option.defaultDescription)}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const getStyles = (colors: any) =>
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
            padding: SPACING.md,
            ...SHADOWS.lg,
            maxHeight: '85%',
        },
        panelWeb: {
            width: 440,
        },
        panelMobile: {
            width: '95%',
            maxWidth: 440,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: SPACING.md,
            gap: SPACING.sm,
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
            lineHeight: 16,
        },
        closeButton: {
            padding: 4,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surface,
        },
        scroll: {
            flexGrow: 0,
        },
        scrollContent: {
            gap: SPACING.sm,
            paddingBottom: SPACING.xs,
        },
        sectionTitle: {
            fontSize: 12,
            fontWeight: '700',
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginTop: 4,
            marginBottom: 2,
        },
        elevation3DCard: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.lg,
            padding: SPACING.sm,
            gap: SPACING.sm,
            marginBottom: SPACING.xs,
        },
        elevation3DIcon: {
            width: 40,
            height: 40,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        elevation3DInfo: {
            flex: 1,
        },
        elevation3DTitle: {
            fontSize: 14,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        elevation3DDesc: {
            fontSize: 11,
            color: colors.textSecondary,
            marginTop: 1,
            lineHeight: 14,
        },
        itemCard: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: SPACING.sm,
            borderRadius: BORDER_RADIUS.lg,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            gap: SPACING.sm,
        },
        itemCardSelected: {
            borderColor: colors.primary,
            backgroundColor: colors.surface,
        },
        iconContainer: {
            width: 44,
            height: 44,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            justifyContent: 'center',
            alignItems: 'center',
            flexShrink: 0,
        },
        itemInfo: {
            flex: 1,
        },
        itemTitleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        itemLabel: {
            fontSize: 14,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        checkCircle: {
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
        },
        itemDescription: {
            fontSize: 11,
            color: colors.textSecondary,
            marginTop: 2,
            lineHeight: 14,
        },
    });
