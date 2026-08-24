import { OfflinePackInfo } from 'hooks/use-offline.hook';
import { CheckCircle2, Download, HardDrive, Trash2, WifiOff, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface OfflineMapsModalProps {
    onClose: () => void;
    packs: OfflinePackInfo[];
    downloadingPack: string | null;
    downloadProgress: number;
    onDownloadCurrentArea: (customName: string) => void;
    onDeletePack: (packName: string) => void;
    currentResortName?: string;
}

export const OfflineMapsModal = ({
    onClose,
    packs,
    downloadingPack,
    downloadProgress,
    onDownloadCurrentArea,
    onDeletePack,
    currentResortName,
}: OfflineMapsModalProps) => {
    const { t } = useTranslation();
    const [zoneName, setZoneName] = useState(currentResortName || t('zona_esqui'));
    const [activeTab, setActiveTab] = useState<'download' | 'manage'>('download');

    const handleStartDownload = () => {
        if (!zoneName.trim()) return;
        onDownloadCurrentArea(zoneName.trim());
    };

    return (
        <View style={styles.overlay}>
            <View style={styles.modalContainer}>
                {/* Cabecera */}
                <View style={styles.header}>
                    <View style={styles.headerTitleContainer}>
                        <WifiOff size={18} color={COLORS.primary} />
                        <Text style={styles.headerTitle}>{t('mapas_offline')}</Text>
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
                            {t('descargar')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tabButton, activeTab === 'manage' && styles.tabButtonActive]}
                        onPress={() => setActiveTab('manage')}
                    >
                        <Text style={[styles.tabText, activeTab === 'manage' && styles.tabTextActive]}>
                            {t('zonas_count', { count: packs.length })}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Pestaña: Descargar Zona Actual */}
                {activeTab === 'download' && (
                    <View style={styles.tabContent}>
                        <Text style={styles.descriptionText}>
                            {t('descargar_desc')}
                        </Text>

                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>{t('nombre_zona')}</Text>
                            <TextInput
                                value={zoneName}
                                onChangeText={setZoneName}
                                placeholder={t('ej_baqueira') as string}
                                placeholderTextColor={COLORS.textLight}
                                style={styles.textInput}
                            />
                        </View>

                        {downloadingPack ? (
                            <View style={styles.progressContainer}>
                                <View style={styles.progressHeader}>
                                    <Text style={styles.progressLabel}>{t('descargando_pack', { pack: downloadingPack })}</Text>
                                    <Text style={styles.progressPercentage}>{downloadProgress.toFixed(0)}%</Text>
                                </View>
                                {/* Barra de Progreso */}
                                <View style={styles.progressBarBg}>
                                    <View
                                        style={[styles.progressBarFill, { width: `${downloadProgress}%` }]}
                                    />
                                </View>
                            </View>
                        ) : (
                            <TouchableOpacity
                                onPress={handleStartDownload}
                                style={styles.downloadButton}
                            >
                                <Download size={16} color="#ffffff" />
                                <Text style={styles.downloadButtonText}>{t('guardar_zona')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Pestaña: Gestionar Zonas Guardadas */}
                {activeTab === 'manage' && (
                    <ScrollView style={styles.manageScroll} contentContainerStyle={styles.tabContent}>
                        {packs.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <HardDrive size={32} color={COLORS.textLight} />
                                <Text style={styles.emptyText}>{t('no_downloaded_zones')}</Text>
                            </View>
                        ) : (
                            packs.map((pack) => (
                                <View
                                    key={pack.name}
                                    style={styles.packItem}
                                >
                                    <View style={styles.packInfo}>
                                        <CheckCircle2 size={16} color={COLORS.success} />
                                        <View>
                                            <Text style={styles.packName}>{pack.name}</Text>
                                            <Text style={styles.packStatus}>{t('disponible_offline')}</Text>
                                        </View>
                                    </View>

                                    <TouchableOpacity
                                        onPress={() => onDeletePack(pack.name)}
                                        style={styles.deleteButton}
                                    >
                                        <Trash2 size={14} color={COLORS.danger} />
                                    </TouchableOpacity>
                                </View>
                            ))
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
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
        width: '91.666667%',
        height: '91.666667%',
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
        borderColor: COLORS.border,
    },
    headerTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    headerTitle: {
        fontWeight: '800',
        fontSize: 14,
        color: COLORS.textPrimary,
    },
    closeButton: {
        padding: 6,
        backgroundColor: COLORS.surface,
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
        marginTop: SPACING.xs,
    },
    descriptionText: {
        fontSize: 12,
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
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    progressPercentage: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
    progressBarBg: {
        width: '100%',
        height: 8,
        backgroundColor: COLORS.border,
        borderRadius: BORDER_RADIUS.round,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: COLORS.primary,
        borderRadius: BORDER_RADIUS.round,
    },
    downloadButton: {
        backgroundColor: COLORS.primary,
        padding: 12,
        borderRadius: BORDER_RADIUS.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...SHADOWS.md,
    },
    downloadButtonText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    manageScroll: {
        maxHeight: '60%',
    },
    emptyContainer: {
        paddingVertical: 24,
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACING.sm,
    },
    emptyText: {
        fontSize: 12,
        color: COLORS.textLight,
    },
    packItem: {
        backgroundColor: COLORS.surface,
        padding: 12,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 4,
    },
    packInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    packName: {
        fontWeight: 'bold',
        fontSize: 12,
        color: COLORS.textPrimary,
    },
    packStatus: {
        fontSize: 10,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    deleteButton: {
        padding: 8,
        backgroundColor: 'rgba(229, 115, 115, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(229, 115, 115, 0.3)',
        borderRadius: BORDER_RADIUS.md,
    },
});