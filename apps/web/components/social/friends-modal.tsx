import React, { useState, useEffect, useMemo } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    StyleSheet
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { X, Search, UserPlus, Check, UserMinus, ShieldAlert, Clock, CheckSquare } from 'lucide-react-native';
import api from 'interceptor/api';
import { API_BASE_URL } from 'constants/constants';
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from 'constants/theme';
import { useToast } from 'context/toast.context';
import { useAuth } from 'context/auth.context';

interface FriendsModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function FriendsModal({ visible, onClose }: FriendsModalProps) {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const { user: currentUser } = useAuth();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

    const [activeTab, setActiveTab] = useState<'search' | 'requests' | 'friends'>('search');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [friends, setFriends] = useState<any[]>([]);
    const [requests, setRequests] = useState<{ incoming: any[]; outgoing: any[] }>({ incoming: [], outgoing: [] });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (visible) {
            if (activeTab === 'friends') {
                fetchFriends();
            } else if (activeTab === 'requests') {
                fetchRequests();
            }
        }
    }, [visible, activeTab]);

    const fetchFriends = async () => {
        setLoading(true);
        try {
            const res = await api.get(`${API_BASE_URL}/friends`);
            if (res.status === 200) {
                setFriends(res.data || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const res = await api.get(`${API_BASE_URL}/friends/requests`);
            if (res.status === 200) {
                setRequests(res.data || { incoming: [], outgoing: [] });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (text: string) => {
        setSearchQuery(text);
        if (!text.trim()) {
            setSearchResults([]);
            return;
        }
        try {
            const res = await api.get(`${API_BASE_URL}/users/search?q=${encodeURIComponent(text)}`);
            if (res.status === 200) {
                setSearchResults(res.data || []);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const sendFriendRequest = async (addresseeId: string) => {
        try {
            const res = await api.post(`${API_BASE_URL}/friends/request`, { addressee_id: addresseeId });
            if (res.status === 200) {
                showToast(t('request_sent') || 'Solicitud enviada', 'success');
                handleSearch(searchQuery);
            }
        } catch (e) {
            showToast(t('request_failed') || 'Error al enviar solicitud', 'error');
        }
    };

    const respondFriendRequest = async (friendshipId: string, action: 'accept' | 'reject') => {
        try {
            const res = await api.post(`${API_BASE_URL}/friends/respond`, {
                friendship_id: friendshipId,
                action: action
            });
            if (res.status === 200) {
                showToast(action === 'accept' ? (t('friend_added') || 'Amigo agregado') : (t('request_rejected') || 'Solicitud rechazada'), 'success');
                fetchRequests();
            }
        } catch (e) {
            showToast(t('error'), 'error');
        }
    };

    const removeFriendship = async (friendshipId: string) => {
        try {
            const res = await api.delete(`${API_BASE_URL}/friends/${friendshipId}`);
            if (res.status === 200) {
                showToast(t('friend_removed') || 'Amigo eliminado', 'success');
                fetchFriends();
            }
        } catch (e) {
            showToast(t('error'), 'error');
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>{t('friends')}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Tab Navigation */}
                    <View style={styles.tabBar}>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'search' && styles.activeTab]}
                            onPress={() => setActiveTab('search')}
                        >
                            <Text style={[styles.tabText, activeTab === 'search' && styles.activeTabText]}>
                                {t('search_users')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
                            onPress={() => setActiveTab('requests')}
                        >
                            <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
                                {t('friend_requests')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'friends' && styles.activeTab]}
                            onPress={() => setActiveTab('friends')}
                        >
                            <Text style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}>
                                {t('friends')}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Search Tab */}
                    {activeTab === 'search' && (
                        <View style={styles.content}>
                            <View style={styles.searchBarContainer}>
                                <Search size={16} color={colors.textSecondary} />
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('search_placeholder_users') as string}
                                    placeholderTextColor={colors.textLight}
                                    value={searchQuery}
                                    onChangeText={handleSearch}
                                />
                            </View>

                            <FlatList
                                data={searchResults}
                                keyExtractor={(item) => item.id}
                                renderItem={({ item }) => (
                                    <View style={styles.userRow}>
                                        <View style={styles.userInfo}>
                                            <Text style={styles.userDisplayName}>{item.display_name || `${item.first_name} ${item.last_name}`}</Text>
                                            <Text style={styles.userEmail}>{item.email}</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.actionBtn}
                                            onPress={() => sendFriendRequest(item.id)}
                                        >
                                            <UserPlus size={16} color={colors.textOnPrimary} />
                                            <Text style={styles.actionBtnText}>{t('send_request')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                ListEmptyComponent={
                                    searchQuery ? (
                                        <Text style={styles.emptyText}>{t('no_results') || 'Sin resultados'}</Text>
                                    ) : null
                                }
                            />
                        </View>
                    )}

                    {/* Requests Tab */}
                    {activeTab === 'requests' && (
                        <View style={styles.content}>
                            {loading ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.sectionHeader}>{t('incoming') || 'Recibidas'}</Text>
                                    <FlatList
                                        data={requests.incoming}
                                        keyExtractor={(item) => item.id}
                                        style={{ maxHeight: '50%' }}
                                        renderItem={({ item }) => {
                                            const sender = item.requester;
                                            return (
                                                <View style={styles.userRow}>
                                                    <View style={styles.userInfo}>
                                                        <Text style={styles.userDisplayName}>{sender?.display_name || `${sender?.first_name} ${sender?.last_name}`}</Text>
                                                        <Text style={styles.userEmail}>{sender?.email}</Text>
                                                    </View>
                                                    <View style={styles.rowActions}>
                                                        <TouchableOpacity
                                                            style={[styles.acceptBtn]}
                                                            onPress={() => respondFriendRequest(item.id, 'accept')}
                                                        >
                                                            <Check size={14} color="#ffffff" />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            style={[styles.rejectBtn]}
                                                            onPress={() => respondFriendRequest(item.id, 'reject')}
                                                        >
                                                            <X size={14} color="#ffffff" />
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            );
                                        }}
                                        ListEmptyComponent={
                                            <Text style={styles.emptyText}>{t('no_requests_pending')}</Text>
                                        }
                                    />

                                    <Text style={styles.sectionHeader}>{t('outgoing') || 'Enviadas'}</Text>
                                    <FlatList
                                        data={requests.outgoing}
                                        keyExtractor={(item) => item.id}
                                        renderItem={({ item }) => {
                                            const recipient = item.addressee;
                                            return (
                                                <View style={styles.userRow}>
                                                    <View style={styles.userInfo}>
                                                        <Text style={styles.userDisplayName}>{recipient?.display_name || `${recipient?.first_name} ${recipient?.last_name}`}</Text>
                                                        <Text style={styles.userEmail}>{recipient?.email}</Text>
                                                    </View>
                                                    <View style={styles.statusPill}>
                                                        <Clock size={10} color={colors.textSecondary} />
                                                        <Text style={styles.statusText}>{t('pending') || 'Pendiente'}</Text>
                                                    </View>
                                                </View>
                                            );
                                        }}
                                    />
                                </View>
                            )}
                        </View>
                    )}

                    {/* Friends Tab */}
                    {activeTab === 'friends' && (
                        <View style={styles.content}>
                            {loading ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                                <FlatList
                                    data={friends}
                                    keyExtractor={(item) => item.id}
                                    renderItem={({ item }) => {
                                        const friendUser = item.requester_id === currentUser?.id ? item.addressee : item.requester;
                                        return (
                                            <View style={styles.userRow}>
                                                <View style={styles.userInfo}>
                                                    <Text style={styles.userDisplayName}>{friendUser?.display_name || `${friendUser?.first_name} ${friendUser?.last_name}`}</Text>
                                                    <Text style={styles.userEmail}>{friendUser?.email}</Text>
                                                </View>
                                                <TouchableOpacity
                                                    style={styles.removeBtn}
                                                    onPress={() => removeFriendship(item.id)}
                                                >
                                                    <UserMinus size={14} color={colors.danger} />
                                                    <Text style={styles.removeBtnText}>{t('remove_friend')}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    }}
                                    ListEmptyComponent={
                                        <Text style={styles.emptyText}>{t('no_friends_yet')}</Text>
                                    }
                                />
                            )}
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: colors.card,
        borderTopLeftRadius: BORDER_RADIUS.lg,
        borderTopRightRadius: BORDER_RADIUS.lg,
        height: '80%',
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    closeBtn: {
        padding: 4,
    },
    tabBar: {
        flexDirection: 'row',
        marginVertical: SPACING.sm,
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.md,
        padding: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: BORDER_RADIUS.sm,
    },
    activeTab: {
        backgroundColor: colors.primary,
    },
    tabText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    activeTabText: {
        color: '#ffffff',
    },
    content: {
        flex: 1,
        marginTop: SPACING.xs,
    },
    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: BORDER_RADIUS.md,
        paddingHorizontal: SPACING.sm,
        marginBottom: SPACING.md,
    },
    input: {
        flex: 1,
        height: 40,
        paddingHorizontal: SPACING.xs,
        color: colors.textPrimary,
        fontSize: 13,
    },
    userRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    userInfo: {
        flex: 1,
        marginRight: SPACING.md,
    },
    userDisplayName: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    userEmail: {
        fontSize: 11,
        color: colors.textSecondary,
        marginTop: 2,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.primary,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: BORDER_RADIUS.md,
    },
    actionBtnText: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: '700',
    },
    rowActions: {
        flexDirection: 'row',
        gap: 8,
    },
    acceptBtn: {
        backgroundColor: colors.success || '#10B981',
        padding: 8,
        borderRadius: BORDER_RADIUS.md,
    },
    rejectBtn: {
        backgroundColor: colors.danger,
        padding: 8,
        borderRadius: BORDER_RADIUS.md,
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: BORDER_RADIUS.round,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    removeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderColor: colors.danger,
        borderWidth: 1,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: BORDER_RADIUS.md,
    },
    removeBtnText: {
        color: colors.danger,
        fontSize: 11,
        fontWeight: '700',
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: '800',
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: SPACING.md,
        marginBottom: SPACING.xs,
    },
    emptyText: {
        fontSize: 12,
        color: colors.textLight,
        textAlign: 'center',
        marginVertical: 24,
    },
});
