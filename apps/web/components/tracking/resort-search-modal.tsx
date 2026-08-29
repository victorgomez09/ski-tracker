import React, { useState } from 'react';
import { Modal, View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Search, X, MapPin } from 'lucide-react-native';
import api from 'interceptor/api';
import { API_BASE_URL } from 'constants/constants';
import { ResortDetail } from 'models/ski-resort.model';
import { useTranslation } from 'react-i18next';
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS } from 'constants/theme';
import { Platform } from 'react-native';

interface ResortSearchModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (resort: ResortDetail) => void;
}

export const ResortSearchModal: React.FC<ResortSearchModalProps> = ({ visible, onClose, onSelect }) => {
    const colors = useThemeColors();
    const styles = React.useMemo(() => getStyles(colors), [colors]);
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ResortDetail[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSearch = async (text: string) => {
        setQuery(text);
        if (text.length < 3) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const res = await api.get<ResortDetail[]>(`${API_BASE_URL}/resorts/by-name`, { params: { name: text } });
            if (res.status === 200 && res.data) {
                setResults(res.data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        
        <Modal visible={visible} animationType="fade" transparent={true}>
            <View style={styles.overlay}>
                <View style={[styles.panel, Platform.OS === 'web' ? styles.panelWeb : styles.panelMobile]}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{t('search_resort', 'Buscar estación')}</Text>
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

                    {loading ? (
                        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
                    ) : (
                        <FlatList
                            data={results}
                            keyExtractor={(item) => item.ID}
                            renderItem={({ item }) => (
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
                                        <Text style={styles.resultName}>{item.Name}</Text>
                                        {item.Country && <Text style={styles.resultCountry}>{item.Country}</Text>}
                                    </View>
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                query.length >= 3 ? (
                                    <Text style={styles.emptyText}>{t('no_results', 'No se encontraron resultados')}</Text>
                                ) : null
                            }
                        />
                    )}
                </View>
            </View>
        </Modal>

    );
};


const getStyles = (colors: any) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
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
        width: 400,
        height: '60%',
    },
    panelMobile: {
        width: '90%',
        maxHeight: '70%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: SPACING.md,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.textPrimary,
        flex: 1,
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
        marginBottom: SPACING.md,
    },
    searchIcon: {
        marginRight: SPACING.sm,
    },
    searchInput: {
        flex: 1,
        height: 45,
        fontSize: 15,
        color: colors.textPrimary,
    },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    resultTextContainer: {
        marginLeft: SPACING.md,
    },
    resultName: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    resultCountry: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 2,
    },
    emptyText: {
        textAlign: 'center',
        color: colors.textSecondary,
        marginTop: SPACING.xl,
        fontSize: 16,
    }
});

