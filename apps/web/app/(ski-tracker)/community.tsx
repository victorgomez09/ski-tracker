import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View
} from 'react-native';
import { useTranslation } from "react-i18next";

import { API_BASE_URL } from "constants/constants";
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS, LIGHT_COLORS } from "constants/theme";
import { useRouter } from "expo-router";
import api from "interceptor/api";
import { Activity, Calendar, ChevronDown, ChevronUp, MapIcon, Ruler, TrendingDown, Users, Zap } from "lucide-react-native";
import { Session } from "models/session.model";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "context/auth.context";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const msToKmh = (ms: number): string => (ms * 3.6).toFixed(1);
const metersToKm = (m: number): string => (m / 1000).toFixed(2);

const getDifficultyMeta = (diff: string, colors: typeof LIGHT_COLORS) => {
  switch (diff?.toLowerCase()) {
    case 'novice':
      return {
        labelKey: 'novice',
        dotBgColor: '#00a859',
        badgeBgColor: 'rgba(16, 185, 129, 0.1)',
        textColor: '#10B981',
        borderColor: 'rgba(16, 185, 129, 0.2)'
      };
    case 'easy':
      return {
        labelKey: 'easy',
        dotBgColor: '#0072bc',
        badgeBgColor: 'rgba(59, 130, 246, 0.1)',
        textColor: '#3B82F6',
        borderColor: 'rgba(59, 130, 246, 0.2)'
      };
    case 'intermediate':
      return {
        labelKey: 'intermediate',
        dotBgColor: '#f0141e',
        badgeBgColor: 'rgba(239, 68, 68, 0.1)',
        textColor: '#EF4444',
        borderColor: 'rgba(239, 68, 68, 0.2)'
      };
    case 'advanced':
    case 'expert':
      return {
        labelKey: 'expert',
        dotBgColor: '#000000',
        badgeBgColor: colors.surface,
        textColor: colors.textPrimary,
        borderColor: colors.border
      };
    default:
      return {
        labelKey: diff ? diff.toLowerCase() : 'general',
        dotBgColor: colors.textLight,
        badgeBgColor: colors.surface,
        textColor: colors.textSecondary,
        borderColor: colors.border
      };
  }
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function CommunityView() {
  const { t } = useTranslation();
  const [communityData, setCommunityData] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  useEffect(() => {
    const fetchCommunityData = async () => {
      try {
        const sessionsRequest = await api.get<{ sessions: Session[] }>(`${API_BASE_URL}/ski-sessions`);

        if (sessionsRequest.status === 200) {
          setCommunityData(sessionsRequest.data.sessions || []);
        }
      } catch (error) {
        console.error("Failed to fetch community data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCommunityData();
  }, []);

  if (loading || communityData.length === 0) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      >
        <View style={styles.loadingContainer}>
          <View style={styles.loadingCard}>
            <Users size={32} color={colors.textSecondary} />
            <Text style={styles.noActivityTitle}>{t('no_activity_yet')}</Text>
            <Text style={styles.noActivitySubtitle}>
              {loading ? t('loading_community_sessions') : t('no_community_sessions')}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: 'transparent' }}
    >
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>
              {t('community_feed')}
            </Text>
            <Text style={styles.subtitle}>
              {t('live_rider_activity')}
            </Text>
          </View>
          <View style={styles.badge}>
            <Users size={12} color={colors.primaryDark} />
            <Text style={styles.badgeText}>
              {t('sessions_count', { count: communityData.length })}
            </Text>
          </View>
        </View>

        {/* SESSION LIST */}
        <FlatList
          data={communityData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SkiSessionCard session={item} />}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

const SkiSessionCard = ({ session }: { session: Session }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const runsCount = session.runs?.length || 0;
  const firstName = session.user?.first_name || t('rider');
  const lastName = session.user?.last_name || '';
  const initials = `${firstName[0] || 'U'}${lastName[0] || ''}`.toUpperCase();

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.userInfo}>
          <View style={styles.avatarContainer}>
            {session.user?.avatar_url ? (
              <Image
                source={{ uri: session.user?.avatar_url }}
                style={styles.avatarImage}
                resizeMode="cover"
              />) : (
              <Text style={styles.avatarText}>
                {initials}
              </Text>
            )}
          </View>

          <View style={styles.userMeta}>
            <Text style={styles.displayName} numberOfLines={1}>
              {session.user?.display_name || `${firstName} ${lastName}`.trim()}
            </Text>
            <View style={styles.dateRow}>
              <Calendar size={10} color={colors.textSecondary} />
              <Text style={styles.dateText}>
                {formatDate(session.start_time)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.activityTypeBadge}>
            <Text style={styles.activityTypeIcon}>
              {session.activity_type === 'ski' ? '⛷️' : '🏂'}
            </Text>
            <Text style={styles.activityTypeText}>
              {session.activity_type === 'ski' ? t('ski') : t('snowboard')}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.mapButton}
            onPress={() => router.push(`/map?sessionId=${session.id}&lat=${session.resort.Latitude}&lng=${session.resort.Longitude}&zoom=14`)}
          >
            <MapIcon size={9} color={colors.textOnPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>{t('distance')}</Text>
          <Text style={styles.statValue}>
            {metersToKm(session.total_distance)} <Text style={styles.statUnit}>{t('km')}</Text>
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.statCol}>
          <Text style={[styles.statLabel, { textAlign: 'center' }]}>{t('vertical_drop')}</Text>
          <Text style={styles.statValue}>
            {Math.round(session.vertical_drop)} <Text style={styles.statUnit}>{t('m')}</Text>
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.statCol}>
          <Text style={styles.statLabel}>{t('max_speed')}</Text>
          <Text style={styles.statValue}>
            {msToKmh(session.max_speed)} <Text style={styles.statUnit}>{t('km_h')}</Text>
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.statCol}>
          <Text style={styles.statLabel}>{t('downs')}</Text>
          <Text style={styles.statValue}>
            {runsCount}
          </Text>
        </View>
      </View>

      {/* PHOTOS THUMBNAILS (UP TO 5) */}
      {session.photos && session.photos.length > 0 && (
        <View style={styles.photosRow}>
          {session.photos.slice(0, 5).map((photo) => (
            <Image
              key={photo.id}
              source={{
                uri: `${API_BASE_URL}/ski-sessions/photos/${photo.photo_url}`,
                headers: token ? { Authorization: `Bearer ${token}` } : undefined
              }}
              style={styles.photoThumbnail}
              resizeMode="cover"
            />
          ))}
          {session.photos.length > 5 && (
            <View style={styles.morePhotosBadge}>
              <Text style={styles.morePhotosText}>+{session.photos.length - 5}</Text>
            </View>
          )}
        </View>
      )}

      {/* SESSION RUNS */}
      {runsCount > 0 && (
        <View style={{ marginTop: 8, paddingTop: 4 }}>
          <TouchableOpacity
            style={styles.runsTrigger}
            onPress={toggleExpand}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Activity size={12} color={colors.primaryDark} />
              <Text style={styles.runsTriggerText}>
                {expanded ? t('hide') : t('view_detailed_runs', { count: runsCount })}
              </Text>
            </View>
            {expanded ? (
              <ChevronUp size={14} color={colors.primaryDark} />
            ) : (
              <ChevronDown size={14} color={colors.primaryDark} />
            )}
          </TouchableOpacity>

          {expanded && (
            <View style={styles.runsContainer}>
              {/* ALL PHOTOS (when expanded) */}
              {session.photos && session.photos.length > 0 && (
                <View style={{ marginBottom: 16, paddingTop: 8 }}>
                  <Text style={styles.runsPhotosHeader}>Fotos de la Sesión</Text>
                  <View style={styles.runsPhotosList}>
                    {session.photos.map((photo) => (
                      <Image
                        key={photo.id}
                        source={{
                          uri: `${API_BASE_URL}/ski-sessions/photos/${photo.photo_url}`,
                          headers: token ? { Authorization: `Bearer ${token}` } : undefined
                        }}
                        style={{ width: 72, height: 72, borderRadius: BORDER_RADIUS.sm }}
                        resizeMode="cover"
                      />
                    ))}
                  </View>
                </View>
              )}
              {session.runs?.map((run, index) => {
                const diffMeta = getDifficultyMeta(run.predominant_diff, colors);
                return (
                  <View
                    key={run.id || index}
                    style={styles.runCard}
                  >
                    <View style={styles.runCardHeader}>
                      <Text style={styles.runTitle}>
                        {t('down_number', { index: index + 1 })}
                      </Text>

                      <View style={[styles.diffBadge, { backgroundColor: diffMeta.badgeBgColor, borderColor: diffMeta.borderColor }]}>
                        <View style={[styles.diffDot, { backgroundColor: diffMeta.dotBgColor }]} />
                        <Text style={[styles.diffText, { color: diffMeta.textColor }]}>
                          {t(diffMeta.labelKey, { defaultValue: diffMeta.labelKey })}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.runStatsRow}>
                      <View style={styles.runStatItem}>
                        <Ruler size={11} color={colors.textSecondary} />
                        <Text style={styles.runStatText}>
                          {Math.round(run.total_distance)}m
                        </Text>
                      </View>

                      <View style={styles.runStatItem}>
                        <TrendingDown size={11} color={colors.textSecondary} />
                        <Text style={styles.runStatText}>
                          {Math.round(run.vertical_drop)}m
                        </Text>
                      </View>

                      <View style={styles.runStatItem}>
                        <Zap size={11} color={colors.textSecondary} />
                        <Text style={styles.runStatText}>
                          {msToKmh(run.max_speed)} {t('km_h')}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: SPACING.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: SPACING.md,
  },
  loadingCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 24,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    maxWidth: 280,
    width: '100%',
    ...SHADOWS.md,
  },
  noActivityTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
    marginTop: SPACING.sm,
  },
  noActivitySubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: 12,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 12,
  },
  userMeta: {
    flex: 1,
  },
  displayName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dateText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activityTypeBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activityTypeIcon: {
    fontSize: 12,
  },
  activityTypeText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  mapButton: {
    backgroundColor: colors.primary,
    padding: 8,
    borderRadius: BORDER_RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  statCol: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  statUnit: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  photosRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
  },
  photoThumbnail: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.sm,
  },
  morePhotosBadge: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  morePhotosText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  runsTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  runsTriggerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  runsContainer: {
    marginTop: 8,
    gap: 8,
  },
  runsPhotosHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  runsPhotosList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  runCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    borderRadius: BORDER_RADIUS.md,
  },
  runCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  runTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  diffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
  },
  diffDot: {
    width: 8,
    height: 8,
    borderRadius: BORDER_RADIUS.round,
  },
  diffText: {
    fontSize: 10,
    fontWeight: '700',
  },
  runStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    padding: 8,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  runStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  runStatText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});