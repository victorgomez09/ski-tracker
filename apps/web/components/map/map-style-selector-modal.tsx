import React from 'react';
import {
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Check, Eye, Footprints, Globe, Layers, Map, MapPin, Moon, Mountain, Navigation, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';
import { MAP_STYLES, MapStyleId, MapStyleOption } from 'constants/map-styles';

interface MapStyleSelectorModalProps {
    visible: boolean;
    onClose: () => void;
    selectedStyle: MapStyleId;
    onSelect: (styleId: MapStyleId) => void;
}

export const MapStyleSelectorModal: React.FC<MapStyleSelectorModalProps> = ({
    visible,
    onClose,
    selectedStyle,
    onSelect,
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
            padding: SPACING.xs,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surface,
        },
        scroll: {
            maxHeight: 450,
        },
        scrollContent: {
            gap: SPACING.xs + 2,
            paddingBottom: SPACING.xs,
        },
        itemCard: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: SPACING.sm + 2,
            paddingHorizontal: SPACING.md,
            borderRadius: BORDER_RADIUS.lg,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surface,
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
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: SPACING.md,
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
            fontSize: 15,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        itemDescription: {
            fontSize: 12,
            color: colors.textSecondary,
            marginTop: 2,
            lineHeight: 16,
        },
        checkCircle: {
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
        },
    });
