import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView
} from 'react-native';

import { API_BASE_URL } from "constants/constants";
import api from "interceptor/api";
import { Session } from "models/session.model";
import { Activity, Calendar, ChevronDown, ChevronUp, MapIcon, Ruler, TrendingDown, Users, Zap } from "lucide-react-native";
import { useRouter } from "expo-router";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const msToKmh = (ms: number): string => (ms * 3.6).toFixed(1);
const metersToKm = (m: number): string => (m / 1000).toFixed(2);

const getDifficultyMeta = (diff: string) => {
  switch (diff?.toLowerCase()) {
    case 'novice':
      return {
        label: 'Novice',
        dotBg: 'bg-[#00a859]',
        badgeBg: 'bg-emerald-950/80',
        textColor: 'text-emerald-400',
        borderColor: 'border-emerald-800'
      };
    case 'easy':
      return {
        label: 'Easy',
        dotBg: 'bg-[#0072bc]',
        badgeBg: 'bg-blue-950/80',
        textColor: 'text-blue-400',
        borderColor: 'border-blue-800'
      };
    case 'intermediate':
      return {
        label: 'Intermediate',
        dotBg: 'bg-[#f0141e]',
        badgeBg: 'bg-rose-950/80',
        textColor: 'text-rose-400',
        borderColor: 'border-rose-800'
      };
    case 'advanced':
    case 'expert':
      return {
        label: 'Expert',
        dotBg: 'bg-black border border-slate-600',
        badgeBg: 'bg-slate-950',
        textColor: 'text-slate-200',
        borderColor: 'border-slate-700'
      };
    default:
      return {
        label: diff || 'General',
        dotBg: 'bg-slate-500',
        badgeBg: 'bg-slate-800',
        textColor: 'text-slate-400',
        borderColor: 'border-slate-700'
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
  const [communityData, setCommunityData] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCommunityData = async () => {
      try {
        const sessionsRequest = await api.get<{ sessions: Session[] }>(`${API_BASE_URL}/ski-sessions`);

        if (sessionsRequest.status === 200) {
          setCommunityData(sessionsRequest.data.sessions);
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
      <View className="flex-1 justify-center items-center bg-slate-900 p-4">
        <View className="bg-slate-800 border border-slate-700 p-6 rounded-xl items-center max-w-xs w-full">
          <Users size={32} color="#94a3b8" />
          <Text className="text-white font-bold text-base mt-3">No activity yet</Text>
          <Text className="text-slate-400 text-xs text-center mt-1">
            {loading ? "Loading community sessions..." : "No community sessions available right now."}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-900 p-4">
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-2xl font-extrabold text-white leading-tight">
            Community Feed
          </Text>
          <Text className="text-xs text-slate-400 font-medium mt-0.5">
            Live rider activity & session tracking
          </Text>
        </View>
        <View className="bg-blue-900/40 px-3 py-1.5 rounded-full border border-blue-700/60 flex-row items-center gap-1.5">
          <Users size={12} color="#60a5fa" />
          <Text className="text-xs text-blue-300 font-bold">
            {communityData.length} Sessions
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
  );
}

const SkiSessionCard = ({ session }: { session: Session }) => {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const runsCount = session.runs?.length || 0;
  const firstName = session.user?.first_name || 'Rider';
  const lastName = session.user?.last_name || '';
  const initials = `${firstName[0] || 'U'}${lastName[0] || ''}`.toUpperCase();

  return (
    <View className="bg-slate-800 border border-slate-700 p-4 rounded-xl mb-4 shadow-lg">

      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-3 flex-1">
          <View className="w-10 h-10 rounded-full bg-blue-600 items-center justify-center border border-blue-400 shadow-sm">
            <Text className="text-white font-extrabold text-xs tracking-wider">
              {initials}
            </Text>
          </View>

          <View className="flex-1">
            <Text className="text-sm font-bold text-white leading-tight" numberOfLines={1}>
              {session.user?.display_name || `${firstName} ${lastName}`.trim()}
            </Text>
            <View className="flex-row items-center gap-1 mt-0.5">
              <Calendar size={10} color="#94a3b8" />
              <Text className="text-[11px] text-slate-400 font-medium">
                {formatDate(session.start_time)}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <View className="bg-slate-900/80 px-2.5 py-1 rounded-full border border-slate-700/80 flex-row items-center gap-1.5">
            <Text className="text-xs">
              {session.activity_type === 'ski' ? '⛷️' : 'D'}
            </Text>
            <Text className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">
              {session.activity_type === 'ski' ? 'Ski' : 'Snowboard'}
            </Text>
          </View>

          <TouchableOpacity
            className="bg-blue-600 p-2 rounded-md flex-row items-center justify-center gap-2"
            onPress={() => router.push(`/map?sessionId=${session.id}&lat=${session.resort.Latitude}&lng=${session.resort.Longitude}&zoom=14`)}
          >
            <MapIcon size={9} color="#ffffff" />
            {/* <Text className="text-white font-bold text-base">View on Map</Text> */}
          </TouchableOpacity>
        </View>
      </View>

      <View className="bg-slate-900/80 p-3 rounded-lg border border-slate-700/60 flex-row justify-between items-center my-1">
        <View className="items-center flex-1">
          <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Distance</Text>
          <Text className="text-sm font-extrabold text-white mt-0.5">
            {metersToKm(session.total_distance)} <Text className="text-[10px] font-normal text-slate-400">km</Text>
          </Text>
        </View>

        <View className="w-px h-7 bg-slate-700/80" />

        <View className="items-center flex-1">
          <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Vertical Drop</Text>
          <Text className="text-sm font-extrabold text-white mt-0.5">
            {Math.round(session.vertical_drop)} <Text className="text-[10px] font-normal text-slate-400">m</Text>
          </Text>
        </View>

        <View className="w-px h-7 bg-slate-700/80" />

        <View className="items-center flex-1">
          <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Max Speed</Text>
          <Text className="text-sm font-extrabold text-white mt-0.5">
            {msToKmh(session.max_speed)} <Text className="text-[10px] font-normal text-slate-400">km/h</Text>
          </Text>
        </View>

        <View className="w-px h-7 bg-slate-700/80" />

        <View className="items-center flex-1">
          <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Downs</Text>
          <Text className="text-sm font-extrabold text-white mt-0.5">
            {runsCount}
          </Text>
        </View>
      </View>

      {/* SESSION RUNS */}
      {runsCount > 0 && (
        <View className="mt-2 pt-1">
          <TouchableOpacity
            className="flex-row items-center justify-between py-2 px-1 border-t border-slate-700/50"
            onPress={toggleExpand}
            activeOpacity={0.7}
          >
            <View className="flex-row items-center gap-1.5">
              <Activity size={12} color="#60a5fa" />
              <Text className="text-xs font-semibold text-blue-400">
                {expanded ? 'Hide' : `View ${runsCount} detailed runs`}
              </Text>
            </View>
            {expanded ? (
              <ChevronUp size={14} color="#60a5fa" />
            ) : (
              <ChevronDown size={14} color="#60a5fa" />
            )}
          </TouchableOpacity>

          {expanded && (
            <View className="mt-2 space-y-2">
              {session.runs?.map((run, index) => {
                const diffMeta = getDifficultyMeta(run.predominant_diff);
                return (
                  <View
                    key={run.id || index}
                    className="bg-slate-900/90 border border-slate-700/70 p-3 rounded-lg"
                  >
                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-xs font-bold text-slate-200">
                        Down #{index + 1}
                      </Text>

                      <View className={`flex-row items-center gap-1.5 px-2 py-0.5 rounded-full border ${diffMeta.badgeBg} ${diffMeta.borderColor}`}>
                        <View className={`w-2 h-2 rounded-full ${diffMeta.dotBg}`} />
                        <Text className={`text-[10px] font-bold ${diffMeta.textColor}`}>
                          {diffMeta.label}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center justify-between bg-slate-800/60 p-2 rounded border border-slate-700/40">
                      <View className="flex-row items-center gap-1">
                        <Ruler size={11} color="#94a3b8" />
                        <Text className="text-xs font-semibold text-slate-300">
                          {Math.round(run.total_distance)}m
                        </Text>
                      </View>

                      <View className="flex-row items-center gap-1">
                        <TrendingDown size={11} color="#94a3b8" />
                        <Text className="text-xs font-semibold text-slate-300">
                          {Math.round(run.vertical_drop)}m
                        </Text>
                      </View>

                      <View className="flex-row items-center gap-1">
                        <Zap size={11} color="#94a3b8" />
                        <Text className="text-xs font-semibold text-slate-300">
                          {msToKmh(run.max_speed)} km/h
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