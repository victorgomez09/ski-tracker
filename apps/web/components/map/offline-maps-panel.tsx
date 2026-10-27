import { OfflinePackInfo } from 'hooks/use-offline.hook';
import {
    CheckCircle2,
    Clock,
    Download,
    HardDrive,
    Layers,
    MapPin,
    Mountain,
    Trash2,
    WifiOff,
    X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, COLORS, SHADOWS, SPACING } from '../../constants/theme';
import { OfflineIndexItem, offlineResortService } from '../../services/offline-resort.service';

interface OfflineMapsModalProps {
    onClose: () => void;
    packs: OfflinePackInfo[];
    downloadingPack: string | null;
    downloadProgress: number;
    onDownloadCurrentArea: (customName: string) => void;
    onDeletePack: (packName: string) => void;
    currentResortName?: string;
    currentResortId?: string;
    mapStyleUrl?: string;
    onDownloadFullResort?: (resortId: string) => Promise<void>;
}

export const OfflineMapsModal = ({
    onClose,
    packs,
    downloadingPack,
    downloadProgress,
    onDownloadCurrentArea,
    onDeletePack,
    currentResortName,
    currentResortId,
    mapStyleUrl,
    onDownloadFullResort,
}: OfflineMapsModalProps) => {
    const { t } = useTranslation();
    const [zoneName, setZoneName] = useState(currentResortName || t('zona_esqui', 'Zona de esquí'));
    const [activeTab, setActiveTab] = useState<'download' | 'manage'>('download');
    const [offlineResorts, setOfflineResorts] = useState<OfflineIndexItem[]>([]);
    const [isDownloadingResort, setIsDownloadingResort] = useState(false);
    const [resortDownloadProgress, setResortDownloadProgress] = useState(0);

    const refreshOfflineResorts = useCallback(async () => {
        try {
            const index = await offlineResortService.getIndex();
            setOfflineResorts(index);
        } catch (e) {
            console.error('Failed to load offline resorts index:', e);
        }
    }, []);

    useEffect(() => {
        refreshOfflineResorts();
    }, [refreshOfflineResorts]);

    const isCurrentResortDownloaded = currentResortId
        ? offlineResorts.some((r) => r.id === currentResortId)
        : false;

    const handleStartDownloadArea = () => {
        if (!zoneName.trim()) return;
        onDownloadCurrentArea(zoneName.trim());
    };

    const handleDownloadCurrentResort = async () => {
        if (!currentResortId) return;

        setIsDownloadingResort(true);
        setResortDownloadProgress(5);
        try {
            if (onDownloadFullResort) {
                await onDownloadFullResort(currentResortId);
            } else {
                await offlineResortService.downloadFullResortPack(
                    currentResortId,
                    mapStyleUrl || 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
                    (pct) => setResortDownloadProgress(pct)
                );
            }
            await refreshOfflineResorts();
        } catch (e) {
            console.error('Failed to download full resort pack:', e);
        } finally {
            setIsDownloadingResort(false);
            setResortDownloadProgress(0);
        }
    };

    const handleDeleteOfflineResort = async (resortId: string) => {
        try {
            await offlineResortService.deleteOfflineResort(resortId);
            await refreshOfflineResorts();
        } catch (e) {
            console.error('Failed to delete offline resort:', e);
        }
    };

    const totalOfflineItems = offlineResorts.length + packs.length;

    return (
        <View style={styles.overlay}>
            <View style={styles.modalContainer}>
                {/* Cabecera */}
                <View style={styles.header}>
                    <View style={styles.headerTitleContainer}>
                        <WifiOff size={18} color={COLORS.primary} />
                        <Text style={styles.headerTitle}>{t('mapas_offline', 'Modo Offline y Descargas')}</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <X size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Pestañas de Navegación */}
                <View style={styles.tabsWrapper}>
                    <TouchableOpacity
                        style={[styles.tabButton, activeTab === 'download' && styles.tabButtonActive]}
                        onPress={() => setActiveTab('download')}
                    >
                        <Text style={[styles.tabText, activeTab === 'download' && styles.tabTextActive]}>
                            {t('descargar', 'Descargar')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tabButton, activeTab === 'manage' && styles.tabButtonActive]}
                        onPress={() => setActiveTab('manage')}
                    >
                        <Text style={[styles.tabText, activeTab === 'manage' && styles.tabTextActive]}>
                            {t('zonas_count', { count: totalOfflineItems, defaultValue: `Guardadas (${totalOfflineItems})` })}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Pestaña: Descargar */}
                {activeTab === 'download' && (
                    <ScrollView style={styles.manageScroll} contentContainerStyle={styles.tabContent}>
                        {/* 1. Opción destacada: Descargar estación completa si hay una activa */}
                        {currentResortId && currentResortName && (
                            <View style={styles.resortCard}>
                                <View style={styles.resortCardHeader}>
                                    <View style={styles.resortIconBadge}>
                                        <Mountain size={18} color="#FFFFFF" />
                                    </View>
                                    <View style={styles.resortCardTitleContainer}>
                                        <Text style={styles.resortCardTitle}>{currentResortName}</Text>
                                        <Text style={styles.resortCardSubtitle}>
                                            {isCurrentResortDownloaded
                                                ? t('resort_downloaded_tag', '✓ Estación 100% disponible offline')
                                                : t('resort_pack_desc', 'Pack completo: Mapa, Pistas, Remontes y Servicios')}
                                        </Text>
                                    </View>
                                </View>

                                {isCurrentResortDownloaded ? (
                                    <View style={styles.downloadedBadge}>
                                        <CheckCircle2 size={16} color={COLORS.success} />
                                        <Text style={styles.downloadedBadgeText}>
                                            {t('resort_ready_offline', 'Estación lista para navegar sin cobertura.')}
                                        </Text>
                                    </View>
                                ) : isDownloadingResort ? (
                                    <View style={styles.progressContainer}>
                                        <View style={styles.progressHeader}>
                                            <Text style={styles.progressLabel}>
                                                {t('descargando_estacion', 'Descargando estación completa...')}
                                            </Text>
                                            <Text style={styles.progressPercentage}>{resortDownloadProgress}%</Text>
                                        </View>
                                        <View style={styles.progressBarBg}>
                                            <View
                                                style={[styles.progressBarFill, { width: `${resortDownloadProgress}%` }]}
                                            />
                                        </View>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        onPress={handleDownloadCurrentResort}
                                        style={styles.resortDownloadButton}
                                        activeOpacity={0.8}
                                    >
                                        <Download size={16} color="#FFFFFF" />
                                        <Text style={styles.resortDownloadButtonText}>
                                            {t('descargar_estacion_completa', 'Descargar estación completa (100% Offline)')}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* 2. Opción: Descargar cuadrante actual libre */}
                        <View style={styles.areaSection}>
                            <Text style={styles.sectionTitle}>
                                {t('descargar_area_visible', 'Descargar área visible del mapa')}
                            </Text>
                            <Text style={styles.descriptionText}>
                                {t('descargar_desc', 'Descarga las teselas del mapa del recuadro actual para explorar sin conexión a internet.')}
                            </Text>

                            <View style={styles.inputContainer}>
                                <Text style={styles.inputLabel}>{t('nombre_zona', 'Nombre de la zona')}</Text>
                                <TextInput
                                    value={zoneName}
                                    onChangeText={setZoneName}
                                    placeholder={t('ej_baqueira', 'Ej. Baqueira Beret - Valle') as string}
                                    placeholderTextColor={COLORS.textLight}
                                    style={styles.textInput}
                                />
                            </View>

                            {downloadingPack ? (
                                <View style={styles.progressContainer}>
                                    <View style={styles.progressHeader}>
                                        <Text style={styles.progressLabel}>
                                            {t('descargando_pack', { pack: downloadingPack })}
                                        </Text>
                                        <Text style={styles.progressPercentage}>{downloadProgress.toFixed(0)}%</Text>
                                    </View>
                                    <View style={styles.progressBarBg}>
                                        <View
                                            style={[styles.progressBarFill, { width: `${downloadProgress}%` }]}
                                        />
                                    </View>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    onPress={handleStartDownloadArea}
                                    style={styles.downloadButton}
                                    activeOpacity={0.8}
                                >
                                    <Download size={16} color="#ffffff" />
                                    <Text style={styles.downloadButtonText}>{t('guardar_zona', 'Guardar cuadrante actual')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </ScrollView>
                )}

                {/* Pestaña: Gestionar */}
                {activeTab === 'manage' && (
                    <ScrollView style={styles.manageScroll} contentContainerStyle={styles.tabContent}>
                        {/* Lista de Estaciones Completas Descargadas */}
                        {offlineResorts.length > 0 && (
                            <View style={styles.manageSection}>
                                <Text style={styles.sectionTitle}>
                                    {t('estaciones_offline', 'Estaciones de Esquí Offline')}
                                </Text>
                                {offlineResorts.map((resort) => (
                                    <View key={resort.id} style={styles.packItem}>
                                        <View style={styles.packInfo}>
                                            <CheckCircle2 size={16} color={COLORS.success} />
                                            <View style={styles.packDetails}>
                                                <Text style={styles.packName}>{resort.name}</Text>
                                                <Text style={styles.packMeta}>
                                                    ⛷️ {resort.totalPistes} pistas · 🚡 {resort.totalLifts} remontes · 📍 {resort.totalPois} POIs
                                                </Text>
                                                <Text style={styles.packStatus}>
                                                    {t('disponible_offline', '100% Offline')} · {new Date(resort.downloadedAt).toLocaleDateString()}
                                                </Text>
                                            </View>
                                        </View>

                                        <TouchableOpacity
                                            onPress={() => handleDeleteOfflineResort(resort.id)}
                                            style={styles.deleteButton}
                                        >
                                            <Trash2 size={14} color={COLORS.danger} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Lista de Zonas Libres Descargadas */}
                        {packs.length > 0 && (
                            <View style={styles.manageSection}>
                                <Text style={styles.sectionTitle}>
                                    {t('zonas_mapa_libres', 'Cuadrantes de Mapa Guardados')}
                                </Text>
                                {packs.map((pack) => (
                                    <View key={pack.name} style={styles.packItem}>
                                        <View style={styles.packInfo}>
                                            <Layers size={16} color={COLORS.primary} />
                                            <View style={styles.packDetails}>
                                                <Text style={styles.packName}>{pack.name}</Text>
                                                <Text style={styles.packStatus}>{t('teselas_offline', 'Teselas de mapa guardadas')}</Text>
                                            </View>
                                        </View>

                                        <TouchableOpacity
                                            onPress={() => onDeletePack(pack.name)}
                                            style={styles.deleteButton}
                                        >
                                            <Trash2 size={14} color={COLORS.danger} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}

                        {totalOfflineItems === 0 && (
                            <View style={styles.emptyContainer}>
                                <HardDrive size={36} color={COLORS.textLight} />
                                <Text style={styles.emptyText}>{t('no_downloaded_zones', 'No tienes zonas ni estaciones descargadas aún.')}</Text>
                            </View>
                        )}
                    </ScrollView>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        zIndex: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.lg,
        width: '92%',
        maxHeight: '90%',
        ...SHADOWS.md,
        zIndex: 50,
        gap: SPACING.sm,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    headerTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.xs,
    },
    headerTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
    closeButton: {
        padding: 4,
        borderRadius: BORDER_RADIUS.round,
    },
    tabsWrapper: {
        flexDirection: 'row',
        backgroundColor: COLORS.surface,
        padding: 4,
        borderRadius: BORDER_RADIUS.md,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: BORDER_RADIUS.sm,
        alignItems: 'center',
    },
    tabButtonActive: {
        backgroundColor: COLORS.primary,
    },
    tabText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.textSecondary,
    },
    tabTextActive: {
        color: COLORS.textOnPrimary,
    },
    tabContent: {
        flexDirection: 'column',
        gap: SPACING.md,
        paddingBottom: SPACING.lg,
    },
    resortCard: {
        backgroundColor: COLORS.surface,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1.5,
        borderColor: COLORS.primary,
        gap: SPACING.sm,
    },
    resortCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    resortIconBadge: {
        width: 34,
        height: 34,
        borderRadius: 8,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    resortCardTitleContainer: {
        flex: 1,
    },
    resortCardTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    resortCardSubtitle: {
        fontSize: 11,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    resortDownloadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.primary,
        paddingVertical: 10,
        borderRadius: BORDER_RADIUS.md,
        gap: 6,
    },
    resortDownloadButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    downloadedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(34, 197, 94, 0.12)',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: BORDER_RADIUS.sm,
    },
    downloadedBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: COLORS.success,
    },
    areaSection: {
        flexDirection: 'column',
        gap: SPACING.sm,
        paddingTop: 4,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 2,
    },
    descriptionText: {
        fontSize: 11,
        color: COLORS.textSecondary,
        lineHeight: 16,
    },
    inputContainer: {
        flexDirection: 'column',
        gap: 6,
    },
    inputLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        color: COLORS.textLight,
        textTransform: 'uppercase',
    },
    textInput: {
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        color: COLORS.textPrimary,
        borderRadius: BORDER_RADIUS.md,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 12,
        fontWeight: '600',
    },
    progressContainer: {
        backgroundColor: COLORS.surface,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        gap: SPACING.sm,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    progressLabel: {
        fontSize: 11,
        fontWeight: 'bold',
        color: COLORS.primary,
        flex: 1,
    },
    progressPercentage: {
        fontSize: 11,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
    progressBarBg: {
        width: '100%',
        height: 6,
        backgroundColor: COLORS.border,
        borderRadius: BORDER_RADIUS.round,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: COLORS.primary,
    },
    downloadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.primary,
        paddingVertical: 9,
        borderRadius: BORDER_RADIUS.md,
        gap: 6,
    },
    downloadButtonText: {
        color: COLORS.primary,
        fontSize: 12,
        fontWeight: '700',
    },
    manageScroll: {
        maxHeight: 400,
    },
    manageSection: {
        gap: 8,
    },
    packItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        padding: SPACING.sm,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    packInfo: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: SPACING.sm,
        flex: 1,
    },
    packDetails: {
        flex: 1,
    },
    packName: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
    packMeta: {
        fontSize: 10,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    packStatus: {
        fontSize: 10,
        color: COLORS.success,
        marginTop: 2,
    },
    deleteButton: {
        padding: 6,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        marginLeft: 8,
    },
    emptyContainer: {
        paddingVertical: SPACING.xl,
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACING.sm,
    },
    emptyText: {
        fontSize: 12,
        color: COLORS.textLight,
        textAlign: 'center',
    },
});
