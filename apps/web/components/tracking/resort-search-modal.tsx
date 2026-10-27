import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { CheckCircle2, HardDrive, MapPin, Search, WifiOff, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useNetworkState } from 'expo-network';
import api from 'interceptor/api';
import { API_BASE_URL } from 'constants/constants';
import { ResortDetail } from 'models/ski-resort.model';
import { BORDER_RADIUS, SHADOWS, SPACING, useThemeColors } from 'constants/theme';
import { offlineResortService } from 'services/offline-resort.service';

interface ResortSearchModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (resort: ResortDetail) => void;
}

export const ResortSearchModal: React.FC<ResortSearchModalProps> = ({ visible, onClose, onSelect }) => {
    const colors = useThemeColors();
    const styles = React.useMemo(() => getStyles(colors), [colors]);
    const { t } = useTranslation();
    const networkState = useNetworkState();
    const isOffline = networkState?.isConnected === false;

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ResortDetail[]>([]);
    const [offlineResorts, setOfflineResorts] = useState<ResortDetail[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (visible) {
            offlineResortService.getAllOfflineResorts().then((offline) => {
                setOfflineResorts(offline);
                if (query.trim().length === 0) {
                    setResults(offline);
                }
            });
        }
    }, [visible, query]);

    const handleSearch = async (text: string) => {
        setQuery(text);
        if (text.length < 2) {
            setResults(offlineResorts);
            return;
        }

        // Local offline search first
        const localMatches = await offlineResortService.searchOfflineResorts(text);

        if (isOffline) {
            setResults(localMatches);
            return;
        }

        setLoading(true);
        try {
            const res = await api.get<ResortDetail[]>(`${API_BASE_URL}/resorts/by-name`, { params: { name: text } });
            if (res.status === 200 && res.data) {
                // Merge without duplicates, prioritizing local offline data which has full geometries
                const apiResults = res.data;
                const merged: ResortDetail[] = [...localMatches];
                apiResults.forEach((ar) => {
                    if (!merged.some((m) => m.ID === ar.ID)) {
                        merged.push(ar);
                    }
                });
                setResults(merged);
            }
        } catch (error) {
            // Network failure fallback
            setResults(localMatches);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} animationType="fade" transparent={true}>
            <View style={styles.overlay}>
                <View style={[styles.panel, Platform.OS === 'web' ? styles.panelWeb : styles.panelMobile]}>
                    <View style={styles.header}>
                        <View style={styles.headerTitleRow}>
                            <Text style={styles.title}>{t('search_resort', 'Buscar estación')}</Text>
                            {isOffline && (
                                <View style={styles.offlineBadge}>
                                    <WifiOff size={12} color="#b45309" />
                                    <Text style={styles.offlineBadgeText}>{t('offline', 'Offline')}</Text>
                                </View>
                            )}
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <X size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.searchContainer}>
                        <Search size={18} color={colors.textSecondary} style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder={t('search_resort_placeholder', 'Nombre de la estación...')}
                            placeholderTextColor={colors.textLight}
                            value={query}
                            onChangeText={handleSearch}
                            autoFocus
                        />
                    </View>

                    {query.trim().length === 0 && offlineResorts.length > 0 && (
                        <View style={styles.offlineHeader}>
                            <HardDrive size={14} color={colors.primary} />
                            <Text style={styles.offlineHeaderText}>
                                {t('downloaded_resorts', 'Estaciones descargadas (100% Offline)')}
                            </Text>
                        </View>
                    )}

                    {loading ? (
                        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
                    ) : (
                        <FlatList
                            data={results}
                            keyExtractor={(item) => item.ID}
                            renderItem={({ item }) => {
                                const isDownloaded = offlineResorts.some((r) => r.ID === item.ID);
                                return (
                                    <TouchableOpacity
                                        style={styles.resultItem}
                                        onPress={() => {
                                            onSelect(item);
                                            setQuery('');
                                            setResults([]);
                                        }}
                                    >
                                        <MapPin size={20} color={colors.primary} />
                                        <View style={styles.resultTextContainer}>
                                            <View style={styles.resultNameRow}>
                                                <Text style={styles.resultName}>{item.Name}</Text>
                                                {isDownloaded && (
                                                    <View style={styles.itemDownloadedBadge}>
                                                        <CheckCircle2 size={12} color="#16a34a" />
                                                        <Text style={styles.itemDownloadedText}>Offline</Text>
                                                    </View>
                                                )}
                                            </View>
                                            {item.Country && (
                                                <Text style={styles.resultCountry}>{item.Country}</Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                            ListEmptyComponent={
                                query.length >= 2 ? (
                                    <Text style={styles.emptyText}>
                                        {isOffline
                                            ? t('no_offline_results', 'No hay estaciones descargadas con ese nombre.')
                                            : t('no_results', 'No se encontraron resultados')}
                                    </Text>
                                ) : offlineResorts.length === 0 ? (
                                    <Text style={styles.emptyText}>
                                        {t('type_to_search', 'Escribe el nombre de la estación para buscar.')}
                                    </Text>
                                ) : null
                            }
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
};

const getStyles = (colors: any) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            justifyContent: 'center',
            alignItems: 'center',
        },
        panel: {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            padding: SPACING.md,
            borderRadius: BORDER_RADIUS.xl,
            ...SHADOWS.lg,
            display: 'flex',
        },
        panelWeb: {
            width: 440,
            height: '65%',
        },
        panelMobile: {
            width: '92%',
            maxHeight: '75%',
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: SPACING.md,
        },
        headerTitleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            flex: 1,
        },
        title: {
            fontSize: 18,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        offlineBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: '#fef3c7',
            paddingVertical: 3,
            paddingHorizontal: 7,
            borderRadius: 6,
        },
        offlineBadgeText: {
            fontSize: 10,
            fontWeight: '700',
            color: '#b45309',
        },
        closeButton: {
            padding: SPACING.xs + 2,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surface,
        },
        searchContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: BORDER_RADIUS.md,
            paddingHorizontal: SPACING.md,
            marginBottom: SPACING.sm,
            borderWidth: 1,
            borderColor: colors.border,
        },
        searchIcon: {
            marginRight: SPACING.sm,
        },
        searchInput: {
            flex: 1,
            height: 44,
            fontSize: 14,
            color: colors.textPrimary,
        },
        offlineHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 6,
            paddingHorizontal: 4,
            marginBottom: 4,
        },
        offlineHeaderText: {
            fontSize: 11,
            fontWeight: '700',
            color: colors.primary,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        resultItem: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: SPACING.sm + 4,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        resultTextContainer: {
            marginLeft: SPACING.md,
            flex: 1,
        },
        resultNameRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        resultName: {
            fontSize: 15,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        itemDownloadedBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            backgroundColor: 'rgba(34, 197, 94, 0.12)',
            paddingVertical: 2,
            paddingHorizontal: 6,
            borderRadius: 4,
        },
        itemDownloadedText: {
            fontSize: 10,
            fontWeight: '700',
            color: '#16a34a',
        },
        resultCountry: {
            fontSize: 13,
            color: colors.textSecondary,
            marginTop: 2,
        },
        emptyText: {
            textAlign: 'center',
            color: colors.textSecondary,
            marginTop: SPACING.xl,
            fontSize: 14,
            lineHeight: 20,
        },
    });
