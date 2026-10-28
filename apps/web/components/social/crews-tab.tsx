import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    TextInput,
    Modal,
    ActivityIndicator,
    StyleSheet,
    ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
    Users,
    Plus,
    Trophy,
    Camera,
    MapPin,
    X,
    UserPlus,
    LogOut,
    Crown,
    Trash2,
    Search,
    Check,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import api from '../../interceptor/api';
import { API_BASE_URL } from '../../constants/constants';
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from '../../constants/theme';
import { useAuth } from '../../context/auth.context';
import { useToast } from '../../context/toast.context';
import { socialService } from '../../services/social.service';
import { Crew, CrewMember, CrewPhoto } from '../../models/social.model';

export const CrewsTab: React.FC = () => {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const { user: currentUser } = useAuth();
    const { showToast } = useToast();

    const [crews, setCrews] = useState<Crew[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCrew, setSelectedCrew] = useState<Crew | null>(null);
    const [crewSubTab, setCrewSubTab] = useState<'members' | 'leaderboard' | 'photos' | 'live'>('members');

    // Create Crew Modal
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [newCrewName, setNewCrewName] = useState('');
    const [newCrewDesc, setNewCrewDesc] = useState('');
    const [newCrewResort, setNewCrewResort] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Crew data
    const [crewLeaderboard, setCrewLeaderboard] = useState<any[]>([]);
    const [crewLiveLocations, setCrewLiveLocations] = useState<any[]>([]);
    const [leaderboardMetric, setLeaderboardMetric] = useState<'distance' | 'vertical_drop' | 'max_speed'>('distance');

    // Add Photo Modal
    const [addPhotoModalVisible, setAddPhotoModalVisible] = useState(false);
    const [photoUrlInput, setPhotoUrlInput] = useState('');
    const [photoCaptionInput, setPhotoCaptionInput] = useState('');

    // Add Member Modal
    const [addMemberModalVisible, setAddMemberModalVisible] = useState(false);
    const [memberUserIdInput, setMemberUserIdInput] = useState('');
    const [friendsList, setFriendsList] = useState<any[]>([]);
    const [loadingFriends, setLoadingFriends] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        fetchCrews();
    }, []);

    const fetchCrews = async () => {
        setLoading(true);
        try {
            const data = await socialService.listUserCrews();
            setCrews(data || []);
        } catch (error) {
            console.error('Failed to fetch crews:', error);
            showToast(t('failed_fetch_crews', 'Error al cargar los grupos'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchCrewDetails = async (crewId: string) => {
        try {
            const data = await socialService.getCrew(crewId);
            setSelectedCrew(data);
        } catch (error) {
            console.error('Failed to fetch crew details:', error);
        }
    };

    const fetchCrewLeaderboard = async (crewId: string, metric = leaderboardMetric) => {
        try {
            const data = await socialService.getCrewLeaderboard(crewId, metric);
            setCrewLeaderboard(data || []);
        } catch (error) {
            console.error('Failed to fetch crew leaderboard:', error);
        }
    };

    const fetchCrewLiveLocations = async (crewId: string) => {
        try {
            const data = await socialService.getCrewLiveLocations(crewId);
            setCrewLiveLocations(data || []);
        } catch (error) {
            console.error('Failed to fetch crew live locations:', error);
        }
    };

    const handleSelectCrew = (crew: Crew) => {
        setSelectedCrew(crew);
        setCrewSubTab('members');
        fetchCrewDetails(crew.id);
        fetchCrewLeaderboard(crew.id, leaderboardMetric);
        fetchCrewLiveLocations(crew.id);
    };

    const handleCreateCrew = async () => {
        if (!newCrewName.trim()) {
            showToast(t('crew_name_required', 'El nombre del grupo es obligatorio'), 'error');
            return;
        }

        setIsCreating(true);
        try {
            const created = await socialService.createCrew({
                name: newCrewName.trim(),
                description: newCrewDesc.trim(),
                resort_id: newCrewResort.trim(),
            });
            setCrews((prev) => [created, ...prev]);
            setCreateModalVisible(false);
            setNewCrewName('');
            setNewCrewDesc('');
            setNewCrewResort('');
            showToast(t('crew_created_success', '¡Grupo creado con éxito!'), 'success');
            handleSelectCrew(created);
        } catch (error) {
            console.error('Failed to create crew:', error);
            showToast(t('failed_create_crew', 'Error al crear el grupo'), 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleLeaveCrew = async (crewId: string) => {
        try {
            await socialService.leaveCrew(crewId);
            setCrews((prev) => prev.filter((c) => c.id !== crewId));
            setSelectedCrew(null);
            showToast(t('crew_left_success', 'Has salido del grupo'), 'success');
        } catch (error) {
            console.error('Failed to leave crew:', error);
            showToast(t('failed_leave_crew', 'Error al salir del grupo'), 'error');
        }
    };

    const handleAddPhoto = async () => {
        if (!selectedCrew || !photoUrlInput.trim()) return;
        try {
            const photo = await socialService.addCrewPhoto(selectedCrew.id, photoUrlInput.trim(), photoCaptionInput.trim());
            setSelectedCrew((prev) => (prev ? { ...prev, photos: [photo, ...(prev.photos || [])] } : prev));
            setAddPhotoModalVisible(false);
            setPhotoUrlInput('');
            setPhotoCaptionInput('');
            showToast(t('photo_added_success', 'Foto añadida al álbum'), 'success');
        } catch (error) {
            console.error('Failed to add photo:', error);
            showToast(t('failed_add_photo', 'Error al añadir foto'), 'error');
        }
    };

    const handleAddMember = async (targetUserId?: string) => {
        const userId = targetUserId || memberUserIdInput.trim();
        if (!selectedCrew || !userId) return;
        try {
            await socialService.addCrewMember(selectedCrew.id, userId);
            await fetchCrewDetails(selectedCrew.id);
            await fetchCrews();
            showToast(t('member_added_success', 'Miembro añadido a la crew'), 'success');
        } catch (error) {
            console.error('Failed to add member:', error);
            showToast(t('failed_add_member', 'Error al añadir miembro'), 'error');
        }
    };

    const openInviteModal = async () => {
        setAddMemberModalVisible(true);
        setSearchQuery('');
        setSearchResults([]);
        setLoadingFriends(true);
        try {
            const res = await api.get(`${API_BASE_URL}/friends`);
            if (res.status === 200 && res.data) {
                setFriendsList(res.data);
            }
        } catch (e) {
            console.error('Failed to load friends:', e);
        } finally {
            setLoadingFriends(false);
        }
    };

    const handleSearchUsers = async (text: string) => {
        setSearchQuery(text);
        if (!text.trim()) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const res = await api.get(`${API_BASE_URL}/users/search?q=${encodeURIComponent(text.trim())}`);
            if (res.status === 200 && res.data) {
                setSearchResults(res.data);
            }
        } catch (e) {
            console.error('Failed to search users:', e);
        } finally {
            setIsSearching(false);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!selectedCrew) return;
        try {
            await socialService.removeCrewMember(selectedCrew.id, userId);
            fetchCrewDetails(selectedCrew.id);
            showToast(t('member_removed_success', 'Miembro eliminado'), 'success');
        } catch (error) {
            console.error('Failed to remove member:', error);
            showToast(t('failed_remove_member', 'Error al eliminar miembro'), 'error');
        }
    };

    const renderRank = (rank: number) => {
        if (rank === 1) return <Text style={{ fontSize: 16 }}>🥇</Text>;
        if (rank === 2) return <Text style={{ fontSize: 16 }}>🥈</Text>;
        if (rank === 3) return <Text style={{ fontSize: 16 }}>🥉</Text>;
        return <Text style={styles.rankNum}>{rank}</Text>;
    };

    return (
        <View style={{ flex: 1 }}>
            {/* Header: Action button */}
            <View style={styles.headerBar}>
                <View>
                    <Text style={styles.headerTitle}>{t('ski_crews_title', 'Grupos & Crews de Esquí')}</Text>
                    <Text style={styles.headerSubtitle}>
                        {t('ski_crews_subtitle', 'Organiza escapadas, clasificaciones internas y fotos')}
                    </Text>
                </View>

                <TouchableOpacity
                    style={styles.createButton}
                    onPress={() => setCreateModalVisible(true)}
                    activeOpacity={0.8}
                >
                    <Plus size={14} color={colors.textOnPrimary} />
                    <Text style={styles.createButtonText}>{t('new_crew', 'Nueva Crew')}</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : crews.length === 0 ? (
                <View style={styles.emptyCard}>
                    <Users size={36} color={colors.textSecondary} />
                    <Text style={styles.emptyTitle}>{t('no_crews_yet', 'Aún no perteneces a ningún grupo')}</Text>
                    <Text style={styles.emptySubtitle}>
                        {t('no_crews_desc', 'Crea una Crew para tu próxima escapada o fin de semana en la nieve con amigos.')}
                    </Text>
                    <TouchableOpacity
                        style={[styles.createButton, { marginTop: 12 }]}
                        onPress={() => setCreateModalVisible(true)}
                    >
                        <Plus size={14} color={colors.textOnPrimary} />
                        <Text style={styles.createButtonText}>{t('create_first_crew', 'Crear mi primer grupo')}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={crews}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingBottom: 24, gap: 12 }}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.crewCard}
                            onPress={() => handleSelectCrew(item)}
                            activeOpacity={0.85}
                        >
                            <View style={styles.crewCardHeader}>
                                <View style={styles.crewIconBadge}>
                                    <Users size={20} color={colors.primaryDark} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.crewName}>{item.name}</Text>
                                    {item.description ? (
                                        <Text style={styles.crewDesc} numberOfLines={1}>
                                            {item.description}
                                        </Text>
                                    ) : null}
                                </View>
                                <View style={styles.memberBadge}>
                                    <Text style={styles.memberBadgeText}>
                                        {item.member_count === 1
                                            ? t('crew_members_count_one', { count: 1 })
                                            : t('crew_members_count', { count: item.member_count || 1 })}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.crewCardFooter}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <MapPin size={12} color={colors.textSecondary} />
                                    <Text style={styles.crewFooterText}>
                                        {item.resort_id || t('general_resort', 'Estación de esquí')}
                                    </Text>
                                </View>
                                <Text style={styles.openCrewText}>{t('open_crew', 'Ver Crew →')}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                />
            )}

            {/* CREW DETAIL MODAL */}
            {selectedCrew && (
                <Modal visible={true} animationType="slide" onRequestClose={() => setSelectedCrew(null)}>
                    <View style={styles.detailModalContainer}>
                        {/* Header */}
                        <View style={styles.detailHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.detailTitle}>{selectedCrew.name}</Text>
                                <Text style={styles.detailSubtitle}>
                                    {selectedCrew.resort_id || t('mountain_crew', 'Crew de montaña')} ·{' '}
                                    {selectedCrew.members?.length === 1
                                        ? t('crew_members_count_one', { count: 1 })
                                        : t('crew_members_count', { count: selectedCrew.members?.length || 1 })}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <TouchableOpacity
                                    style={styles.leaveButton}
                                    onPress={() => handleLeaveCrew(selectedCrew.id)}
                                >
                                    <LogOut size={14} color={colors.danger} />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedCrew(null)}>
                                    <X size={20} color={colors.textPrimary} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Subtabs Bar */}
                        <View style={styles.subTabBar}>
                            <TouchableOpacity
                                style={[styles.subTabItem, crewSubTab === 'members' && styles.subTabItemActive]}
                                onPress={() => setCrewSubTab('members')}
                            >
                                <Users
                                    size={14}
                                    color={crewSubTab === 'members' ? colors.primary : colors.textSecondary}
                                />
                                <Text
                                    style={[styles.subTabText, crewSubTab === 'members' && styles.subTabTextActive]}
                                >
                                    {t('members_tab', 'Miembros')}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.subTabItem, crewSubTab === 'leaderboard' && styles.subTabItemActive]}
                                onPress={() => {
                                    setCrewSubTab('leaderboard');
                                    fetchCrewLeaderboard(selectedCrew.id);
                                }}
                            >
                                <Trophy
                                    size={14}
                                    color={crewSubTab === 'leaderboard' ? colors.primary : colors.textSecondary}
                                />
                                <Text
                                    style={[styles.subTabText, crewSubTab === 'leaderboard' && styles.subTabTextActive]}
                                >
                                    {t('ranking_tab', 'Ranking')}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.subTabItem, crewSubTab === 'photos' && styles.subTabItemActive]}
                                onPress={() => setCrewSubTab('photos')}
                            >
                                <Camera
                                    size={14}
                                    color={crewSubTab === 'photos' ? colors.primary : colors.textSecondary}
                                />
                                <Text
                                    style={[styles.subTabText, crewSubTab === 'photos' && styles.subTabTextActive]}
                                >
                                    {t('photos_tab', 'Álbum')}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.subTabItem, crewSubTab === 'live' && styles.subTabItemActive]}
                                onPress={() => {
                                    setCrewSubTab('live');
                                    fetchCrewLiveLocations(selectedCrew.id);
                                }}
                            >
                                <MapPin
                                    size={14}
                                    color={crewSubTab === 'live' ? colors.primary : colors.textSecondary}
                                />
                                <Text
                                    style={[styles.subTabText, crewSubTab === 'live' && styles.subTabTextActive]}
                                >
                                    {t('live_tab', 'En Vivo')}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* SUBTAB CONTENTS */}
                        <View style={{ flex: 1, padding: SPACING.md }}>
                            {/* 1. MEMBERS */}
                            {crewSubTab === 'members' && (
                                <View style={{ flex: 1 }}>
                                    <View style={styles.subTabActionHeader}>
                                        <Text style={styles.subTabSectionTitle}>
                                            {selectedCrew.members?.length === 1
                                                ? t('crew_members_count_one', { count: 1 })
                                                : t('crew_members_count', { count: selectedCrew.members?.length || 0 })}
                                        </Text>
                                        <TouchableOpacity
                                            style={styles.smallAddBtn}
                                            onPress={openInviteModal}
                                        >
                                            <UserPlus size={12} color={colors.textOnPrimary} />
                                            <Text style={styles.smallAddBtnText}>
                                                {t('invite_member', 'Invitar')}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                    <FlatList
                                        data={selectedCrew.members || []}
                                        keyExtractor={(m) => m.id}
                                        renderItem={({ item }) => {
                                            const name =
                                                item.user?.display_name ||
                                                `${item.user?.first_name || ''} ${item.user?.last_name || ''}`.trim() ||
                                                'Rider';
                                            const isAdmin = item.role === 'admin';
                                            const isMe = item.user_id === currentUser?.id;
                                            const canRemove =
                                                (selectedCrew.created_by === currentUser?.id && !isMe) || isMe;

                                            return (
                                                <View style={styles.memberRow}>
                                                    <View style={styles.memberAvatar}>
                                                        {item.user?.avatar_url ? (
                                                            <Image
                                                                source={{ uri: item.user.avatar_url }}
                                                                style={{ width: '100%', height: '100%' }}
                                                            />
                                                        ) : (
                                                            <Text style={styles.avatarInitials}>
                                                                {(name[0] || 'U').toUpperCase()}
                                                            </Text>
                                                        )}
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Text style={styles.memberName}>
                                                                {name} {isMe && `(${t('you', 'Tú')})`}
                                                            </Text>
                                                            {isAdmin && (
                                                                <View style={styles.adminBadge}>
                                                                    <Crown size={10} color="#f59e0b" />
                                                                    <Text style={styles.adminBadgeText}>Admin</Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                    </View>
                                                    {canRemove && !isMe && (
                                                        <TouchableOpacity
                                                            onPress={() => handleRemoveMember(item.user_id)}
                                                        >
                                                            <Trash2 size={14} color={colors.danger} />
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            );
                                        }}
                                    />
                                </View>
                            )}

                            {/* 2. LEADERBOARD */}
                            {crewSubTab === 'leaderboard' && (
                                <View style={{ flex: 1 }}>
                                    <View style={styles.metricFilterBar}>
                                        <TouchableOpacity
                                            style={[
                                                styles.metricPill,
                                                leaderboardMetric === 'distance' && styles.metricPillActive,
                                            ]}
                                            onPress={() => {
                                                setLeaderboardMetric('distance');
                                                fetchCrewLeaderboard(selectedCrew.id, 'distance');
                                            }}
                                        >
                                            <Text
                                                style={[
                                                    styles.metricPillText,
                                                    leaderboardMetric === 'distance' && styles.metricPillTextActive,
                                                ]}
                                            >
                                                {t('metric_distance', 'Distancia')}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[
                                                styles.metricPill,
                                                leaderboardMetric === 'vertical_drop' && styles.metricPillActive,
                                            ]}
                                            onPress={() => {
                                                setLeaderboardMetric('vertical_drop');
                                                fetchCrewLeaderboard(selectedCrew.id, 'vertical_drop');
                                            }}
                                        >
                                            <Text
                                                style={[
                                                    styles.metricPillText,
                                                    leaderboardMetric === 'vertical_drop' && styles.metricPillTextActive,
                                                ]}
                                            >
                                                {t('metric_drop', 'Desnivel D-')}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[
                                                styles.metricPill,
                                                leaderboardMetric === 'max_speed' && styles.metricPillActive,
                                            ]}
                                            onPress={() => {
                                                setLeaderboardMetric('max_speed');
                                                fetchCrewLeaderboard(selectedCrew.id, 'max_speed');
                                            }}
                                        >
                                            <Text
                                                style={[
                                                    styles.metricPillText,
                                                    leaderboardMetric === 'max_speed' && styles.metricPillTextActive,
                                                ]}
                                            >
                                                {t('metric_speed', 'Vel. Máxima')}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                    <FlatList
                                        data={crewLeaderboard}
                                        keyExtractor={(item) => item.user_id}
                                        renderItem={({ item, index }) => {
                                            const isMe = item.user_id === currentUser?.id;
                                            const name =
                                                item.display_name ||
                                                `${item.first_name || ''} ${item.last_name || ''}`.trim() ||
                                                'Rider';

                                            let valStr = `${Math.round(item.value)} m`;
                                            if (leaderboardMetric === 'distance') {
                                                valStr = `${(item.value / 1000).toFixed(1)} km`;
                                            } else if (leaderboardMetric === 'max_speed') {
                                                valStr = `${(item.value * 3.6).toFixed(1)} km/h`;
                                            }

                                            return (
                                                <View style={[styles.leaderboardRow, isMe && styles.leaderboardRowMe]}>
                                                    <View style={{ width: 28, alignItems: 'center' }}>
                                                        {renderRank(index + 1)}
                                                    </View>
                                                    <View style={{ flex: 1, marginLeft: 8 }}>
                                                        <Text style={styles.memberName}>
                                                            {name} {isMe && `(${t('you', 'Tú')})`}
                                                        </Text>
                                                    </View>
                                                    <Text style={styles.leaderboardValue}>{valStr}</Text>
                                                </View>
                                            );
                                        }}
                                        ListEmptyComponent={
                                            <Text style={styles.emptyNotice}>
                                                {t('no_crew_activity_yet', 'Sin actividad registrada aún en la crew')}
                                            </Text>
                                        }
                                    />
                                </View>
                            )}

                            {/* 3. PHOTOS ALBUM */}
                            {crewSubTab === 'photos' && (
                                <View style={{ flex: 1 }}>
                                    <View style={styles.subTabActionHeader}>
                                        <Text style={styles.subTabSectionTitle}>
                                            {t('crew_album_title', 'Álbum Colaborativo')}
                                        </Text>
                                        <TouchableOpacity
                                            style={styles.smallAddBtn}
                                            onPress={() => setAddPhotoModalVisible(true)}
                                        >
                                            <Camera size={12} color={colors.textOnPrimary} />
                                            <Text style={styles.smallAddBtnText}>
                                                {t('add_photo_btn', 'Subir foto')}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                    <FlatList
                                        data={selectedCrew.photos || []}
                                        keyExtractor={(p) => p.id}
                                        numColumns={3}
                                        contentContainerStyle={{ gap: 8 }}
                                        columnWrapperStyle={{ gap: 8 }}
                                        renderItem={({ item }) => (
                                            <View style={styles.photoGridCard}>
                                                <Image source={{ uri: item.photo_url }} style={styles.photoGridImg} />
                                                {item.caption ? (
                                                    <Text style={styles.photoCaption} numberOfLines={1}>
                                                        {item.caption}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        )}
                                        ListEmptyComponent={
                                            <Text style={styles.emptyNotice}>
                                                {t('no_crew_photos_yet', 'Aún no hay fotos en el álbum de la escapada')}
                                            </Text>
                                        }
                                    />
                                </View>
                            )}

                            {/* 4. LIVE LOCATIONS */}
                            {crewSubTab === 'live' && (
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.subTabSectionTitle}>
                                        {t('crew_live_title', 'Miembros Activos en la Nieve')}
                                    </Text>
                                    <Text style={styles.liveNoticeText}>
                                        {t(
                                            'crew_live_notice',
                                            'Los miembros con Modo Fantasma activo están ocultos por privacidad.'
                                        )}
                                    </Text>

                                    <FlatList
                                        data={crewLiveLocations}
                                        keyExtractor={(u) => u.id}
                                        renderItem={({ item }) => {
                                            const name =
                                                item.display_name ||
                                                `${item.first_name || ''} ${item.last_name || ''}`.trim() ||
                                                'Rider';

                                            return (
                                                <View style={styles.memberRow}>
                                                    <View style={styles.liveDot} />
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.memberName}>{name}</Text>
                                                        <Text style={styles.liveMeta}>
                                                            {item.last_resort_id || t('on_mountain', 'En montaña')} ·{' '}
                                                            {t('active_now', 'Activo recientemente')}
                                                        </Text>
                                                    </View>
                                                </View>
                                            );
                                        }}
                                        ListEmptyComponent={
                                            <Text style={styles.emptyNotice}>
                                                {t('no_members_live_now', 'Ningún miembro de la crew activo ahora mismo')}
                                            </Text>
                                        }
                                    />
                                </View>
                            )}
                        </View>

                        {/* ADD PHOTO OVERLAY */}
                        {addPhotoModalVisible && (
                            <View style={styles.innerModalBackdrop}>
                                <View style={styles.modalCard}>
                                    <View style={styles.modalHeader}>
                                        <Text style={styles.modalTitle}>{t('add_crew_photo', 'Subir Foto a la Crew')}</Text>
                                        <TouchableOpacity onPress={() => setAddPhotoModalVisible(false)}>
                                            <X size={20} color={colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>

                                    <Text style={styles.inputLabel}>{t('photo_url_label', 'URL de la foto')}</Text>
                                    <TextInput
                                        style={styles.modalInput}
                                        placeholder="https://images.unsplash.com/..."
                                        placeholderTextColor={colors.textLight}
                                        value={photoUrlInput}
                                        onChangeText={setPhotoUrlInput}
                                    />

                                    <Text style={styles.inputLabel}>{t('photo_caption_label', 'Pie de foto')}</Text>
                                    <TextInput
                                        style={styles.modalInput}
                                        placeholder={t('photo_caption_placeholder', 'Bajada épica en nieve polvo')}
                                        placeholderTextColor={colors.textLight}
                                        value={photoCaptionInput}
                                        onChangeText={setPhotoCaptionInput}
                                    />

                                    <TouchableOpacity
                                        style={[styles.modalSubmitBtn, !photoUrlInput.trim() && { opacity: 0.5 }]}
                                        onPress={handleAddPhoto}
                                        disabled={!photoUrlInput.trim()}
                                    >
                                        <Text style={styles.modalSubmitBtnText}>{t('save_photo', 'Añadir Foto')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* INVITE MEMBER OVERLAY */}
                        {addMemberModalVisible && (
                            <View style={styles.innerModalBackdrop}>
                                <View style={styles.inviteModalCard}>
                                    <View style={styles.modalHeader}>
                                        <Text style={styles.modalTitle}>{t('invite_to_crew', 'Invitar a la Crew')}</Text>
                                        <TouchableOpacity onPress={() => setAddMemberModalVisible(false)}>
                                            <X size={20} color={colors.textPrimary} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Search Box */}
                                    <View style={styles.searchBox}>
                                        <Search size={16} color={colors.textSecondary} />
                                        <TextInput
                                            style={styles.searchInput}
                                            placeholder={t('search_users_or_friends', 'Buscar por nombre o usuario...')}
                                            placeholderTextColor={colors.textLight}
                                            value={searchQuery}
                                            onChangeText={handleSearchUsers}
                                            autoCapitalize="none"
                                        />
                                        {searchQuery.length > 0 && (
                                            <TouchableOpacity onPress={() => handleSearchUsers('')}>
                                                <X size={14} color={colors.textSecondary} />
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {/* Content: Search results or Friends list */}
                                    {searchQuery.trim().length > 0 ? (
                                        <View style={{ maxHeight: 300 }}>
                                            {isSearching ? (
                                                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
                                            ) : (
                                                <FlatList
                                                    data={searchResults}
                                                    keyExtractor={(item) => item.id}
                                                    showsVerticalScrollIndicator={false}
                                                    renderItem={({ item }) => {
                                                        const isAlreadyMember = selectedCrew.members?.some((m) => m.user_id === item.id);
                                                        const initials = (item.display_name?.[0] || item.first_name?.[0] || 'U').toUpperCase();
                                                        const displayName = item.display_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Rider';

                                                        return (
                                                            <View style={styles.inviteUserRow}>
                                                                <View style={styles.inviteUserInfo}>
                                                                    <View style={styles.inviteAvatar}>
                                                                        {item.avatar_url ? (
                                                                            <Image source={{ uri: item.avatar_url }} style={{ width: '100%', height: '100%' }} />
                                                                        ) : (
                                                                            <Text style={styles.inviteAvatarText}>{initials}</Text>
                                                                        )}
                                                                    </View>
                                                                    <View style={{ flex: 1 }}>
                                                                        <Text style={styles.inviteName} numberOfLines={1}>{displayName}</Text>
                                                                        <Text style={styles.inviteUsername} numberOfLines={1}>@{item.display_name || 'usuario'}</Text>
                                                                    </View>
                                                                </View>

                                                                {isAlreadyMember ? (
                                                                    <View style={styles.alreadyInCrewBadge}>
                                                                        <Check size={12} color={colors.textSecondary} />
                                                                        <Text style={styles.alreadyInCrewText}>{t('already_in_crew', 'En el grupo')}</Text>
                                                                    </View>
                                                                ) : (
                                                                    <TouchableOpacity
                                                                        style={styles.inviteActionBtn}
                                                                        onPress={() => handleAddMember(item.id)}
                                                                    >
                                                                        <UserPlus size={12} color={colors.textOnPrimary} />
                                                                        <Text style={styles.inviteActionBtnText}>{t('invite_member', 'Invitar')}</Text>
                                                                    </TouchableOpacity>
                                                                )}
                                                            </View>
                                                        );
                                                    }}
                                                    ListEmptyComponent={
                                                        <Text style={styles.emptyNotice}>
                                                            {t('no_users_found', 'No se encontraron usuarios')}
                                                        </Text>
                                                    }
                                                />
                                            )}
                                        </View>
                                    ) : (
                                        <View style={{ maxHeight: 300 }}>
                                            <Text style={styles.inputLabel}>{t('your_friends', 'Tus amigos')}</Text>
                                            {loadingFriends ? (
                                                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
                                            ) : (
                                                <FlatList
                                                    data={friendsList}
                                                    keyExtractor={(item) => item.id}
                                                    showsVerticalScrollIndicator={false}
                                                    renderItem={({ item }) => {
                                                        const friendUser = item.requester_id === currentUser?.id ? item.addressee : item.requester;
                                                        if (!friendUser) return null;
                                                        const isAlreadyMember = selectedCrew.members?.some((m) => m.user_id === friendUser.id);
                                                        const initials = (friendUser.display_name?.[0] || friendUser.first_name?.[0] || 'U').toUpperCase();
                                                        const displayName = friendUser.display_name || `${friendUser.first_name || ''} ${friendUser.last_name || ''}`.trim() || 'Amigo';

                                                        return (
                                                            <View style={styles.inviteUserRow}>
                                                                <View style={styles.inviteUserInfo}>
                                                                    <View style={styles.inviteAvatar}>
                                                                        {friendUser.avatar_url ? (
                                                                            <Image source={{ uri: friendUser.avatar_url }} style={{ width: '100%', height: '100%' }} />
                                                                        ) : (
                                                                            <Text style={styles.inviteAvatarText}>{initials}</Text>
                                                                        )}
                                                                    </View>
                                                                    <View style={{ flex: 1 }}>
                                                                        <Text style={styles.inviteName} numberOfLines={1}>{displayName}</Text>
                                                                        <Text style={styles.inviteUsername} numberOfLines={1}>@{friendUser.display_name || 'amigo'}</Text>
                                                                    </View>
                                                                </View>

                                                                {isAlreadyMember ? (
                                                                    <View style={styles.alreadyInCrewBadge}>
                                                                        <Check size={12} color={colors.textSecondary} />
                                                                        <Text style={styles.alreadyInCrewText}>{t('already_in_crew', 'En el grupo')}</Text>
                                                                    </View>
                                                                ) : (
                                                                    <TouchableOpacity
                                                                        style={styles.inviteActionBtn}
                                                                        onPress={() => handleAddMember(friendUser.id)}
                                                                    >
                                                                        <UserPlus size={12} color={colors.textOnPrimary} />
                                                                        <Text style={styles.inviteActionBtnText}>{t('invite_member', 'Invitar')}</Text>
                                                                    </TouchableOpacity>
                                                                )}
                                                            </View>
                                                        );
                                                    }}
                                                    ListEmptyComponent={
                                                        <Text style={styles.emptyNotice}>
                                                            {t('no_friends_to_invite', 'No tienes amigos agregados aún. Usa el buscador para invitar usuarios a la crew.')}
                                                        </Text>
                                                    }
                                                />
                                            )}
                                        </View>
                                    )}
                                </View>
                            </View>
                        )}
                    </View>
                </Modal>
            )}

            {/* CREATE CREW MODAL */}
            <Modal visible={createModalVisible} transparent animationType="fade">
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('create_new_crew', 'Crear Nueva Crew')}</Text>
                            <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                                <X size={20} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.inputLabel}>{t('crew_name_label', 'Nombre del grupo')}</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder={t('crew_name_placeholder', 'Ej. Viaje Baqueira 2026')}
                            placeholderTextColor={colors.textLight}
                            value={newCrewName}
                            onChangeText={setNewCrewName}
                        />

                        <Text style={styles.inputLabel}>{t('crew_desc_label', 'Descripción (opcional)')}</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder={t('crew_desc_placeholder', 'Ej. Escapada fin de semana con amigos')}
                            placeholderTextColor={colors.textLight}
                            value={newCrewDesc}
                            onChangeText={setNewCrewDesc}
                        />

                        <Text style={styles.inputLabel}>{t('crew_resort_label', 'Estación (opcional)')}</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder={t('crew_resort_placeholder', 'Ej. Sierra Nevada, Baqueira...')}
                            placeholderTextColor={colors.textLight}
                            value={newCrewResort}
                            onChangeText={setNewCrewResort}
                        />

                        <TouchableOpacity
                            style={[styles.modalSubmitBtn, (!newCrewName.trim() || isCreating) && { opacity: 0.5 }]}
                            onPress={handleCreateCrew}
                            disabled={!newCrewName.trim() || isCreating}
                        >
                            {isCreating ? (
                                <ActivityIndicator size="small" color={colors.textOnPrimary} />
                            ) : (
                                <Text style={styles.modalSubmitBtnText}>{t('create_crew_btn', 'Crear Crew')}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const getStyles = (colors: typeof LIGHT_COLORS) =>
    StyleSheet.create({
        headerBar: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: SPACING.md,
        },
        headerTitle: {
            fontSize: 14,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        headerSubtitle: {
            fontSize: 11,
            color: colors.textSecondary,
        },
        createButton: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: colors.primary,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: BORDER_RADIUS.md,
        },
        createButtonText: {
            fontSize: 12,
            fontWeight: 'bold',
            color: colors.textOnPrimary,
        },
        loadingContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
        },
        emptyCard: {
            backgroundColor: colors.card,
            padding: 24,
            borderRadius: BORDER_RADIUS.lg,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            gap: 8,
            marginTop: 16,
        },
        emptyTitle: {
            fontSize: 14,
            fontWeight: 'bold',
            color: colors.textPrimary,
            textAlign: 'center',
        },
        emptySubtitle: {
            fontSize: 12,
            color: colors.textSecondary,
            textAlign: 'center',
            lineHeight: 18,
        },
        crewCard: {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.lg,
            padding: SPACING.md,
            gap: 12,
            ...SHADOWS.sm,
        },
        crewCardHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
        },
        crewIconBadge: {
            width: 38,
            height: 38,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
        },
        crewName: {
            fontSize: 14,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        crewDesc: {
            fontSize: 11,
            color: colors.textSecondary,
            marginTop: 2,
        },
        memberBadge: {
            backgroundColor: colors.surface,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: BORDER_RADIUS.round,
        },
        memberBadgeText: {
            fontSize: 10,
            fontWeight: '700',
            color: colors.primaryDark,
        },
        crewCardFooter: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 8,
            borderTopWidth: 1,
            borderColor: colors.border,
        },
        crewFooterText: {
            fontSize: 11,
            color: colors.textSecondary,
        },
        openCrewText: {
            fontSize: 11,
            fontWeight: 'bold',
            color: colors.primary,
        },
        detailModalContainer: {
            flex: 1,
            backgroundColor: colors.background,
        },
        detailHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: SPACING.md,
            borderBottomWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
        },
        detailTitle: {
            fontSize: 16,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        detailSubtitle: {
            fontSize: 11,
            color: colors.textSecondary,
            marginTop: 2,
        },
        leaveButton: {
            padding: 8,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: '#fee2e2',
        },
        closeBtn: {
            padding: 8,
        },
        subTabBar: {
            flexDirection: 'row',
            backgroundColor: colors.card,
            borderBottomWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: SPACING.sm,
        },
        subTabItem: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 12,
            borderBottomWidth: 2,
            borderBottomColor: 'transparent',
        },
        subTabItemActive: {
            borderBottomColor: colors.primary,
        },
        subTabText: {
            fontSize: 11,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        subTabTextActive: {
            color: colors.primary,
            fontWeight: 'bold',
        },
        subTabActionHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
        },
        subTabSectionTitle: {
            fontSize: 12,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            color: colors.textSecondary,
        },
        smallAddBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.primary,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: BORDER_RADIUS.sm,
        },
        smallAddBtnText: {
            fontSize: 11,
            fontWeight: 'bold',
            color: colors.textOnPrimary,
        },
        memberRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderColor: colors.border,
        },
        memberAvatar: {
            width: 32,
            height: 32,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
        },
        avatarInitials: {
            fontSize: 12,
            fontWeight: 'bold',
            color: colors.primaryDark,
        },
        memberName: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        adminBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            backgroundColor: '#fef3c7',
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: BORDER_RADIUS.sm,
        },
        adminBadgeText: {
            fontSize: 9,
            fontWeight: 'bold',
            color: '#b45309',
        },
        metricFilterBar: {
            flexDirection: 'row',
            gap: 6,
            marginBottom: 12,
        },
        metricPill: {
            flex: 1,
            paddingVertical: 6,
            borderRadius: BORDER_RADIUS.sm,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
        },
        metricPillActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        metricPillText: {
            fontSize: 11,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        metricPillTextActive: {
            color: colors.textOnPrimary,
        },
        leaderboardRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 6,
        },
        leaderboardRowMe: {
            borderColor: colors.primary,
            backgroundColor: '#eff6ff',
        },
        rankNum: {
            fontSize: 12,
            fontWeight: 'bold',
            color: colors.textSecondary,
        },
        leaderboardValue: {
            fontSize: 13,
            fontWeight: 'bold',
            color: colors.primary,
        },
        photoGridCard: {
            flex: 1 / 3,
            aspectRatio: 1,
            borderRadius: BORDER_RADIUS.md,
            overflow: 'hidden',
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
        },
        photoGridImg: {
            width: '100%',
            height: '100%',
        },
        photoCaption: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            color: '#ffffff',
            fontSize: 9,
            padding: 3,
        },
        liveNoticeText: {
            fontSize: 11,
            color: colors.textSecondary,
            marginVertical: 6,
        },
        liveDot: {
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: '#22c55e',
        },
        liveMeta: {
            fontSize: 11,
            color: colors.textSecondary,
        },
        emptyNotice: {
            fontSize: 12,
            color: colors.textSecondary,
            textAlign: 'center',
            marginVertical: 20,
            fontStyle: 'italic',
        },
        modalBackdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            padding: SPACING.md,
        },
        modalCard: {
            backgroundColor: colors.card,
            borderRadius: BORDER_RADIUS.lg,
            padding: SPACING.md,
            gap: 10,
        },
        modalHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
        },
        modalTitle: {
            fontSize: 15,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        inputLabel: {
            fontSize: 11,
            fontWeight: '600',
            color: colors.textSecondary,
            textTransform: 'uppercase',
        },
        modalInput: {
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            paddingHorizontal: 10,
            paddingVertical: 8,
            fontSize: 13,
            color: colors.textPrimary,
        },
        modalSubmitBtn: {
            backgroundColor: colors.primary,
            paddingVertical: 10,
            borderRadius: BORDER_RADIUS.md,
            alignItems: 'center',
            marginTop: 6,
        },
        modalSubmitBtnText: {
            fontSize: 13,
            fontWeight: 'bold',
            color: colors.textOnPrimary,
        },
        innerModalBackdrop: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.65)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            padding: SPACING.md,
        },
        inviteModalCard: {
            backgroundColor: colors.card,
            borderRadius: BORDER_RADIUS.lg,
            padding: SPACING.md,
            width: '100%',
            maxWidth: 420,
            borderWidth: 1,
            borderColor: colors.border,
            ...SHADOWS.lg,
            gap: 10,
        },
        searchBox: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            paddingHorizontal: 10,
            paddingVertical: 6,
        },
        searchInput: {
            flex: 1,
            fontSize: 13,
            color: colors.textPrimary,
            padding: 0,
        },
        inviteUserRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 8,
            paddingHorizontal: 4,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        inviteUserInfo: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            flex: 1,
            marginRight: 8,
        },
        inviteAvatar: {
            width: 34,
            height: 34,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.primary,
            overflow: 'hidden',
        },
        inviteAvatarText: {
            fontSize: 12,
            fontWeight: 'bold',
            color: colors.primaryDark,
        },
        inviteName: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        inviteUsername: {
            fontSize: 11,
            color: colors.textSecondary,
        },
        inviteActionBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.primary,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: BORDER_RADIUS.sm,
        },
        inviteActionBtnText: {
            fontSize: 11,
            fontWeight: 'bold',
            color: colors.textOnPrimary,
        },
        alreadyInCrewBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.surface,
            paddingHorizontal: 8,
            paddingVertical: 5,
            borderRadius: BORDER_RADIUS.sm,
            borderWidth: 1,
            borderColor: colors.border,
        },
        alreadyInCrewText: {
            fontSize: 11,
            fontWeight: '600',
            color: colors.textSecondary,
        },
    });
