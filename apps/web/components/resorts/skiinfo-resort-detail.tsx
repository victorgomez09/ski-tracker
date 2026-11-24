import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  CloudLightning,
  CloudRain,
  Compass,
  Download,
  Droplets,
  ExternalLink,
  Eye,
  Flame,
  Gauge,
  Globe,
  Layers,
  Map as MapIcon,
  MapPin,
  Mountain,
  Navigation,
  RefreshCw,
  Search,
  ShieldAlert,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Thermometer,
  Umbrella,
  Wind,
  X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from '../../constants/theme';
import { useFavorites } from '../../context/favorites.context';
import { ACTIVITY_CONFIGS, ActivityType } from '../../models/activity.model';
import { Piste, Resort, ResortDetail } from '../../models/ski-resort.model';
import { WeatherForecast, WeatherModelId, WEATHER_MODELS } from '../../models/weather.model';
import { getWindDirectionInfo, SPAIN_ANDORRA_RESORTS } from '../../services/snow-forecast.service';
import { ResortLogo } from './resort-logo';

export type SkiinfoTab = 'snow' | 'pistes' | 'weather' | 'community';
export type DifficultyFilterKey = 'all' | 'novice' | 'easy' | 'intermediate' | 'advanced';

export const DIFFICULTY_MAP: Record<
  string,
  {
    key: DifficultyFilterKey;
    label: string;
    sublabel: string;
    color: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  novice: {
    key: 'novice',
    label: 'Verde',
    sublabel: 'Muy fácil',
    color: '#00a859',
    badgeBg: '#e8f5e9',
    badgeText: '#00a859',
  },
  easy: {
    key: 'easy',
    label: 'Azul',
    sublabel: 'Fácil',
    color: '#0072bc',
    badgeBg: '#e0f2fe',
    badgeText: '#0072bc',
  },
  intermediate: {
    key: 'intermediate',
    label: 'Roja',
    sublabel: 'Intermedia',
    color: '#ef4444',
    badgeBg: '#fee2e2',
    badgeText: '#dc2626',
  },
  advanced: {
    key: 'advanced',
    label: 'Negra',
    sublabel: 'Difícil',
    color: '#0f172a',
    badgeBg: '#f1f5f9',
    badgeText: '#0f172a',
  },
};

export const getPisteDifficultyMeta = (difficulty?: string) => {
  const d = (difficulty || '').toLowerCase().trim();
  if (d === 'novice' || d === 'green' || d === 'verde') return DIFFICULTY_MAP.novice;
  if (d === 'easy' || d === 'blue' || d === 'azul') return DIFFICULTY_MAP.easy;
  if (d === 'intermediate' || d === 'red' || d === 'roja') return DIFFICULTY_MAP.intermediate;
  if (d === 'advanced' || d === 'expert' || d === 'black' || d === 'negra') return DIFFICULTY_MAP.advanced;
  if (d === 'freeride' || d === 'orange' || d === 'naranja') {
    return {
      key: 'advanced' as DifficultyFilterKey,
      label: 'Freeride',
      sublabel: 'Itinerario',
      color: '#ea580c',
      badgeBg: '#ffedd5',
      badgeText: '#ea580c',
    };
  }
  return {
    key: 'easy' as DifficultyFilterKey,
    label: 'Pista',
    sublabel: 'General',
    color: '#64748b',
    badgeBg: '#f1f5f9',
    badgeText: '#475569',
  };
};

export const isLikelyHash = (str?: string): boolean => {
  if (!str) return false;
  const clean = str.trim().replace(/^pista\s*#?/i, '').trim();
  return /^[a-f0-9]{16,64}$/i.test(clean);
};

export const hasNamedPiste = (piste: Piste): boolean => {
  if (piste.Name && piste.Name.trim() !== '' && !isLikelyHash(piste.Name)) return true;
  const tags = piste.Tags || {};
  for (const k of ['piste:name', 'name', 'name:es', 'name:en', 'name:fr']) {
    if (tags[k] && typeof tags[k] === 'string' && tags[k].trim() !== '' && !isLikelyHash(tags[k])) {
      return true;
    }
  }
  if (tags['piste:ref'] || tags.ref) return true;
  if (tags.description || tags['description:es'] || tags.destination) return true;
  const nested = tags.tags;
  if (nested && typeof nested === 'object') {
    for (const k of ['piste:name', 'name', 'name:es', 'name:en']) {
      if (nested[k] && typeof nested[k] === 'string' && nested[k].trim() !== '' && !isLikelyHash(nested[k])) {
        return true;
      }
    }
    if (nested['piste:ref'] || nested.ref) return true;
  }
  return false;
};

export const getPisteName = (piste: Piste): string => {
  // 1. Direct Name from model
  if (piste.Name && piste.Name.trim() !== '' && !isLikelyHash(piste.Name)) {
    return piste.Name.trim();
  }

  // 2. Direct Tags
  const tags = piste.Tags || {};
  for (const k of ['piste:name', 'name', 'name:es', 'name:en', 'name:fr']) {
    if (tags[k] && typeof tags[k] === 'string' && tags[k].trim() !== '' && !isLikelyHash(tags[k])) {
      return tags[k].trim();
    }
  }

  // 3. Reference number / code (e.g. "12" or "A")
  const ref = tags['piste:ref'] || tags.ref;
  if (ref !== undefined && ref !== null && String(ref).trim() !== '' && !isLikelyHash(String(ref))) {
    return `Pista ${String(ref).trim()}`;
  }

  // 4. Description or destination
  const desc = tags.description || tags['description:es'] || tags.destination || tags.to;
  if (desc && typeof desc === 'string' && desc.trim() !== '' && !isLikelyHash(desc)) {
    return desc.trim();
  }

  // 5. Nested tags in Tags.tags
  const nested = tags.tags;
  if (nested && typeof nested === 'object') {
    for (const k of ['piste:name', 'name', 'name:es', 'name:en']) {
      if (nested[k] && typeof nested[k] === 'string' && nested[k].trim() !== '' && !isLikelyHash(nested[k])) {
        return nested[k].trim();
      }
    }
    const nestedRef = nested['piste:ref'] || nested.ref;
    if (nestedRef !== undefined && nestedRef !== null && String(nestedRef).trim() !== '' && !isLikelyHash(String(nestedRef))) {
      return `Pista ${String(nestedRef).trim()}`;
    }
  }

  // 6. Friendly, readable fallback for unnamed connectors / tracks (NEVER raw database hash IDs)
  const meta = getPisteDifficultyMeta(piste.Difficulty);
  const isConnection =
    (piste.PisteType as string) === 'connection' ||
    tags['piste:type'] === 'connection' ||
    tags.route === 'connection';

  return isConnection ? `Enlace ${meta.label}` : `Variante ${meta.label}`;
};

export const getPisteDistanceMeters = (piste: Piste): number => {
  const heights = piste.Tags?.elevationProfile?.heights || [];
  const resolution = piste.Tags?.elevationProfile?.resolution || 25;
  if (heights.length > 1) {
    return Math.round((heights.length - 1) * resolution);
  }
  const coords = piste.GeometryGeoJSON?.coordinates || [];
  if (coords.length < 2) return 0;
  let dist = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const R = 6371e3;
    const phi1 = (p1[1] * Math.PI) / 180;
    const phi2 = (p2[1] * Math.PI) / 180;
    const deltaPhi = ((p2[1] - p1[1]) * Math.PI) / 180;
    const deltaLambda = ((p2[0] - p1[0]) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    dist += R * c;
  }
  return Math.round(dist);
};

export const getPisteElevationStats = (piste: Piste) => {
  const heights = piste.Tags?.elevationProfile?.heights;
  if (Array.isArray(heights) && heights.length > 0) {
    const minElev = Math.round(Math.min(...heights));
    const maxElev = Math.round(Math.max(...heights));
    return {
      minElev,
      maxElev,
      drop: maxElev > minElev ? maxElev - minElev : 0,
    };
  }
  const coords = piste.GeometryGeoJSON?.coordinates;
  if (Array.isArray(coords) && coords.length > 0) {
    const elevs = coords
      .map((c) => c[2])
      .filter((e) => typeof e === 'number' && !isNaN(e) && e > 200 && e < 5000);
    if (elevs.length > 0) {
      const minElev = Math.round(Math.min(...elevs));
      const maxElev = Math.round(Math.max(...elevs));
      return {
        minElev,
        maxElev,
        drop: maxElev > minElev ? maxElev - minElev : 0,
      };
    }
  }
  return null;
};

export const getPisteTypeLabel = (type?: string) => {
  switch ((type || '').toLowerCase()) {
    case 'downhill':
      return 'Descenso';
    case 'snowpark':
      return 'Snowpark';
    case 'freeride':
      return 'Freeride';
    case 'freestyle':
      return 'Freestyle';
    case 'cross_country':
      return 'Esquí de fondo';
    case 'touring':
      return 'Travesía';
    case 'sledding':
      return 'Trineos';
    default:
      return 'Pista alpina';
  }
};

interface SkiinfoResortDetailProps {
  resort: Resort | ResortDetail;
  weatherData: WeatherForecast | null;
  selectedModel?: WeatherModelId;
  onSelectModel?: (model: WeatherModelId) => void;
  sessions?: any[];
  isLoadingSessions?: boolean;
  isRefreshingWeather?: boolean;
  onRefreshWeather?: () => void;
  onClose: () => void;
  onOpenMap?: () => void;
  onOpenPiste?: (piste: Piste) => void;
  onStartTracking?: () => void;
  onDownloadOffline?: () => void;
}

const SCALE_LEVELS = [
  { level: 1, title: 'Débil', color: '#16a34a' },
  { level: 2, title: 'Moderado', color: '#ca8a04' },
  { level: 3, title: 'Notable', color: '#ea580c' },
  { level: 4, title: 'Fuerte', color: '#dc2626' },
  { level: 5, title: 'Muy Fuerte', color: '#7f1d1d' },
];

const parseLiftType = (liftType: string) => {
  switch (liftType?.toLowerCase()) {
    case 'chair_lift':
      return 'Telesillas';
    case 'drag_lift':
      return 'Telesquís';
    case 'gondola':
      return 'Telecabinas';
    case 'cable_car':
      return 'Teleféricos';
    case 'funicular':
      return 'Funiculares';
    case 'magic_carpet':
      return 'Cintas transportadoras';
    case 'rope_tow':
      return 'Telecuerdas';
    default:
      return liftType ? liftType.replace(/_/g, ' ') : 'Remonte';
  }
};

const WindDirectionArrow: React.FC<{ degrees?: number; size?: number; color?: string }> = ({
  degrees = 0,
  size = 12,
  color = '#0284c7',
}) => {
  const rotation = (degrees + 180) % 360;
  return (
    <View
      style={{
        transform: [{ rotate: `${rotation}deg` }],
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <ArrowUp size={size} color={color} strokeWidth={2.4} />
    </View>
  );
};

const getWeatherCodeLabel = (code: number) => {
  switch (code) {
    case 0:
      return 'Despejado';
    case 1:
      return 'Mayormente despejado';
    case 2:
      return 'Intervalos nubosos';
    case 3:
      return 'Nublado';
    case 45:
    case 48:
      return 'Niebla en montaña';
    case 51:
    case 53:
    case 55:
      return 'Llovizna';
    case 61:
    case 63:
    case 65:
      return 'Lluvia';
    case 71:
      return 'Nevada débil';
    case 73:
      return 'Nevada moderada';
    case 75:
      return 'Nevada copiosa';
    case 77:
      return 'Granizo o cinarra';
    case 85:
    case 86:
      return 'Chubascos de nieve';
    case 95:
    case 96:
    case 99:
      return 'Tormenta';
    default:
      return 'Variable';
  }
};

const renderWeatherIcon = (code: number, size = 20) => {
  switch (code) {
    case 0:
      return <Sun size={size} color="#f59e0b" />;
    case 1:
    case 2:
      return <Cloud size={size} color="#0284c7" />;
    case 3:
      return <Cloud size={size} color="#64748b" />;
    case 45:
    case 48:
      return <Cloud size={size} color="#94a3b8" />;
    case 51:
    case 53:
    case 55:
    case 61:
    case 63:
    case 65:
      return <CloudRain size={size} color="#0284c7" />;
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return <Snowflake size={size} color="#0284c7" />;
    case 95:
    case 96:
    case 99:
      return <CloudLightning size={size} color="#ea580c" />;
    default:
      return <Cloud size={size} color="#64748b" />;
  }
};

const getVisibilityInfo = (visibilityMeters?: number) => {
  if (visibilityMeters === undefined || visibilityMeters === null) {
    return { label: 'Buena', color: '#0284c7', bgColor: '#e0f2fe' };
  }
  if (visibilityMeters >= 10000) {
    return { label: 'Excelente', color: '#059669', bgColor: '#ecfdf5' };
  }
  if (visibilityMeters >= 4000) {
    return { label: 'Buena', color: '#0284c7', bgColor: '#e0f2fe' };
  }
  if (visibilityMeters >= 1000) {
    return { label: 'Media', color: '#d97706', bgColor: '#fef3c7' };
  }
  return { label: 'Baja', color: '#dc2626', bgColor: '#fee2e2' };
};

export const SkiinfoResortDetail: React.FC<SkiinfoResortDetailProps> = ({
  resort,
  weatherData,
  selectedModel,
  onSelectModel,
  sessions = [],
  isLoadingSessions = false,
  isRefreshingWeather = false,
  onRefreshWeather,
  onClose,
  onOpenMap,
  onOpenPiste,
  onStartTracking,
  onDownloadOffline,
}) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { isFavorite, toggleFavorite } = useFavorites();
  const isWeb = Platform.OS === 'web';

  const currentModelKey: WeatherModelId = (selectedModel || (weatherData?.forecast_model as WeatherModelId) || 'ecmwf_ifs025');
  const activeModelInfo = WEATHER_MODELS[currentModelKey] || WEATHER_MODELS.ecmwf_ifs025;

  const todayFormattedDate = useMemo(() => {
    const d = new Date();
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const weekday = days[d.getDay()];
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${weekday} ${pad(day)}/${pad(month)}/${year}`;
  }, []);

  const stationStatus = useMemo(() => {
    const raw = ((resort as any).status || '').toUpperCase();
    if (raw === 'OPEN' || raw === 'ABIERTA') {
      return { label: 'ABIERTA', color: '#16a34a', bg: '#dcfce7', text: '#15803d' };
    }
    return { label: 'CERRADA', color: '#dc2626', bg: '#fee2e2', text: '#b91c1c' };
  }, [resort]);

  const [activeTab, setActiveTab] = useState<SkiinfoTab>('snow');
  const [selectedDifficultyFilter, setSelectedDifficultyFilter] = useState<DifficultyFilterKey>('all');
  const [pisteSearchQuery, setPisteSearchQuery] = useState('');
  const [showUnnamedLinks, setShowUnnamedLinks] = useState(false);
  const [sevenDayCardWidth, setSevenDayCardWidth] = useState<number>(0);
  const [selectedSevenDayIdx, setSelectedSevenDayIdx] = useState<number>(0);

  const allPistes = useMemo(() => {
    const raw = resort.pistes || [];
    return raw.filter((p) => p && !('category' in p));
  }, [resort.pistes]);

  const namedPistes = useMemo(() => {
    return allPistes.filter(hasNamedPiste);
  }, [allPistes]);

  const unnamedPistes = useMemo(() => {
    return allPistes.filter((p) => !hasNamedPiste(p));
  }, [allPistes]);

  // Display base: prefer official/named pistes unless user chooses to include links or resort has only unnamed pistes
  const displayBasePistes = useMemo(() => {
    if (showUnnamedLinks || namedPistes.length === 0) {
      return allPistes;
    }
    return namedPistes;
  }, [allPistes, namedPistes, showUnnamedLinks]);

  const filteredPistes = useMemo(() => {
    // When actively searching with text, search across all pistes so nothing is missed
    const source = pisteSearchQuery.trim() ? allPistes : displayBasePistes;

    return source.filter((piste) => {
      // 1. Difficulty filter
      if (selectedDifficultyFilter !== 'all') {
        const meta = getPisteDifficultyMeta(piste.Difficulty);
        if (meta.key !== selectedDifficultyFilter) {
          return false;
        }
      }

      // 2. Search query filter
      if (pisteSearchQuery.trim()) {
        const q = pisteSearchQuery.toLowerCase().trim();
        const name = getPisteName(piste).toLowerCase();
        const ref = (piste.Tags?.ref || piste.Tags?.['piste:ref'] || '').toLowerCase();
        if (!name.includes(q) && !ref.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [allPistes, displayBasePistes, selectedDifficultyFilter, pisteSearchQuery]);

  // Horizontal scroll references & handlers (wheel, drag & buttons on Web & Mobile)
  const hourlyScrollRef = useRef<ScrollView>(null);
  const sevenDayScrollRef = useRef<ScrollView>(null);
  const snowForecastScrollRef = useRef<ScrollView>(null);

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const activeDragScrollRef = useRef<React.RefObject<ScrollView | null> | null>(null);

  const scrollHorizontal = (scrollRef: React.RefObject<ScrollView | null>, offset: number) => {
    if (scrollRef.current) {
      if (Platform.OS === 'web') {
        const node =
          (scrollRef.current as any).getScrollableNode?.() ||
          (scrollRef.current as any);
        if (node && typeof node.scrollBy === 'function') {
          node.scrollBy({ left: offset, behavior: 'smooth' });
          return;
        }
      }
      // @ts-ignore
      scrollRef.current.scrollTo?.({ x: Math.max(0, offset), animated: true });
    }
  };

  const touchStartXRef = useRef<number | null>(null);

  const handleDayTouchStart = (e: any) => {
    touchStartXRef.current = e?.nativeEvent?.pageX ?? e?.nativeEvent?.clientX ?? 0;
  };

  const handleDayTouchEnd = (e: any) => {
    if (touchStartXRef.current === null) return;
    const endX = e?.nativeEvent?.pageX ?? e?.nativeEvent?.clientX ?? 0;
    const deltaX = endX - touchStartXRef.current;
    touchStartXRef.current = null;
    const maxIdx = Math.min(6, (weatherData?.daily?.time?.length ?? 1) - 1);
    if (deltaX < -45) {
      // Swiped left -> next day
      if (selectedSevenDayIdx < maxIdx) {
        setSelectedSevenDayIdx(selectedSevenDayIdx + 1);
      }
    } else if (deltaX > 45) {
      // Swiped right -> prev day
      if (selectedSevenDayIdx > 0) {
        setSelectedSevenDayIdx(selectedSevenDayIdx - 1);
      }
    }
  };

  const selectedDayHours = useMemo(() => {
    if (!weatherData?.hourly?.time || !weatherData?.daily?.time?.[selectedSevenDayIdx]) return [];
    const datePrefix = weatherData.daily.time[selectedSevenDayIdx].split('T')[0];
    const items: Array<{
      timeLabel: string;
      temp: number;
      weatherCode: number;
      snow: number;
      precip: number;
    }> = [];
    for (let i = 0; i < weatherData.hourly.time.length; i++) {
      const t = weatherData.hourly.time[i];
      if (t.startsWith(datePrefix)) {
        const hour = t.substring(11, 16);
        items.push({
          timeLabel: hour,
          temp: Math.round(weatherData.hourly.temperature_2m?.[i] ?? 0),
          weatherCode: weatherData.hourly.weather_code?.[i] ?? 0,
          snow: weatherData.hourly.snowfall?.[i] ?? 0,
          precip: weatherData.hourly.precipitation?.[i] ?? 0,
        });
      }
    }
    return items;
  }, [weatherData?.hourly, weatherData?.daily?.time, selectedSevenDayIdx]);

  const scrollToSevenDay = (idx: number) => {
    setSelectedSevenDayIdx(idx);
  };

  const handleWheel = (scrollRef: React.RefObject<ScrollView | null>, e: any) => {
    if (Platform.OS === 'web' && scrollRef.current) {
      const delta = e?.deltaY || e?.nativeEvent?.deltaY || e?.deltaX || e?.nativeEvent?.deltaX;
      if (delta) {
        const node =
          (scrollRef.current as any).getScrollableNode?.() ||
          (scrollRef.current as any);
        if (node) {
          node.scrollLeft += delta;
        }
      }
    }
  };

  const handleMouseDown = (scrollRef: React.RefObject<ScrollView | null>, e: any) => {
    if (Platform.OS === 'web' && scrollRef.current) {
      const node =
        (scrollRef.current as any).getScrollableNode?.() ||
        (scrollRef.current as any);
      if (node) {
        isDraggingRef.current = true;
        activeDragScrollRef.current = scrollRef;
        startXRef.current = (e.pageX || e.clientX || 0) - node.offsetLeft;
        scrollLeftRef.current = node.scrollLeft || 0;
      }
    }
  };

  const handleMouseMove = (e: any) => {
    if (Platform.OS === 'web' && isDraggingRef.current && activeDragScrollRef.current?.current) {
      e.preventDefault?.();
      const node =
        (activeDragScrollRef.current.current as any).getScrollableNode?.() ||
        (activeDragScrollRef.current.current as any);
      if (node) {
        const pageX = e.pageX || e.clientX || 0;
        const x = pageX - node.offsetLeft;
        const walk = (x - startXRef.current) * 1.5;
        node.scrollLeft = scrollLeftRef.current - walk;
      }
    }
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
    activeDragScrollRef.current = null;
  };

  // Find fallback elevation seed if resort tags lack full elevation data
  const seedMatch = useMemo(() => {
    const cleanName = resort.Name.toLowerCase();
    return SPAIN_ANDORRA_RESORTS.find(
      (s) =>
        s.id === resort.ID ||
        cleanName.includes(s.id) ||
        cleanName.includes(s.name.toLowerCase()) ||
        s.name.toLowerCase().includes(cleanName)
    );
  }, [resort]);

  // Resort stats calculation
  const stats = useMemo(() => {
    const tagsStats = resort.Tags?.statistics;
    const liftsType = tagsStats?.lifts?.byType;
    const downhillByDiff = tagsStats?.runs?.byActivity?.downhill?.byDifficulty;
    const pistes = resort.pistes || [];
    const lifts = resort.lifts || [];

    let minElev = tagsStats?.minElevation ?? tagsStats?.runs?.minElevation ?? tagsStats?.lifts?.minElevation ?? 0;
    let maxElev = tagsStats?.maxElevation ?? tagsStats?.runs?.maxElevation ?? tagsStats?.lifts?.maxElevation ?? 0;

    if (!minElev && weatherData?.snow_report?.base_elevation_m) {
      minElev = Math.round(weatherData.snow_report.base_elevation_m);
    }
    if (!maxElev && weatherData?.snow_report?.summit_elevation_m) {
      maxElev = Math.round(weatherData.snow_report.summit_elevation_m);
    }

    if ((!minElev || !maxElev) && seedMatch) {
      if (!minElev) minElev = seedMatch.base_elevation_m;
      if (!maxElev) maxElev = seedMatch.summit_elevation_m;
    }

    minElev = Math.round(minElev);
    maxElev = Math.round(maxElev);

    if (minElev && maxElev && maxElev < minElev) {
      const temp = minElev;
      minElev = maxElev;
      maxElev = temp;
    }

    const verticalDrop = maxElev > minElev ? Math.round(maxElev - minElev) : 0;
    let midElev = weatherData?.snow_report?.mid_elevation_m ? Math.round(weatherData.snow_report.mid_elevation_m) : undefined;
    if (!midElev && minElev && maxElev) {
      midElev = Math.round((minElev + maxElev) / 2);
    }

    const difficultyCounts = downhillByDiff
      ? {
          novice: downhillByDiff.novice?.count ?? 0,
          easy: downhillByDiff.easy?.count ?? 0,
          intermediate: downhillByDiff.intermediate?.count ?? 0,
          advanced: (downhillByDiff.advanced?.count ?? 0) + ((downhillByDiff as any).expert?.count ?? 0),
        }
      : {
          novice: pistes.filter((p) => p.Difficulty?.toLowerCase() === 'novice').length,
          easy: pistes.filter((p) => p.Difficulty?.toLowerCase() === 'easy').length,
          intermediate: pistes.filter((p) => p.Difficulty?.toLowerCase() === 'intermediate').length,
          advanced: pistes.filter(
            (p) => p.Difficulty?.toLowerCase() === 'advanced' || p.Difficulty?.toLowerCase() === 'expert'
          ).length,
        };

    const difficultyLengths = downhillByDiff
      ? {
          novice: (downhillByDiff.novice?.lengthInKm ?? 0) * 1000,
          easy: (downhillByDiff.easy?.lengthInKm ?? 0) * 1000,
          intermediate: (downhillByDiff.intermediate?.lengthInKm ?? 0) * 1000,
          advanced:
            ((downhillByDiff.advanced?.lengthInKm ?? 0) + ((downhillByDiff as any).expert?.lengthInKm ?? 0)) * 1000,
        }
      : {
          novice: 0,
          easy: 0,
          intermediate: 0,
          advanced: 0,
        };

    const totalLifts = (resort as Resort).total_lifts ?? lifts.length ?? 0;
    const totalPistes =
      (resort as Resort).total_pistes ??
      difficultyCounts.novice + difficultyCounts.easy + difficultyCounts.intermediate + difficultyCounts.advanced;
    const totalKm = (resort as Resort).distance_km ?? 0;

    const liftTypeCounts: Record<string, number> = {};
    if (liftsType) {
      Object.entries(liftsType).forEach(([type, data]: [string, any]) => {
        if (data && typeof data.count === 'number' && data.count > 0) {
          liftTypeCounts[type] = data.count;
        }
      });
    }

    return {
      minElev,
      midElev,
      maxElev,
      verticalDrop,
      totalLifts,
      totalPistes,
      totalKm: totalKm.toFixed(1),
      difficultyCounts,
      difficultyLengths,
      liftTypeCounts,
    };
  }, [resort, weatherData, seedMatch]);

  const snowReport = weatherData?.snow_report;
  const current = weatherData?.current;

  const baseDepth = snowReport?.snow_depth_base_cm;
  const summitDepth = snowReport?.snow_depth_summit_cm;
  const midDepth =
    snowReport?.snow_depth_mid_cm ??
    (baseDepth !== undefined && summitDepth !== undefined
      ? Math.round((baseDepth + summitDepth) / 2)
      : undefined);

  // Powder alarm check (Skiinfo hallmark)
  const isPowderAlarm = useMemo(() => {
    if (!snowReport) return false;
    return snowReport.fresh_snow_24h_cm >= 15 || snowReport.fresh_snow_48h_cm >= 20 || snowReport.forecast_snow_7d_cm >= 25;
  }, [snowReport]);

  // Today's snowfall estimates by elevation (Cota Baja, Intermedia, Máxima)
  const todaySnowSummit = useMemo(() => {
    if (snowReport?.snowfall_today_summit_cm !== undefined) {
      return snowReport.snowfall_today_summit_cm;
    }
    if (weatherData?.daily?.snowfall_sum?.[0] !== undefined) {
      return Math.round(weatherData.daily.snowfall_sum[0] * 10) / 10;
    }
    return snowReport?.fresh_snow_24h_cm ?? 0;
  }, [snowReport, weatherData]);

  // Freezing level & Snow line analysis
  const freezingLevelInfo = useMemo(() => {
    if (!snowReport || !snowReport.freezing_level_m) return null;
    const isocero = Math.round(snowReport.freezing_level_m);
    // La cota de nieve efectiva se sitúa habitualmente ~250m por debajo del isocero (0°C)
    const snowLine = Math.round(snowReport.snow_line_m || Math.max(0, isocero - 250));

    const minElev = stats.minElev || 1660;
    const maxElev = stats.maxElev || 2300;

    if (snowLine <= minElev) {
      return {
        altitude: snowLine,
        isocero,
        status: 'base',
        label: t('snow_to_base', `❄️ Cota de nieve a ~${snowLine}m (hasta la base)`),
        color: '#0284c7',
      };
    }
    if (snowLine <= maxElev) {
      return {
        altitude: snowLine,
        isocero,
        status: 'mid',
        label: t('snow_mid_mountain', `❄️ Cota de nieve a ~${snowLine}m (nieve en cumbre y cotas medias)`),
        color: '#0284c7',
      };
    }
    // Si la cota de nieve actual está alta pero hay nevada registrada hoy (ej. frente frío en cumbre)
    if (todaySnowSummit > 0) {
      return {
        altitude: snowLine,
        isocero,
        status: 'mid',
        label: t('snow_today_summit_info', `❄️ Nevada en cumbre (+${todaySnowSummit} cm). Cota actual subiendo a ~${snowLine}m`),
        color: '#0284c7',
      };
    }
    return {
      altitude: snowLine,
      isocero,
      status: 'high',
      label: t('snow_above_summit', `💧 Cota de nieve a ~${snowLine}m (por encima de la cumbre, lluvia)`),
      color: '#f59e0b',
    };
  }, [snowReport, stats, todaySnowSummit, t]);

  const windDirInfo = useMemo(() => {
    const deg = current?.wind_direction_10m ?? 0;
    return getWindDirectionInfo(deg);
  }, [current]);

  const snowConditionLabel = useMemo(() => {
    if (!snowReport) return t('snow_condition_packed_powder', 'Polvo dura');
    return (
      t(`snow_condition_${snowReport.snow_condition}`, {
        defaultValue: snowReport.snow_condition_label || t('snow_condition_packed_powder', 'Polvo dura'),
      }) || 'Polvo dura'
    );
  }, [snowReport, t]);

  // Formatted last snowfall text
  const lastSnowfallText = useMemo(() => {
    if (!snowReport?.last_snowfall_date) return null;
    try {
      const d = new Date(snowReport.last_snowfall_date);
      const dateStr = d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
      return `${dateStr} (+${snowReport.last_snowfall_amount_cm} cm)`;
    } catch {
      return `${snowReport.last_snowfall_date} (+${snowReport.last_snowfall_amount_cm} cm)`;
    }
  }, [snowReport, i18n.language]);

  const todaySnowBase = useMemo(() => {
    if (snowReport?.snowfall_today_base_cm !== undefined) {
      return snowReport.snowfall_today_base_cm;
    }
    if (todaySnowSummit > 0 && freezingLevelInfo) {
      const baseElev = stats.minElev || 1600;
      const snowLevel = freezingLevelInfo.altitude - 250;
      if (snowLevel <= baseElev) {
        return Math.round(todaySnowSummit * 0.75 * 10) / 10;
      } else if (snowLevel <= baseElev + 150) {
        return Math.round(todaySnowSummit * 0.25 * 10) / 10;
      }
      return 0;
    }
    return 0;
  }, [snowReport, todaySnowSummit, freezingLevelInfo, stats.minElev]);

  const todaySnowMid = useMemo(() => {
    if (snowReport?.snowfall_today_mid_cm !== undefined) {
      return snowReport.snowfall_today_mid_cm;
    }
    if (todaySnowSummit > 0 && freezingLevelInfo) {
      const midElev = stats.midElev || ((stats.minElev || 1600) + (stats.maxElev || 2300)) / 2;
      const maxElev = stats.maxElev || 2300;
      const snowLevel = freezingLevelInfo.altitude - 250;
      if (snowLevel <= midElev) {
        if (todaySnowBase > 0) {
          return Math.round(((todaySnowBase + todaySnowSummit) / 2) * 10) / 10;
        }
        const fraction = Math.max(0.2, Math.min(0.85, (midElev - snowLevel) / Math.max(1, maxElev - snowLevel)));
        return Math.round(todaySnowSummit * fraction * 10) / 10;
      }
      return 0;
    }
    return Math.round(((todaySnowBase + todaySnowSummit) / 2) * 10) / 10;
  }, [snowReport, todaySnowBase, todaySnowSummit, freezingLevelInfo, stats]);

  return (
    <View style={styles.container}>
      {/* Top Header Card */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <ResortLogo website={resort.Website} size={48} />
          <View style={styles.headerTitleCol}>
            <View style={styles.locationPill}>
              <MapPin size={11} color={colors.primary} />
              <Text style={styles.locationText}>{resort.Country || 'España / Andorra'}</Text>
            </View>
            <Text style={styles.resortTitle} numberOfLines={1}>
              {resort.Name}
            </Text>
          </View>

          <View style={styles.headerActions}>
            {onRefreshWeather && (
              <TouchableOpacity
                onPress={onRefreshWeather}
                style={styles.headerIconBtn}
                accessibilityLabel="Actualizar tiempo"
                disabled={isRefreshingWeather}>
                <RefreshCw
                  size={18}
                  color={colors.textSecondary}
                  style={isRefreshingWeather ? { transform: [{ rotate: '45deg' }] } : {}}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => toggleFavorite(resort as Resort)}
              style={styles.headerIconBtn}
              accessibilityLabel="Favorita">
              <Star
                size={18}
                color={isFavorite(resort.ID) ? '#f59e0b' : colors.textSecondary}
                fill={isFavorite(resort.ID) ? '#f59e0b' : 'transparent'}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.headerIconBtn} accessibilityLabel="Cerrar">
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Skiinfo Mountain Key Stats Bar (Altitude / Vertical Drop / Km / Lifts) */}
        <View style={styles.mountainStatsBar}>
          <View style={styles.mountainStatItem}>
            <Mountain size={13} color={colors.primary} />
            <View>
              <Text style={styles.mountainStatLabel}>{t('elevation', 'Cotas')}</Text>
              <Text style={styles.mountainStatValue}>
                {stats.minElev ? `${stats.minElev} - ${stats.maxElev}m` : '--'}
              </Text>
            </View>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.mountainStatItem}>
            <ArrowUpRight size={13} color="#0284c7" />
            <View>
              <Text style={styles.mountainStatLabel}>{t('vertical_drop', 'Desnivel')}</Text>
              <Text style={[styles.mountainStatValue, { color: '#0284c7' }]}>
                {stats.verticalDrop > 0 ? `${Math.round(stats.verticalDrop)} m` : '--'}
              </Text>
            </View>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.mountainStatItem}>
            <Layers size={13} color="#10b981" />
            <View>
              <Text style={styles.mountainStatLabel}>{t('slopes', 'Pistas')}</Text>
              <Text style={styles.mountainStatValue}>
                {stats.totalKm} km ({stats.totalPistes})
              </Text>
            </View>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.mountainStatItem}>
            <Navigation size={13} color="#f59e0b" />
            <View>
              <Text style={styles.mountainStatLabel}>{t('lifts', 'Remontes')}</Text>
              <Text style={styles.mountainStatValue}>{stats.totalLifts}</Text>
            </View>
          </View>
        </View>

        {/* Skiinfo Powder Alarm Ribbon */}
        {isPowderAlarm && (
          <View style={styles.powderAlarmRibbon}>
            <Sparkles size={16} color="#ffffff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.powderAlarmTitle}>POWDER ALARM ❄️ ¡Alerta de Nieve en Polvo!</Text>
              <Text style={styles.powderAlarmSubtitle}>
                {t(
                  'powder_alarm_text',
                  'Se esperan importantes nevadas en la estación. Condiciones óptimas para esquiar.'
                )}
              </Text>
            </View>
          </View>
        )}

        {/* Skiinfo Segmented Tab Navigation */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'snow' && styles.tabBtnActive]}
            onPress={() => setActiveTab('snow')}>
            <Snowflake size={14} color={activeTab === 'snow' ? '#ffffff' : colors.primary} />
            <Text style={[styles.tabBtnText, activeTab === 'snow' && styles.tabBtnTextActive]}>
              {t('tab_snow_report', 'Parte Nieve')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'pistes' && styles.tabBtnActive]}
            onPress={() => setActiveTab('pistes')}>
            <Layers size={14} color={activeTab === 'pistes' ? '#ffffff' : colors.textSecondary} />
            <Text style={[styles.tabBtnText, activeTab === 'pistes' && styles.tabBtnTextActive]}>
              {t('tab_slopes_lifts', 'Pistas & Remontes')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'weather' && styles.tabBtnActive]}
            onPress={() => setActiveTab('weather')}>
            <Cloud size={14} color={activeTab === 'weather' ? '#ffffff' : colors.textSecondary} />
            <Text style={[styles.tabBtnText, activeTab === 'weather' && styles.tabBtnTextActive]}>
              {t('tab_weather', 'El Tiempo')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'community' && styles.tabBtnActive]}
            onPress={() => setActiveTab('community')}>
            <Activity size={14} color={activeTab === 'community' ? '#ffffff' : colors.textSecondary} />
            <Text style={[styles.tabBtnText, activeTab === 'community' && styles.tabBtnTextActive]}>
              {t('tab_community', 'Sesiones')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Tab Content */}
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefreshWeather ? (
            <RefreshControl
              refreshing={Boolean(isRefreshingWeather)}
              onRefresh={onRefreshWeather}
              tintColor={colors.primary}
            />
          ) : undefined
        }>
        {/* ========================================================================= */}
        {/* TAB 1: PARTE DE NIEVE (SNOW REPORT - SKIINFO EXPERIENCE) */}
        {/* ========================================================================= */}
        {activeTab === 'snow' && (
          <View style={styles.tabSection}>
            {/* 1. Infonieve Snow Report Header */}
            <View style={styles.infonieveStatusCard}>
              <View style={styles.infonieveStatusTopRow}>
                <View style={[styles.infonieveStatusBadge, { backgroundColor: colors.primary + '18' }]}>
                  <Snowflake size={14} color={colors.primary} />
                  <Text style={[styles.infonieveStatusBadgeText, { color: colors.primary }]}>
                    {t('snow_forecast_bulletin', 'PARTE DE NIEVE')}
                  </Text>
                </View>
                <View style={styles.infonieveStatusDateBox}>
                  <Text style={styles.infonieveStatusDateText}>{todayFormattedDate}</Text>
                  <Text style={styles.infonieveStatusUpdatedText}>
                    {t('updated_today', 'Actualizado hoy')} · {currentModelKey === 'ecmwf_ifs025' ? 'Modelo ECMWF (Infonieve)' : activeModelInfo.name}
                  </Text>
                </View>
              </View>
            </View>

            {/* 2. ESTADO DE LA NIEVE (Infonieve 4 Bloques: box_est_partedet_datosnieve) */}
            <View style={styles.infonieveCard}>
              <View style={styles.infonieveHeaderRow}>
                <Text style={styles.infonieveSectionTitle}>
                  {t('snow_conditions_title', 'ESTADO DE LA NIEVE')}
                </Text>
                <Text style={styles.infonieveSectionSub}>Parte oficial de espesores</Text>
              </View>
              <View style={styles.infonieveGrid4}>
                {/* Espesor Mínimo */}
                <View style={styles.infonieveBox}>
                  <Text style={styles.infonieveBoxLabel}>{t('min_depth', 'Espesor Mínimo')}</Text>
                  <View style={styles.infonieveBoxValRow}>
                    <Text style={styles.infonieveBoxValue}>{baseDepth !== undefined ? Math.round(baseDepth) : 0}</Text>
                    <Text style={styles.infonieveBoxUnit}>cm</Text>
                  </View>
                  <Text style={styles.infonieveBoxSub}>
                    {stats.minElev ? `Cota baja (${stats.minElev} m)` : 'Cota baja'}
                  </Text>
                </View>

                {/* Espesor Máximo */}
                <View style={styles.infonieveBox}>
                  <Text style={styles.infonieveBoxLabel}>{t('max_depth', 'Espesor Máximo')}</Text>
                  <View style={styles.infonieveBoxValRow}>
                    <Text style={styles.infonieveBoxValue}>{summitDepth !== undefined ? Math.round(summitDepth) : 0}</Text>
                    <Text style={styles.infonieveBoxUnit}>cm</Text>
                  </View>
                  <Text style={styles.infonieveBoxSub}>
                    {stats.maxElev ? `Cota alta (${stats.maxElev} m)` : 'Cumbre'}
                  </Text>
                </View>

                {/* Calidad de Nieve */}
                <View style={styles.infonieveBox}>
                  <Text style={styles.infonieveBoxLabel}>{t('snow_quality', 'Calidad')}</Text>
                  <Text style={styles.infonieveBoxValueText} numberOfLines={1}>
                    {snowConditionLabel}
                  </Text>
                  <Text style={styles.infonieveBoxSub}>Tipo de nieve</Text>
                </View>

                {/* Peligro de Aludes */}
                <View style={styles.infonieveBox}>
                  <Text style={styles.infonieveBoxLabel}>{t('avalanche_risk', 'Peligro Aludes')}</Text>
                  <View
                    style={[
                      styles.infonieveDangerBadge,
                      { backgroundColor: snowReport?.avalanche_report?.danger_color || '#16a34a' },
                    ]}>
                    <Text style={styles.infonieveDangerBadgeText}>
                      Nivel {snowReport?.avalanche_report?.danger_level ?? 1} · {snowReport?.avalanche_report?.danger_level_title ?? 'Débil'}
                    </Text>
                  </View>
                  <Text style={styles.infonieveBoxSub}>Escala 1 a 5</Text>
                </View>
              </View>
            </View>

            {/* Today's Snowfall by Elevation Hero Card (Cota Baja / Intermedia / Máxima) */}
            <View style={styles.snowDepthCard}>
              <View style={styles.snowDepthHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Snowflake size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>{t('snowfall_today_title', 'Nevada Prevista Hoy')}</Text>
                </View>
                <View style={styles.qualityBadge}>
                  <Text style={styles.qualityBadgeText}>{snowConditionLabel}</Text>
                </View>
              </View>

              <View style={styles.cotasVerticalList}>
                {/* 1. Cota Máxima / Cumbre */}
                <View style={styles.cotaVerticalRow}>
                  <View style={styles.cotaVerticalLeft}>
                    <View style={[styles.cotaDot, { backgroundColor: '#0284c7' }]} />
                    <View>
                      <Text style={styles.cotaVerticalTitle}>Cota Máxima (Cumbre)</Text>
                      <Text style={styles.cotaVerticalAlt}>{stats.maxElev ? `${stats.maxElev} m` : 'Cumbre'}</Text>
                    </View>
                  </View>
                  <View style={styles.cotaVerticalCenter}>
                    <View style={styles.cotaBarTrack}>
                      <View
                        style={[
                          styles.cotaBarFill,
                          {
                            width: `${Math.min(100, Math.max(todaySnowSummit > 0 ? 12 : 0, (todaySnowSummit / Math.max(todaySnowSummit, todaySnowBase, 1)) * 100))}%`,
                            backgroundColor: '#0284c7',
                          },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={[styles.cotaVerticalVal, { color: '#0284c7' }]}>
                    {todaySnowSummit > 0 ? `+${todaySnowSummit}` : '0'}{' '}
                    <Text style={styles.cotaVerticalUnit}>cm</Text>
                  </Text>
                </View>

                {/* 2. Cota Intermedia */}
                <View style={styles.cotaVerticalRow}>
                  <View style={styles.cotaVerticalLeft}>
                    <View style={[styles.cotaDot, { backgroundColor: '#0ea5e9' }]} />
                    <View>
                      <Text style={styles.cotaVerticalTitle}>Cota Intermedia</Text>
                      <Text style={styles.cotaVerticalAlt}>{stats.midElev ? `${stats.midElev} m` : 'Media'}</Text>
                    </View>
                  </View>
                  <View style={styles.cotaVerticalCenter}>
                    <View style={styles.cotaBarTrack}>
                      <View
                        style={[
                          styles.cotaBarFill,
                          {
                            width: `${Math.min(100, Math.max(todaySnowMid > 0 ? 12 : 0, (todaySnowMid / Math.max(todaySnowSummit, todaySnowBase, 1)) * 100))}%`,
                            backgroundColor: '#0ea5e9',
                          },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={[styles.cotaVerticalVal, { color: '#0ea5e9' }]}>
                    {todaySnowMid > 0 ? `+${todaySnowMid}` : '0'}{' '}
                    <Text style={styles.cotaVerticalUnit}>cm</Text>
                  </Text>
                </View>

                {/* 3. Cota Baja / Base */}
                <View style={styles.cotaVerticalRow}>
                  <View style={styles.cotaVerticalLeft}>
                    <View style={[styles.cotaDot, { backgroundColor: colors.textSecondary }]} />
                    <View>
                      <Text style={styles.cotaVerticalTitle}>Cota Baja (Base)</Text>
                      <Text style={styles.cotaVerticalAlt}>{stats.minElev ? `${stats.minElev} m` : 'Base'}</Text>
                    </View>
                  </View>
                  <View style={styles.cotaVerticalCenter}>
                    <View style={styles.cotaBarTrack}>
                      <View
                        style={[
                          styles.cotaBarFill,
                          {
                            width: `${Math.min(100, Math.max(todaySnowBase > 0 ? 12 : 0, (todaySnowBase / Math.max(todaySnowSummit, todaySnowBase, 1)) * 100))}%`,
                            backgroundColor: colors.textSecondary,
                          },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={[styles.cotaVerticalVal, { color: colors.textPrimary }]}>
                    {todaySnowBase > 0 ? `+${todaySnowBase}` : '0'}{' '}
                    <Text style={styles.cotaVerticalUnit}>cm</Text>
                  </Text>
                </View>
              </View>
            </View>

            {/* Fresh Snowfall & History Row (Skiinfo metrics) */}
            <View style={styles.snowHistoryGrid}>
              <View style={styles.historyCard}>
                <Text style={styles.historyCardLabel}>{t('fresh_snow_24h', 'Últimas 24h')}</Text>
                <Text style={styles.historyCardValue}>
                  {snowReport?.fresh_snow_24h_cm && snowReport.fresh_snow_24h_cm > 0
                    ? `${snowReport.fresh_snow_24h_cm} cm`
                    : '0 cm'}
                </Text>
                <Text style={styles.historyCardSub}>Nieve fresca caída</Text>
              </View>

              <View style={styles.historyCard}>
                <Text style={styles.historyCardLabel}>{t('fresh_snow_48h', 'Últimas 48h')}</Text>
                <Text style={styles.historyCardValue}>
                  {snowReport?.fresh_snow_48h_cm && snowReport.fresh_snow_48h_cm > 0
                    ? `${snowReport.fresh_snow_48h_cm} cm`
                    : '0 cm'}
                </Text>
                <Text style={styles.historyCardSub}>Acumulado 2 días</Text>
              </View>

              <View style={styles.historyCard}>
                <Text style={styles.historyCardLabel}>{t('last_snowfall', 'Última nevada')}</Text>
                <Text style={[styles.historyCardValue, { fontSize: 13 }]} numberOfLines={1}>
                  {lastSnowfallText || t('no_recent_snow', 'Sin registro')}
                </Text>
                <Text style={styles.historyCardSub}>Fecha y espesor</Text>
              </View>
            </View>

            {/* Freezing Level / Cota de Nieve Card */}
            {freezingLevelInfo && (
              <View style={styles.freezingLevelCard}>
                <View style={styles.freezingLevelLeft}>
                  <Thermometer size={18} color={freezingLevelInfo.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.freezingLevelTitle}>
                      {t('snow_line_title', 'Cota de nieve')}:{' '}
                      <Text style={{ fontWeight: '800', color: colors.textPrimary }}>
                        ~{freezingLevelInfo.altitude} m
                      </Text>
                      {freezingLevelInfo.isocero ? (
                        <Text style={{ fontSize: 11, fontWeight: 'normal', color: colors.textSecondary }}>
                          {' '}(Isocero: {freezingLevelInfo.isocero} m)
                        </Text>
                      ) : null}
                    </Text>
                    <Text style={styles.freezingLevelSubtitle}>{freezingLevelInfo.label}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* 7-Day Snowfall Forecast Timeline (Skiinfo Forecast chart) */}
            <View style={styles.forecastCard}>
              <View style={styles.forecastCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>{t('snow_forecast_7d_title', 'Previsión de Nevadas a 7 días')}</Text>
                  <Text style={styles.forecastSubtitle}>
                    {t('total_expected_7d', 'Acumulación estimada en cumbre (cota máx.):')}{' '}
                    <Text style={{ fontWeight: '800', color: '#0284c7' }}>
                      {snowReport?.forecast_snow_7d_cm ?? 0} cm
                    </Text>
                    {' · '}
                    <Text style={{ fontWeight: '600', color: colors.textSecondary }}>
                      {activeModelInfo.flag} {activeModelInfo.shortName}
                    </Text>
                  </Text>
                </View>
                <View style={styles.hourlyScrollNav}>
                  <TouchableOpacity
                    style={styles.hourlyNavBtn}
                    onPress={() => scrollHorizontal(snowForecastScrollRef, -190)}
                    accessibilityLabel="Ver días anteriores">
                    <ChevronLeft size={16} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.hourlyNavBtn}
                    onPress={() => scrollHorizontal(snowForecastScrollRef, 190)}
                    accessibilityLabel="Ver siguientes días">
                    <ChevronRight size={16} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Weather Model Selector Chips */}
              <View style={styles.modelSelectorContainer}>
                <View style={styles.modelSelectorHeaderRow}>
                  <Text style={styles.modelSelectorLabel}>
                    {t('weather_model', 'Modelo de predicción:')}
                  </Text>
                  {isRefreshingWeather && (
                    <View style={styles.modelUpdatingRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.modelUpdatingText}>{t('updating', 'Cargando modelo...')}</Text>
                    </View>
                  )}
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.modelChipsScroll}>
                  {(Object.keys(WEATHER_MODELS) as WeatherModelId[]).map((mKey) => {
                    const mInfo = WEATHER_MODELS[mKey];
                    const isSelected = currentModelKey === mKey;
                    return (
                      <TouchableOpacity
                        key={mKey}
                        style={[
                          styles.modelChip,
                          isSelected && styles.modelChipActive,
                        ]}
                        onPress={() => onSelectModel?.(mKey)}
                        activeOpacity={0.75}>
                        <Text style={styles.modelChipFlag}>{mInfo.flag}</Text>
                        <View>
                          <Text
                            style={[
                              styles.modelChipTitle,
                              isSelected && styles.modelChipTitleActive,
                            ]}>
                            {mInfo.shortName}
                          </Text>
                          <Text
                            style={[
                              styles.modelChipSub,
                              isSelected && styles.modelChipSubActive,
                            ]}>
                            {mInfo.tag}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Side-by-Side 7-Day Snowfall Forecast (Horizontal Scroll of Vertical Day Cards) */}
              {weatherData?.daily && weatherData.daily.time?.length > 0 ? (
                <View
                  style={styles.hourlyScrollWrapper}
                  // @ts-ignore
                  onWheel={(e: any) => handleWheel(snowForecastScrollRef, e)}
                  // @ts-ignore
                  onMouseDown={(e: any) => handleMouseDown(snowForecastScrollRef, e)}
                  // @ts-ignore
                  onMouseMove={handleMouseMove}
                  // @ts-ignore
                  onMouseUp={handleMouseUpOrLeave}
                  // @ts-ignore
                  onMouseLeave={handleMouseUpOrLeave}>
                  <ScrollView
                    ref={snowForecastScrollRef}
                    horizontal
                    nestedScrollEnabled={true}
                    directionalLockEnabled={true}
                    showsHorizontalScrollIndicator={isWeb}
                    style={styles.hourlyScrollView}
                    contentContainerStyle={styles.forecastDaysScroll}>
                    {weatherData.daily.time.slice(0, 7).map((timeStr, idx) => {
                      const dateObj = new Date(timeStr);
                      const isToday = idx === 0;
                      const dayLabel = isToday
                        ? 'Hoy'
                        : dateObj.toLocaleDateString(i18n.language, { weekday: 'short' });
                      const capitalizedDay = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
                      const dateLabel = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
                      const snowCm = weatherData.daily?.snowfall_sum?.[idx] ?? 0;
                      const precipMm = weatherData.daily?.precipitation_sum?.[idx] ?? 0;
                      const maxT = Math.round(weatherData.daily?.temperature_2m_max?.[idx] ?? 0);
                      const minT = Math.round(weatherData.daily?.temperature_2m_min?.[idx] ?? 0);
                      const hasSnow = snowCm > 0;

                      const snowSummit = hasSnow ? (snowCm >= 1 ? Math.round(snowCm) : Math.round(snowCm * 10) / 10) : 0;
                      const snowMid = hasSnow ? (snowCm >= 1 ? Math.round(snowCm * 0.90) : Math.round(snowCm * 0.85 * 10) / 10) : 0;
                      const snowBase = hasSnow ? (snowCm >= 1 ? Math.round(snowCm * 0.80) : Math.round(snowCm * 0.70 * 10) / 10) : 0;

                      const maxWeekSnow = Math.max(...(weatherData.daily?.snowfall_sum || [1]), 1);

                      return (
                        <View
                          key={timeStr || idx}
                          style={[styles.forecastDayColCard, isToday && styles.forecastDayColCardToday]}>
                          {/* Day Header Row: Day name, Date & Today Badge */}
                          <View style={styles.forecastDayColHeader}>
                            <View style={styles.forecastDayColTitleGroup}>
                              <Text
                                style={[
                                  styles.forecastDayColTitle,
                                  isToday && { color: colors.primary },
                                ]}>
                                {capitalizedDay}
                              </Text>
                              <Text style={styles.forecastDayColDate}>{dateLabel}</Text>
                            </View>
                            {isToday && (
                              <View style={styles.forecastTodayBadge}>
                                <Text style={styles.forecastTodayBadgeText}>Hoy</Text>
                              </View>
                            )}
                          </View>

                          {/* Snow badge pill & Min/Max Temp */}
                          <View style={styles.forecastDayColMetrics}>
                            <View
                              style={[
                                styles.forecastDaySnowPill,
                                hasSnow ? styles.forecastDaySnowPillActive : styles.forecastDaySnowPillEmpty,
                              ]}>
                              <Snowflake size={13} color={hasSnow ? '#ffffff' : colors.textSecondary} />
                              <Text
                                style={[
                                  styles.forecastDaySnowPillText,
                                  hasSnow && styles.forecastDaySnowPillTextActive,
                                ]}>
                                {hasSnow ? `${snowSummit} cm` : '0 cm'}
                              </Text>
                            </View>
                            <Text style={styles.forecastDayColTemp}>
                              {maxT}° / {minT}°
                            </Text>
                          </View>

                          {/* Infonieve 3 Cotas Vertical Stack inside the card */}
                          <View style={styles.forecastDayColCotas}>
                            {/* Cota Cumbre */}
                            <View style={styles.forecastDayColCotaRow}>
                              <View style={styles.forecastDayColCotaLeft}>
                                <View style={[styles.cotaDot, { backgroundColor: '#0284c7' }]} />
                                <Text style={styles.forecastDayColCotaName}>Cumbre</Text>
                                <Text style={styles.forecastDayColCotaAlt}>
                                  ({stats.maxElev ? `${stats.maxElev}m` : 'Alta'})
                                </Text>
                              </View>
                              <Text style={[styles.forecastDayColCotaVal, { color: '#0284c7' }]}>
                                {hasSnow ? `${snowSummit} cm` : '-'}
                              </Text>
                            </View>

                            {/* Cota Media */}
                            <View style={styles.forecastDayColCotaRow}>
                              <View style={styles.forecastDayColCotaLeft}>
                                <View style={[styles.cotaDot, { backgroundColor: '#0ea5e9' }]} />
                                <Text style={styles.forecastDayColCotaName}>Media</Text>
                                <Text style={styles.forecastDayColCotaAlt}>
                                  ({stats.midElev ? `${stats.midElev}m` : 'Media'})
                                </Text>
                              </View>
                              <Text style={[styles.forecastDayColCotaVal, { color: '#0ea5e9' }]}>
                                {hasSnow ? `${snowMid} cm` : '-'}
                              </Text>
                            </View>

                            {/* Cota Base */}
                            <View style={styles.forecastDayColCotaRow}>
                              <View style={styles.forecastDayColCotaLeft}>
                                <View style={[styles.cotaDot, { backgroundColor: colors.textSecondary }]} />
                                <Text style={styles.forecastDayColCotaName}>Base</Text>
                                <Text style={styles.forecastDayColCotaAlt}>
                                  ({stats.minElev ? `${stats.minElev}m` : 'Baja'})
                                </Text>
                              </View>
                              <Text style={[styles.forecastDayColCotaVal, { color: colors.textPrimary }]}>
                                {hasSnow ? `${snowBase} cm` : '-'}
                              </Text>
                            </View>
                          </View>

                          {/* Visual Progress Bar & Precip Summary */}
                          <View style={styles.forecastDayColFooter}>
                            <Text style={styles.forecastDayColPrecip}>
                              {precipMm > 0 ? `${precipMm} mm precip.` : 'Sin precip.'}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : (
                <View style={styles.emptyStateBox}>
                  <Sun size={24} color="#f59e0b" />
                  <Text style={styles.emptyStateText}>
                    {t('no_snow_forecast_7d', 'No se esperan precipitaciones en los próximos días.')}
                  </Text>
                </View>
              )}
            </View>

            {/* Avalanche Danger Bulletin (BPA) Section */}
            {snowReport?.avalanche_report && (
              <View style={styles.avalancheCard}>
                <View style={styles.avalancheHeader}>
                  <View style={styles.avalancheHeaderLeft}>
                    <View
                      style={[
                        styles.avalancheBadgeIcon,
                        { backgroundColor: snowReport.avalanche_report.danger_color || '#ea580c' },
                      ]}>
                      <ShieldAlert size={16} color="#ffffff" />
                    </View>
                    <View>
                      <Text style={styles.sectionTitle}>
                        {t('avalanche_bulletin', 'Peligro de Aludes (BPA)')}
                      </Text>
                      <Text style={styles.avalancheSub}>
                        {t('european_scale', 'Escala Europea de Peligro (1 a 5)')}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.dangerLevelTag,
                      { backgroundColor: snowReport.avalanche_report.danger_color || '#ea580c' },
                    ]}>
                    <Text style={styles.dangerLevelTagText}>
                      Nivel {snowReport.avalanche_report.danger_level} ·{' '}
                      {snowReport.avalanche_report.danger_level_title}
                    </Text>
                  </View>
                </View>

                {/* 5-step scale indicator */}
                <View style={styles.scaleBarRow}>
                  {SCALE_LEVELS.map((lvl) => {
                    const isActive = lvl.level === snowReport.avalanche_report?.danger_level;
                    return (
                      <View key={lvl.level} style={styles.scaleSegment}>
                        <View
                          style={[
                            styles.scaleFill,
                            {
                              backgroundColor: lvl.color,
                              opacity: isActive ? 1.0 : 0.25,
                              height: isActive ? 8 : 4,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.scaleNum,
                            isActive ? { color: lvl.color, fontWeight: '800' } : { color: colors.textSecondary },
                          ]}>
                          {lvl.level}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Risk Factors */}
                <View style={styles.avalancheFactorsRow}>
                  <View style={styles.avalancheFactorBox}>
                    <Text style={styles.factorLabel}>Cota crítica</Text>
                    <Text style={styles.factorVal}>
                      &gt; {Math.round(snowReport.avalanche_report.critical_elevation_m || 2000)} m
                    </Text>
                  </View>

                  <View style={styles.avalancheFactorBox}>
                    <Text style={styles.factorLabel}>Laderas críticas</Text>
                    <View style={styles.aspectsPillsWrap}>
                      {snowReport.avalanche_report.dangerous_aspects?.map((asp) => (
                        <View key={asp} style={styles.aspectPill}>
                          <Text style={styles.aspectPillText}>{asp}</Text>
                        </View>
                      )) || <Text style={styles.factorVal}>Todas</Text>}
                    </View>
                  </View>

                  <View style={styles.avalancheFactorBox}>
                    <Text style={styles.factorLabel}>Riesgo Viento</Text>
                    <Text style={styles.factorVal}>{snowReport.avalanche_report.wind_risk || 'Bajo'}</Text>
                  </View>
                </View>

                {snowReport.avalanche_report.summary && (
                  <View style={styles.avalancheSummaryBox}>
                    <AlertTriangle size={13} color="#ea580c" />
                    <Text style={styles.avalancheSummaryText}>{snowReport.avalanche_report.summary}</Text>
                  </View>
                )}
              </View>
            )}

            {resort.Website && (
              <View style={styles.officialWebsiteCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Globe size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.officialWebsiteTitle}>{t('official_website', 'Sitio Web Oficial')}</Text>
                    <Text style={styles.officialWebsiteUrl} numberOfLines={1}>
                      {resort.Website.replace(/^https?:\/\//, '')}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.officialWebsiteBtn}
                  onPress={() => Linking.openURL(resort.Website!)}>
                  <Text style={styles.officialWebsiteBtnText}>Visitar</Text>
                  <ExternalLink size={13} color="#ffffff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PISTAS Y REMONTES (SLOPES & LIFTS - SKIINFO EXPERIENCE) */}
        {/* ========================================================================= */}
        {activeTab === 'pistes' && (
          <View style={styles.tabSection}>
            {/* Domain Overview Cards */}
            <View style={styles.domainSummaryCard}>
              <View style={styles.domainSummaryCol}>
                <Text style={styles.domainSummaryNumber}>{stats.totalKm}</Text>
                <Text style={styles.domainSummaryLabel}>Km Esquiables</Text>
              </View>

              <View style={styles.domainSummaryDivider} />

              <View style={styles.domainSummaryCol}>
                <Text style={styles.domainSummaryNumber}>{stats.totalPistes}</Text>
                <Text style={styles.domainSummaryLabel}>Pistas Totales</Text>
              </View>

              <View style={styles.domainSummaryDivider} />

              <View style={styles.domainSummaryCol}>
                <Text style={styles.domainSummaryNumber}>{stats.totalLifts}</Text>
                <Text style={styles.domainSummaryLabel}>Remontes</Text>
              </View>
            </View>

            {/* Pistes Breakdown by Difficulty (Colored Cards) */}
            <View style={styles.pistesBreakdownCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.sectionTitle}>{t('pistes_breakdown', 'Desglose de Pistas por Dificultad')}</Text>
                {selectedDifficultyFilter !== 'all' && (
                  <TouchableOpacity onPress={() => setSelectedDifficultyFilter('all')}>
                    <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>Ver todas</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.diffGrid}>
                {/* Novice / Green */}
                <TouchableOpacity
                  style={[
                    styles.diffCard,
                    selectedDifficultyFilter === 'novice' && styles.diffCardActive,
                  ]}
                  onPress={() =>
                    setSelectedDifficultyFilter(
                      selectedDifficultyFilter === 'novice' ? 'all' : 'novice'
                    )
                  }
                  activeOpacity={0.7}>
                  <View style={[styles.diffColorDot, { backgroundColor: '#00a859' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.diffCount}>
                      {displayBasePistes.length > 0
                        ? displayBasePistes.filter((p) => getPisteDifficultyMeta(p.Difficulty).key === 'novice').length
                        : stats.difficultyCounts.novice}
                    </Text>
                    <Text style={styles.diffName}>{t('novice', 'Verdes (Muy fácil)')}</Text>
                  </View>
                </TouchableOpacity>

                {/* Easy / Blue */}
                <TouchableOpacity
                  style={[
                    styles.diffCard,
                    selectedDifficultyFilter === 'easy' && styles.diffCardActive,
                  ]}
                  onPress={() =>
                    setSelectedDifficultyFilter(
                      selectedDifficultyFilter === 'easy' ? 'all' : 'easy'
                    )
                  }
                  activeOpacity={0.7}>
                  <View style={[styles.diffColorDot, { backgroundColor: '#0072bc' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.diffCount}>
                      {displayBasePistes.length > 0
                        ? displayBasePistes.filter((p) => getPisteDifficultyMeta(p.Difficulty).key === 'easy').length
                        : stats.difficultyCounts.easy}
                    </Text>
                    <Text style={styles.diffName}>{t('easy', 'Azules (Fácil)')}</Text>
                  </View>
                </TouchableOpacity>

                {/* Intermediate / Red */}
                <TouchableOpacity
                  style={[
                    styles.diffCard,
                    selectedDifficultyFilter === 'intermediate' && styles.diffCardActive,
                  ]}
                  onPress={() =>
                    setSelectedDifficultyFilter(
                      selectedDifficultyFilter === 'intermediate' ? 'all' : 'intermediate'
                    )
                  }
                  activeOpacity={0.7}>
                  <View style={[styles.diffColorDot, { backgroundColor: '#f0141e' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.diffCount}>
                      {displayBasePistes.length > 0
                        ? displayBasePistes.filter((p) => getPisteDifficultyMeta(p.Difficulty).key === 'intermediate').length
                        : stats.difficultyCounts.intermediate}
                    </Text>
                    <Text style={styles.diffName}>{t('intermediate', 'Rojas (Intermedia)')}</Text>
                  </View>
                </TouchableOpacity>

                {/* Advanced / Black */}
                <TouchableOpacity
                  style={[
                    styles.diffCard,
                    selectedDifficultyFilter === 'advanced' && styles.diffCardActive,
                  ]}
                  onPress={() =>
                    setSelectedDifficultyFilter(
                      selectedDifficultyFilter === 'advanced' ? 'all' : 'advanced'
                    )
                  }
                  activeOpacity={0.7}>
                  <View style={[styles.diffColorDot, { backgroundColor: '#000000' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.diffCount}>
                      {displayBasePistes.length > 0
                        ? displayBasePistes.filter((p) => getPisteDifficultyMeta(p.Difficulty).key === 'advanced').length
                        : stats.difficultyCounts.advanced}
                    </Text>
                    <Text style={styles.diffName}>{t('expert', 'Negras (Difícil)')}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Lifts by Type */}
            <View style={styles.liftsBreakdownCard}>
              <Text style={styles.sectionTitle}>{t('lifts_breakdown', 'Tipos de Remontes')}</Text>

              {Object.keys(stats.liftTypeCounts).length > 0 ? (
                <View style={styles.liftsGrid}>
                  {Object.entries(stats.liftTypeCounts).map(([type, count]) => (
                    <View key={type} style={styles.liftTypeCard}>
                      <Text style={{ fontSize: 16 }}>🚡</Text>
                      <View>
                        <Text style={styles.liftTypeName}>{parseLiftType(type)}</Text>
                        <Text style={styles.liftTypeCount}>{count} instalaciones</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.liftsGrid}>
                  <View style={styles.liftTypeCard}>
                    <Text style={{ fontSize: 16 }}>🚡</Text>
                    <View>
                      <Text style={styles.liftTypeName}>Remontes mecánicos</Text>
                      <Text style={styles.liftTypeCount}>{stats.totalLifts} en servicio</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Mountain Profile Altitude Card */}
            <View style={styles.altitudeCard}>
              <Text style={styles.sectionTitle}>{t('mountain_elevations', 'Perfil Altimétrico')}</Text>
              <View style={styles.altitudesRow}>
                <View style={styles.altitudeItem}>
                  <ArrowUp size={16} color="#0284c7" />
                  <View>
                    <Text style={styles.altitudeLabel}>Cota Máxima (Cumbre)</Text>
                    <Text style={styles.altitudeValue}>{stats.maxElev ? `${stats.maxElev} m` : '--'}</Text>
                  </View>
                </View>
                <View style={styles.altitudeItem}>
                  <ArrowDown size={16} color={colors.textSecondary} />
                  <View>
                    <Text style={styles.altitudeLabel}>Cota Mínima (Base)</Text>
                    <Text style={styles.altitudeValue}>{stats.minElev ? `${stats.minElev} m` : '--'}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Piste Directory / Listado de Pistas (Skiinfo Experience) */}
            <View style={styles.pisteDirectoryContainer}>
              {/* Header */}
              <View style={styles.pisteDirectoryHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Layers size={18} color={colors.primary} />
                    <Text style={styles.sectionTitle}>{t('pistes_directory_title', 'Listado de Pistas')}</Text>
                  </View>
                  <Text style={styles.pisteDirectorySubtitle}>
                    {t('pistes_directory_subtitle', 'Información detallada, longitud y cotas de cada trazado')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <View style={styles.pisteCountBadge}>
                    <Text style={styles.pisteCountBadgeText}>
                      {filteredPistes.length} / {displayBasePistes.length}
                    </Text>
                  </View>
                  {unnamedPistes.length > 0 && namedPistes.length > 0 && !pisteSearchQuery.trim() && (
                    <TouchableOpacity
                      style={[
                        styles.unnamedToggleBtn,
                        showUnnamedLinks && styles.unnamedToggleBtnActive,
                      ]}
                      onPress={() => setShowUnnamedLinks(!showUnnamedLinks)}>
                      <Text
                        style={[
                          styles.unnamedToggleBtnText,
                          showUnnamedLinks && styles.unnamedToggleBtnTextActive,
                        ]}>
                        {showUnnamedLinks ? 'Ocultar enlaces' : `+${unnamedPistes.length} enlaces`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Search Bar */}
              <View style={styles.pisteSearchBar}>
                <Search size={16} color={colors.textLight} />
                <TextInput
                  style={styles.pisteSearchInput}
                  placeholder={t('search_piste_placeholder', 'Buscar pista por nombre o referencia...')}
                  placeholderTextColor={colors.textLight}
                  value={pisteSearchQuery}
                  onChangeText={setPisteSearchQuery}
                  clearButtonMode="while-editing"
                />
                {pisteSearchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setPisteSearchQuery('')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <X size={16} color={colors.textLight} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Difficulty Filter Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipsRow}>
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    selectedDifficultyFilter === 'all' && styles.filterChipActiveAll,
                  ]}
                  onPress={() => setSelectedDifficultyFilter('all')}>
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedDifficultyFilter === 'all' && styles.filterChipTextActiveAll,
                    ]}>
                    Todas ({displayBasePistes.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    selectedDifficultyFilter === 'novice' && styles.filterChipActiveGreen,
                  ]}
                  onPress={() =>
                    setSelectedDifficultyFilter(
                      selectedDifficultyFilter === 'novice' ? 'all' : 'novice'
                    )
                  }>
                  <View style={[styles.filterChipDot, { backgroundColor: '#00a859' }]} />
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedDifficultyFilter === 'novice' && styles.filterChipTextActiveColor,
                    ]}>
                    Verdes ({displayBasePistes.length > 0
                      ? displayBasePistes.filter((p) => getPisteDifficultyMeta(p.Difficulty).key === 'novice').length
                      : stats.difficultyCounts.novice})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    selectedDifficultyFilter === 'easy' && styles.filterChipActiveBlue,
                  ]}
                  onPress={() =>
                    setSelectedDifficultyFilter(
                      selectedDifficultyFilter === 'easy' ? 'all' : 'easy'
                    )
                  }>
                  <View style={[styles.filterChipDot, { backgroundColor: '#0072bc' }]} />
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedDifficultyFilter === 'easy' && styles.filterChipTextActiveColor,
                    ]}>
                    Azules ({displayBasePistes.length > 0
                      ? displayBasePistes.filter((p) => getPisteDifficultyMeta(p.Difficulty).key === 'easy').length
                      : stats.difficultyCounts.easy})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    selectedDifficultyFilter === 'intermediate' && styles.filterChipActiveRed,
                  ]}
                  onPress={() =>
                    setSelectedDifficultyFilter(
                      selectedDifficultyFilter === 'intermediate' ? 'all' : 'intermediate'
                    )
                  }>
                  <View style={[styles.filterChipDot, { backgroundColor: '#ef4444' }]} />
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedDifficultyFilter === 'intermediate' && styles.filterChipTextActiveColor,
                    ]}>
                    Rojas ({displayBasePistes.length > 0
                      ? displayBasePistes.filter((p) => getPisteDifficultyMeta(p.Difficulty).key === 'intermediate').length
                      : stats.difficultyCounts.intermediate})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    selectedDifficultyFilter === 'advanced' && styles.filterChipActiveBlack,
                  ]}
                  onPress={() =>
                    setSelectedDifficultyFilter(
                      selectedDifficultyFilter === 'advanced' ? 'all' : 'advanced'
                    )
                  }>
                  <View style={[styles.filterChipDot, { backgroundColor: '#0f172a' }]} />
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedDifficultyFilter === 'advanced' && styles.filterChipTextActiveColor,
                    ]}>
                    Negras ({displayBasePistes.length > 0
                      ? displayBasePistes.filter((p) => getPisteDifficultyMeta(p.Difficulty).key === 'advanced').length
                      : stats.difficultyCounts.advanced})
                  </Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Piste List Items */}
              {filteredPistes.length > 0 ? (
                <View style={styles.pisteListContainer}>
                  {filteredPistes.map((piste, index) => {
                    const meta = getPisteDifficultyMeta(piste.Difficulty);
                    const name = getPisteName(piste);
                    const distanceM = getPisteDistanceMeters(piste);
                    const elevStats = getPisteElevationStats(piste);
                    const typeLabel = getPisteTypeLabel(piste.PisteType);
                    const ref = piste.Tags?.ref || piste.Tags?.['piste:ref'];
                    const isLit = piste.Tags?.lit === 'yes' || piste.Tags?.['piste:lit'] === 'yes';
                    const hasSnowmaking =
                      piste.Tags?.['piste:snowmaking'] === 'yes' || piste.Tags?.snowmaking === 'yes';
                    const isGroomed =
                      piste.Grooming === 'classic' ||
                      piste.Tags?.['piste:grooming'] === 'classic' ||
                      piste.Tags?.['piste:grooming'] === 'scooter';

                    return (
                      <View key={piste.ID || `piste-${index}`} style={styles.pisteCard}>
                        <View style={styles.pisteCardMain}>
                          {/* Difficulty Stripe */}
                          <View style={[styles.pisteDiffIndicator, { backgroundColor: meta.color }]} />

                          <View style={styles.pisteCardBody}>
                            {/* Top Row: Name, Ref Badge, Difficulty Badge */}
                            <View style={styles.pisteCardTopRow}>
                              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                {ref && (
                                  <View style={styles.pisteRefBadge}>
                                    <Text style={styles.pisteRefBadgeText}>{ref}</Text>
                                  </View>
                                )}
                                {!hasNamedPiste(piste) && (
                                  <View style={styles.pisteUnnamedBadge}>
                                    <Text style={styles.pisteUnnamedBadgeText}>Enlace</Text>
                                  </View>
                                )}
                                <Text style={styles.pisteNameText} numberOfLines={1}>
                                  {name}
                                </Text>
                              </View>

                              <View style={[styles.pisteDifficultyBadge, { backgroundColor: meta.badgeBg }]}>
                                <View style={[styles.pisteDiffDotSmall, { backgroundColor: meta.color }]} />
                                <Text style={[styles.pisteDifficultyBadgeText, { color: meta.badgeText }]}>
                                  {meta.label}
                                </Text>
                              </View>
                            </View>

                            {/* Metrics Row: Distance, Drop, Elevation interval */}
                            <View style={styles.pisteMetricsRow}>
                              {distanceM > 0 && (
                                <View style={styles.pisteMetricChip}>
                                  <Compass size={12} color={colors.textSecondary} />
                                  <Text style={styles.pisteMetricText}>
                                    {distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${distanceM} m`}
                                  </Text>
                                </View>
                              )}

                              {elevStats && elevStats.drop > 0 && (
                                <View style={styles.pisteMetricChip}>
                                  <ArrowDown size={12} color="#0284c7" />
                                  <Text style={styles.pisteMetricText}>
                                    Desnivel: {elevStats.drop} m
                                  </Text>
                                </View>
                              )}

                              {elevStats && (
                                <View style={styles.pisteMetricChip}>
                                  <Mountain size={12} color={colors.textSecondary} />
                                  <Text style={styles.pisteMetricText}>
                                    {elevStats.minElev} - {elevStats.maxElev} m
                                  </Text>
                                </View>
                              )}

                              <View style={styles.pisteMetricChip}>
                                <Text style={styles.pisteMetricText}>{typeLabel}</Text>
                              </View>
                            </View>

                            {/* Features & Action Footer */}
                            <View style={styles.pisteCardFooter}>
                              <View style={styles.pisteFeaturesRow}>
                                {hasSnowmaking && (
                                  <View style={styles.pisteFeatureTag}>
                                    <Snowflake size={11} color="#0284c7" />
                                    <Text style={styles.pisteFeatureTagText}>Nieve art.</Text>
                                  </View>
                                )}
                                {isLit && (
                                  <View style={styles.pisteFeatureTag}>
                                    <Text style={styles.pisteFeatureTagText}>💡 Nocturna</Text>
                                  </View>
                                )}
                                {isGroomed && (
                                  <View style={styles.pisteFeatureTag}>
                                    <Text style={styles.pisteFeatureTagText}>🚜 Pisada</Text>
                                  </View>
                                )}
                              </View>

                              {(onOpenPiste || onOpenMap) && (
                                <TouchableOpacity
                                  style={styles.pisteMapButton}
                                  onPress={() => {
                                    if (onOpenPiste) {
                                      onOpenPiste(piste);
                                    } else if (onOpenMap) {
                                      onOpenMap();
                                    }
                                  }}>
                                  <MapIcon size={12} color={colors.primary} />
                                  <Text style={styles.pisteMapButtonText}>Ver en mapa</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                /* Empty State */
                <View style={styles.pisteEmptyContainer}>
                  <View style={styles.pisteEmptyIconCircle}>
                    <Search size={24} color={colors.textLight} />
                  </View>
                  <Text style={styles.pisteEmptyTitle}>
                    {allPistes.length === 0
                      ? 'No hay pistas registradas'
                      : 'No se encontraron pistas'}
                  </Text>
                  <Text style={styles.pisteEmptySubtitle}>
                    {allPistes.length === 0
                      ? 'La estación no tiene detalles individuales de pistas disponibles en este momento.'
                      : pisteSearchQuery
                      ? `Ninguna pista coincide con "${pisteSearchQuery}"`
                      : 'No hay pistas para el filtro de dificultad seleccionado.'}
                  </Text>
                  {(selectedDifficultyFilter !== 'all' || pisteSearchQuery.length > 0) && (
                    <TouchableOpacity
                      style={styles.pisteResetFiltersBtn}
                      onPress={() => {
                        setSelectedDifficultyFilter('all');
                        setPisteSearchQuery('');
                      }}>
                      <Text style={styles.pisteResetFiltersText}>Mostrar todas las pistas</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* ========================================================================= */}
        {/* TAB 3: METEOROLOGÍA (WEATHER & FORECAST - SKIINFO EXPERIENCE) */}
        {/* ========================================================================= */}
        {activeTab === 'weather' && current && (
          <View style={styles.tabSection}>
            {/* Current Conditions Main Box */}
            <View style={styles.weatherCurrentCard}>
              <View style={styles.weatherCurrentTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.weatherTempText}>
                    {Math.round(current.temperature_2m)}°C
                  </Text>
                  <Text style={styles.weatherConditionDesc}>
                    {getWeatherCodeLabel(current.weather_code)}
                  </Text>
                  <Text style={styles.weatherFeelsLike}>
                    Sensación térmica: {Math.round(current.apparent_temperature)}°C
                  </Text>
                </View>
                <View style={styles.weatherIconCircle}>
                  {renderWeatherIcon(current.weather_code, 34)}
                </View>
              </View>

              {/* Freezing Level Info Bar */}
              {freezingLevelInfo && (
                <View style={styles.weatherFreezingRow}>
                  <Thermometer size={14} color={freezingLevelInfo.color} />
                  <Text style={styles.weatherFreezingText}>
                    Cota de nieve / Isocero:{' '}
                    <Text style={{ fontWeight: '800', color: colors.textPrimary }}>
                      {freezingLevelInfo.altitude} m
                    </Text>{' '}
                    <Text style={{ color: freezingLevelInfo.color, fontWeight: '700' }}>
                      ({freezingLevelInfo.label})
                    </Text>
                  </Text>
                </View>
              )}

              {/* Quick Snow Summary Ribbon */}
              {snowReport && (
                <View style={styles.weatherSnowSummaryRibbon}>
                  <View style={styles.weatherSnowRibbonItem}>
                    <Text style={styles.weatherSnowRibbonVal}>{snowReport.fresh_snow_24h_cm ?? 0} cm</Text>
                    <Text style={styles.weatherSnowRibbonLbl}>Nieve 24h</Text>
                  </View>
                  <View style={styles.weatherSnowRibbonDivider} />
                  <View style={styles.weatherSnowRibbonItem}>
                    <Text style={[styles.weatherSnowRibbonVal, { color: '#0284c7' }]}>
                      {snowReport.forecast_snow_7d_cm ?? 0} cm
                    </Text>
                    <Text style={styles.weatherSnowRibbonLbl}>Próx. 7 días</Text>
                  </View>
                  <View style={styles.weatherSnowRibbonDivider} />
                  <View style={styles.weatherSnowRibbonItem}>
                    <Text style={styles.weatherSnowRibbonVal}>
                      {baseDepth !== undefined ? baseDepth : '--'} / {midDepth !== undefined ? midDepth : '--'} /{' '}
                      {summitDepth !== undefined ? summitDepth : '--'} cm
                    </Text>
                    <Text style={styles.weatherSnowRibbonLbl}>Espesor (Baja/Med/Alta)</Text>
                  </View>
                </View>
              )}

              {/* Weather Metrics 6-pack Grid */}
              <View style={styles.weatherMetricsGrid}>
                <View style={styles.weatherMetricItem}>
                  <Wind size={15} color="#0284c7" />
                  <View>
                    <Text style={styles.weatherMetricLabel}>Viento medio</Text>
                    <Text style={styles.weatherMetricValue}>
                      {Math.round(current.wind_speed_10m)} km/h
                    </Text>
                  </View>
                </View>

                <View style={styles.weatherMetricItem}>
                  <Flame size={15} color="#ea580c" />
                  <View>
                    <Text style={styles.weatherMetricLabel}>Rachas máx.</Text>
                    <Text style={styles.weatherMetricValue}>
                      {Math.round(current.wind_gusts_10m)} km/h
                    </Text>
                  </View>
                </View>

                <View style={styles.weatherMetricItem}>
                  <Compass size={15} color="#8b5cf6" />
                  <View>
                    <Text style={styles.weatherMetricLabel}>Dirección</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <WindDirectionArrow degrees={current.wind_direction_10m} size={11} />
                      <Text style={styles.weatherMetricValue}>{windDirInfo.cardinal} ({windDirInfo.name})</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.weatherMetricItem}>
                  <Droplets size={15} color={colors.primary} />
                  <View>
                    <Text style={styles.weatherMetricLabel}>Humedad</Text>
                    <Text style={styles.weatherMetricValue}>{current.relative_humidity_2m}%</Text>
                  </View>
                </View>

                <View style={styles.weatherMetricItem}>
                  <Eye size={15} color="#10b981" />
                  <View>
                    <Text style={styles.weatherMetricLabel}>Visibilidad</Text>
                    <Text style={styles.weatherMetricValue}>
                      {current.visibility ? `${(current.visibility / 1000).toFixed(1)} km` : 'Buena'}
                    </Text>
                  </View>
                </View>

                <View style={styles.weatherMetricItem}>
                  <Gauge size={15} color="#6366f1" />
                  <View>
                    <Text style={styles.weatherMetricLabel}>Presión</Text>
                    <Text style={styles.weatherMetricValue}>{Math.round(current.surface_pressure)} hPa</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Upcoming Hours Scroll */}
            {weatherData?.hourly && weatherData.hourly.time?.length > 0 && (
              <View style={styles.hourlyCard}>
                <View style={styles.hourlyHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Clock size={16} color={colors.primary} />
                    <Text style={styles.sectionTitle}>{t('upcoming_hours', 'Previsión por Horas')}</Text>
                  </View>
                  <View style={styles.hourlyScrollNav}>
                    <TouchableOpacity
                      style={styles.hourlyNavBtn}
                      onPress={() => scrollHorizontal(hourlyScrollRef, -240)}
                      accessibilityLabel="Ver horas anteriores">
                      <ChevronLeft size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.hourlyNavBtn}
                      onPress={() => scrollHorizontal(hourlyScrollRef, 240)}
                      accessibilityLabel="Ver siguientes horas">
                      <ChevronRight size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View
                  style={styles.hourlyScrollWrapper}
                  // @ts-ignore
                  onWheel={(e: any) => handleWheel(hourlyScrollRef, e)}
                  // @ts-ignore
                  onMouseDown={(e: any) => handleMouseDown(hourlyScrollRef, e)}
                  // @ts-ignore
                  onMouseMove={handleMouseMove}
                  // @ts-ignore
                  onMouseUp={handleMouseUpOrLeave}
                  // @ts-ignore
                  onMouseLeave={handleMouseUpOrLeave}>
                  <ScrollView
                    ref={hourlyScrollRef}
                    horizontal
                    nestedScrollEnabled={true}
                    directionalLockEnabled={true}
                    showsHorizontalScrollIndicator={isWeb}
                    style={styles.hourlyScrollView}
                    contentContainerStyle={styles.hourlyScroll}>
                    {weatherData.hourly.time.slice(0, 24).map((tStr, hIdx) => {
                      const hDate = new Date(tStr);
                      const hourStr = `${String(hDate.getHours()).padStart(2, '0')}:00`;
                      const hTemp = Math.round(weatherData.hourly.temperature_2m?.[hIdx] ?? 0);
                      const hSnow = Math.round((weatherData.hourly.snowfall?.[hIdx] ?? 0) * 10) / 10;
                      const hPrecip = Math.round((weatherData.hourly.precipitation?.[hIdx] ?? 0) * 10) / 10;
                      const hProb = weatherData.hourly.precipitation_probability?.[hIdx] ?? 0;
                      const hWind = Math.round(weatherData.hourly.wind_speed_10m?.[hIdx] ?? 0);
                      const hWindDir = weatherData.hourly.wind_direction_10m?.[hIdx] ?? current.wind_direction_10m ?? 0;
                      const hWindInfo = getWindDirectionInfo(hWindDir);
                      const hVis = weatherData.hourly.visibility?.[hIdx];
                      const visInfo = getVisibilityInfo(hVis);
                      const hCode = weatherData.hourly.weather_code?.[hIdx] ?? (hSnow > 0 ? 71 : hProb > 40 ? 61 : 0);

                      return (
                        <View key={tStr || hIdx} style={styles.hourlyItem}>
                          <Text style={styles.hourlyTimeText}>{hourStr}</Text>

                          <View style={styles.hourlyIconBox}>
                            {renderWeatherIcon(hCode, 22)}
                          </View>

                          <Text style={styles.hourlyTemp}>{hTemp}°C</Text>

                          {/* Nevada / Precipitación */}
                          <View style={styles.hourlyPrecipContainer}>
                            {hSnow > 0 ? (
                              <View style={styles.hourlySnowPill}>
                                <Snowflake size={10} color="#0284c7" />
                                <Text style={styles.hourlySnowPillText}>+{hSnow} cm</Text>
                              </View>
                            ) : hPrecip > 0 || hProb > 20 ? (
                              <View style={styles.hourlyRainPill}>
                                <Umbrella size={10} color="#0284c7" />
                                <Text style={styles.hourlyRainPillText}>{hProb}%</Text>
                              </View>
                            ) : (
                              <Text style={styles.hourlyNoSnowText}>-</Text>
                            )}
                          </View>

                          {/* Viento y Dirección */}
                          <View style={styles.hourlyWindBox}>
                            <View style={styles.hourlyWindRow}>
                              <WindDirectionArrow degrees={hWindDir} size={11} color={colors.primary} />
                              <Text style={styles.hourlyWindText}>{hWind} km/h</Text>
                            </View>
                            <Text style={styles.hourlyWindDirText}>{hWindInfo.cardinal}</Text>
                          </View>

                          {/* Visibilidad combinada */}
                          <View style={[styles.hourlyVisBadge, { backgroundColor: visInfo.bgColor }]}>
                            <Text style={[styles.hourlyVisText, { color: visInfo.color }]}>
                              Vis. {visInfo.label}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* 7-Day Weather & Forecast (Skiinfo Experience) */}
            {weatherData?.daily && weatherData.daily.time?.length > 0 && (
              <View
                style={styles.sevenDayForecastCard}
                onLayout={(e) => {
                  const w = Math.round(e.nativeEvent.layout.width - 24);
                  if (w > 100 && w !== sevenDayCardWidth) {
                    setSevenDayCardWidth(w);
                  }
                }}>
                {/* Header: Title and Day Navigation Buttons */}
                <View style={styles.sevenDayHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Calendar size={16} color={colors.primary} />
                    <Text style={styles.sectionTitle}>
                      {t('seven_day_weather_forecast', 'Previsión del Tiempo a 7 Días')}
                    </Text>
                  </View>
                  <View style={styles.hourlyScrollNav}>
                    <TouchableOpacity
                      style={styles.hourlyNavBtn}
                      onPress={() => {
                        const nextIdx = Math.max(0, selectedSevenDayIdx - 1);
                        scrollToSevenDay(nextIdx);
                      }}
                      accessibilityLabel="Ver día anterior">
                      <ChevronLeft size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.hourlyNavBtn}
                      onPress={() => {
                        const maxIdx = Math.min(6, (weatherData?.daily?.time?.length ?? 1) - 1);
                        const nextIdx = Math.min(maxIdx, selectedSevenDayIdx + 1);
                        scrollToSevenDay(nextIdx);
                      }}
                      accessibilityLabel="Ver día siguiente">
                      <ChevronRight size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Day Selector Pills Bar */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.sevenDayTabsScroll}>
                  {weatherData.daily.time.slice(0, 7).map((timeStr, idx) => {
                    const dObj = new Date(timeStr);
                    const isToday = idx === 0;
                    const dName = isToday
                      ? 'Hoy'
                      : dObj.toLocaleDateString(i18n.language, { weekday: 'short' });
                    const isSelected = selectedSevenDayIdx === idx;
                    const dSnow = weatherData.daily?.snowfall_sum?.[idx] ?? 0;
                    const dMax = Math.round(weatherData.daily?.temperature_2m_max?.[idx] ?? 0);
                    const dMin = Math.round(weatherData.daily?.temperature_2m_min?.[idx] ?? 0);
                    return (
                      <TouchableOpacity
                        key={`tab-${timeStr || idx}`}
                        style={[styles.sevenDayTabChip, isSelected && styles.sevenDayTabChipActive]}
                        onPress={() => scrollToSevenDay(idx)}
                        activeOpacity={0.75}>
                        <Text style={[styles.sevenDayTabDay, isSelected && styles.sevenDayTabDayActive]}>
                          {dName.charAt(0).toUpperCase() + dName.slice(1)}
                        </Text>
                        <Text style={[styles.sevenDayTabDate, isSelected && styles.sevenDayTabDateActive]}>
                          {dObj.getDate()}/{dObj.getMonth() + 1}
                        </Text>
                        <View style={styles.sevenDayTabBadgeRow}>
                          {dSnow > 0 ? (
                            <View style={styles.sevenDayTabSnowBadge}>
                              <Snowflake size={9} color="#0284c7" />
                              <Text style={styles.sevenDayTabSnowText}>{Math.round(dSnow)}c</Text>
                            </View>
                          ) : (
                            <Text style={[styles.sevenDayTabTemp, isSelected && styles.sevenDayTabTempActive]}>
                              {dMax}°/{dMin}°
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Active Day Detail Card (Full Width, Swipeable left/right) */}
                {(() => {
                  const safeIdx = Math.max(0, Math.min(selectedSevenDayIdx, (weatherData.daily?.time?.length ?? 1) - 1));
                  const timeStr = weatherData.daily.time[safeIdx];
                  const dateObj = new Date(timeStr);
                  const isToday = safeIdx === 0;
                  const dayName = isToday
                    ? 'Hoy'
                    : dateObj.toLocaleDateString(i18n.language, { weekday: 'long' });
                  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
                  const dateFormatted = dateObj.toLocaleDateString(i18n.language, {
                    day: 'numeric',
                    month: 'long',
                  });

                  const snowCm = weatherData.daily?.snowfall_sum?.[safeIdx] ?? 0;
                  const hasSnow = snowCm > 0;
                  const roundedSnow = snowCm >= 1 ? Math.round(snowCm) : Math.round(snowCm * 10) / 10;
                  const precipMm = weatherData.daily?.precipitation_sum?.[safeIdx] ?? 0;
                  const maxT = Math.round(weatherData.daily?.temperature_2m_max?.[safeIdx] ?? 0);
                  const minT = Math.round(weatherData.daily?.temperature_2m_min?.[safeIdx] ?? 0);
                  const wCode = weatherData.daily?.weather_code?.[safeIdx] ?? (hasSnow ? 71 : 0);
                  const precipProb = weatherData.daily?.precipitation_probability_max?.[safeIdx] ?? 0;

                  const sunriseIso = weatherData.daily?.sunrise?.[safeIdx];
                  const sunsetIso = weatherData.daily?.sunset?.[safeIdx];
                  const sunriseStr = sunriseIso && typeof sunriseIso === 'string' && sunriseIso.length >= 16 ? sunriseIso.substring(11, 16) : null;
                  const sunsetStr = sunsetIso && typeof sunsetIso === 'string' && sunsetIso.length >= 16 ? sunsetIso.substring(11, 16) : null;

                  const snowSummit = hasSnow ? (snowCm >= 1 ? Math.round(snowCm) : Math.round(snowCm * 10) / 10) : 0;
                  const snowMid = hasSnow ? (snowCm >= 1 ? Math.round(snowCm * 0.90) : Math.round(snowCm * 0.85 * 10) / 10) : 0;
                  const snowBase = hasSnow ? (snowCm >= 1 ? Math.round(snowCm * 0.80) : Math.round(snowCm * 0.70 * 10) / 10) : 0;

                  return (
                    <View
                      style={[styles.sevenDayFullCard, isToday && styles.sevenDayFullCardToday]}
                      onTouchStart={handleDayTouchStart}
                      onTouchEnd={handleDayTouchEnd}>
                      {/* Day Header Row */}
                      <View style={styles.sevenDayFullCardHeader}>
                        <View style={styles.sevenDayFullCardTitleGroup}>
                          <Text
                            style={[
                              styles.sevenDayFullCardTitle,
                              isToday && { color: colors.primary },
                            ]}>
                            {capitalizedDay}
                          </Text>
                          <Text style={styles.sevenDayFullCardDate}>{dateFormatted}</Text>
                          {isToday && (
                            <View style={styles.forecastTodayBadge}>
                              <Text style={styles.forecastTodayBadgeText}>Hoy</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.sevenDayFullCardStep}>
                          Día {safeIdx + 1} de 7
                        </Text>
                      </View>

                      {/* Central Main Weather & Big Temp Box */}
                      <View style={styles.sevenDayMainRow}>
                        <View style={styles.sevenDayMainConditionGroup}>
                          {renderWeatherIcon(wCode, 36)}
                          <View style={{ flex: 1 }}>
                            <Text style={styles.sevenDayConditionText}>
                              {getWeatherCodeLabel(wCode)}
                            </Text>
                            <Text style={styles.sevenDayGridSub}>
                              {hasSnow
                                ? `Nevada prevista · ${roundedSnow} cm en cumbre`
                                : precipProb > 40
                                ? `Precipitaciones probables (${precipProb}%)`
                                : 'Sin precipitaciones significativas'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.sevenDayTempGroup}>
                          <View style={styles.sevenDayTempRow}>
                            <Text style={styles.sevenDayMaxTempText}>{maxT}°</Text>
                            <Text style={styles.sevenDayMinTempText}>/ {minT}°</Text>
                          </View>
                          <Text style={styles.sevenDayTempSub}>Máx / Mín</Text>
                        </View>
                      </View>

                      {/* 4-Stat Metrics Grid */}
                      <View style={styles.sevenDayGrid}>
                        {/* Snow or Rain box */}
                        <View style={styles.sevenDayGridBox}>
                          <View style={styles.sevenDayGridHeader}>
                            <Snowflake size={14} color="#0284c7" />
                            <Text style={styles.sevenDayGridLabel}>Nieve en cumbre</Text>
                          </View>
                          <Text style={[styles.sevenDayGridValue, hasSnow && { color: '#0284c7' }]}>
                            {hasSnow ? `${roundedSnow} cm` : '0 cm'}
                          </Text>
                          <Text style={styles.sevenDayGridSub}>
                            {precipMm > 0 ? `${precipMm} mm total` : 'Sin acumulación'}
                          </Text>
                        </View>

                        {/* Precip Probability box */}
                        <View style={styles.sevenDayGridBox}>
                          <View style={styles.sevenDayGridHeader}>
                            <Umbrella size={14} color={precipProb > 30 ? '#0284c7' : colors.textSecondary} />
                            <Text style={styles.sevenDayGridLabel}>Prob. precipitación</Text>
                          </View>
                          <Text style={styles.sevenDayGridValue}>
                            {precipProb}%
                          </Text>
                          <Text style={styles.sevenDayGridSub}>
                            {precipProb > 50 ? 'Muy probable' : precipProb > 20 ? 'Moderada' : 'Baja'}
                          </Text>
                        </View>

                        {/* Sunrise & Sunset */}
                        {sunriseStr && sunsetStr ? (
                          <View style={styles.sevenDayGridBox}>
                            <View style={styles.sevenDayGridHeader}>
                              <Sun size={14} color="#f59e0b" />
                              <Text style={styles.sevenDayGridLabel}>Luz solar</Text>
                            </View>
                            <Text style={styles.sevenDayGridValue}>
                              {sunriseStr} - {sunsetStr}
                            </Text>
                            <Text style={styles.sevenDayGridSub}>Salida / Puesta</Text>
                          </View>
                        ) : (
                          <View style={styles.sevenDayGridBox}>
                            <View style={styles.sevenDayGridHeader}>
                              <Thermometer size={14} color={minT < 0 ? '#0284c7' : '#f59e0b'} />
                              <Text style={styles.sevenDayGridLabel}>Sensación térmica</Text>
                            </View>
                            <Text style={styles.sevenDayGridValue}>
                              {minT < 0 ? 'Helada' : 'Templado'}
                            </Text>
                            <Text style={styles.sevenDayGridSub}>Mínima: {minT}°C</Text>
                          </View>
                        )}
                      </View>

                      {/* Infonieve 3 Cotas breakdown if there is snow expected */}
                      {hasSnow && (
                        <View style={styles.forecastDayColCotas}>
                          <View style={styles.forecastDayColCotaRow}>
                            <View style={styles.forecastDayColCotaLeft}>
                              <View style={[styles.cotaDot, { backgroundColor: '#0284c7' }]} />
                              <Text style={styles.forecastDayColCotaName}>Cumbre</Text>
                              <Text style={styles.forecastDayColCotaAlt}>({stats.maxElev ? `${stats.maxElev}m` : 'Alta'})</Text>
                            </View>
                            <Text style={[styles.forecastDayColCotaVal, { color: '#0284c7' }]}>
                              {snowSummit} cm
                            </Text>
                          </View>
                          <View style={styles.forecastDayColCotaRow}>
                            <View style={styles.forecastDayColCotaLeft}>
                              <View style={[styles.cotaDot, { backgroundColor: '#0ea5e9' }]} />
                              <Text style={styles.forecastDayColCotaName}>Media</Text>
                              <Text style={styles.forecastDayColCotaAlt}>({stats.midElev ? `${stats.midElev}m` : 'Media'})</Text>
                            </View>
                            <Text style={[styles.forecastDayColCotaVal, { color: '#0ea5e9' }]}>
                              {snowMid} cm
                            </Text>
                          </View>
                          <View style={styles.forecastDayColCotaRow}>
                            <View style={styles.forecastDayColCotaLeft}>
                              <View style={[styles.cotaDot, { backgroundColor: colors.textSecondary }]} />
                              <Text style={styles.forecastDayColCotaName}>Base</Text>
                              <Text style={styles.forecastDayColCotaAlt}>({stats.minElev ? `${stats.minElev}m` : 'Baja'})</Text>
                            </View>
                            <Text style={[styles.forecastDayColCotaVal, { color: colors.textPrimary }]}>
                              {snowBase} cm
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Hourly Evolution for the Selected Day */}
                      {selectedDayHours.length > 0 && (
                        <View style={styles.sevenDayHourlyWrap}>
                          <View style={styles.sevenDayHourlyTitleRow}>
                            <Clock size={13} color={colors.textSecondary} />
                            <Text style={styles.sevenDayHourlyTitle}>
                              Evolución horaria de {capitalizedDay.toLowerCase()}
                            </Text>
                          </View>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.sevenDayHourlyScroll}>
                            {selectedDayHours.map((h, hIdx) => (
                              <View key={h.timeLabel || hIdx} style={styles.sevenDayHourlyItem}>
                                <Text style={styles.sevenDayHourlyTime}>{h.timeLabel}</Text>
                                <View style={styles.sevenDayHourlyIcon}>
                                  {renderWeatherIcon(h.weatherCode, 18)}
                                </View>
                                <Text style={styles.sevenDayHourlyTemp}>{h.temp}°</Text>
                                {h.snow > 0 ? (
                                  <Text style={styles.sevenDayHourlySnow}>❄️{Math.round(h.snow)}</Text>
                                ) : h.precip > 0 ? (
                                  <Text style={styles.sevenDayHourlyRain}>💧{Math.round(h.precip)}</Text>
                                ) : null}
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SESIONES Y COMUNIDAD */}
        {/* ========================================================================= */}
        {activeTab === 'community' && (
          <View style={styles.tabSection}>
            <View style={styles.sessionsHeaderRow}>
              <Text style={styles.sectionTitle}>
                {t('community_sessions', 'Sesiones grabadas')} ({sessions.length})
              </Text>
              {isLoadingSessions && <ActivityIndicator size="small" color={colors.primary} />}
            </View>

            {sessions.length > 0 ? (
              <View style={{ gap: 8 }}>
                {sessions.map((sess) => {
                  const sDate = new Date(sess.start_time);
                  const dateText = sDate.toLocaleDateString(i18n.language, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  });
                  const actConf = ACTIVITY_CONFIGS[sess.activity_type as ActivityType] || ACTIVITY_CONFIGS.ski;

                  return (
                    <View key={sess.id} style={styles.sessionCard}>
                      <View style={styles.sessionCardLeft}>
                        <Text style={styles.sessionDateText}>{dateText}</Text>
                        <Text style={styles.sessionUserName}>
                          {sess.user?.display_name || sess.user?.first_name || 'Esquiador'}
                        </Text>
                        <View style={styles.sessionStatsInline}>
                          <Text style={styles.sessionStat}>{(sess.total_distance / 1000).toFixed(1)} km</Text>
                          <Text style={styles.sessionStat}>{(sess.max_speed * 3.6).toFixed(0)} km/h máx</Text>
                          <Text style={styles.sessionStat}>
                            {actConf.icon} {t(actConf.labelKey, actConf.defaultLabel)}
                          </Text>
                        </View>
                      </View>
                      <ChevronRight size={18} color={colors.textLight} />
                    </View>
                  );
                })}
              </View>
            ) : !isLoadingSessions ? (
              <View style={styles.emptySessionsCard}>
                <Activity size={32} color={colors.textLight} />
                <Text style={styles.emptySessionsTitle}>Aún no hay sesiones grabadas aquí</Text>
                <Text style={styles.emptySessionsSubtitle}>
                  ¡Sé el primero en iniciar un trackeo de esquí en {resort.Name}!
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Footer Bottom Action Buttons */}
      <View style={styles.footerBar}>
        {onOpenMap && (
          <TouchableOpacity style={styles.footerBtn} onPress={onOpenMap}>
            <MapIcon size={16} color={colors.primary} />
            <Text style={styles.footerBtnText}>{t('view_on_map', 'Ver en Mapa')}</Text>
          </TouchableOpacity>
        )}

        {onStartTracking && (
          <TouchableOpacity style={[styles.footerBtn, styles.footerBtnPrimary]} onPress={onStartTracking}>
            <Navigation size={16} color="#ffffff" />
            <Text style={styles.footerBtnPrimaryText}>{t('start_skiing', 'Iniciar Esquí')}</Text>
          </TouchableOpacity>
        )}

        {onDownloadOffline && !isWeb && (
          <TouchableOpacity style={styles.footerBtnIconOnly} onPress={onDownloadOffline} accessibilityLabel="Descargar mapa">
            <Download size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const getStyles = (colors: typeof LIGHT_COLORS) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
      gap: 8,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    headerTitleCol: {
      flex: 1,
    },
    locationPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    locationText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    resortTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginTop: 1,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headerIconBtn: {
      width: 34,
      height: 34,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mountainStatsBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    mountainStatItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border,
    },
    mountainStatLabel: {
      fontSize: 9,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    mountainStatValue: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    powderAlarmRibbon: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#4338ca',
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    powderAlarmTitle: {
      fontSize: 11,
      fontWeight: 'bold',
      color: '#ffffff',
    },
    powderAlarmSubtitle: {
      fontSize: 9.5,
      color: '#e0e7ff',
    },
    tabsRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 2,
    },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    tabBtnText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabBtnTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    scrollContent: {
      flex: 1,
    },
    scrollInner: {
      padding: SPACING.md,
      paddingBottom: SPACING.xl * 2,
      gap: SPACING.md,
    },
    tabSection: {
      gap: 12,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    snowDepthCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 12,
      ...SHADOWS.sm,
    },
    snowDepthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    qualityBadge: {
      backgroundColor: '#e0f2fe',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.round,
      borderWidth: 1,
      borderColor: '#bae6fd',
    },
    qualityBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: '#0284c7',
    },
    depthColumnsRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingVertical: 6,
      gap: 8,
    },
    depthCol: {
      alignItems: 'center',
      flex: 1,
      gap: 2,
    },
    depthMeterTrack: {
      width: 22,
      height: 70,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      justifyContent: 'flex-end',
      overflow: 'hidden',
      marginBottom: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    depthMeterTrackMid: {
      borderColor: '#7dd3fc',
    },
    depthMeterTrackSummit: {
      borderColor: '#bae6fd',
    },
    depthMeterFill: {
      width: '100%',
      backgroundColor: '#38bdf8',
      borderRadius: 2,
    },
    depthMeterFillMid: {
      backgroundColor: '#0ea5e9',
    },
    depthMeterFillSummit: {
      backgroundColor: '#0284c7',
    },
    depthColAmount: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    depthUnit: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    depthColTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    depthColAlt: {
      fontSize: 9.5,
      color: colors.textSecondary,
    },
    depthCenterDivider: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      marginBottom: 16,
    },
    depthCenterDrop: {
      fontSize: 10,
      fontWeight: '600',
      color: '#0284c7',
    },
    snowHistoryGrid: {
      flexDirection: 'row',
      gap: 8,
    },
    historyCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.sm,
      padding: 10,
      gap: 2,
    },
    historyCardLabel: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    historyCardValue: {
      fontSize: 14,
      fontWeight: '800',
      color: '#0284c7',
    },
    historyCardSub: {
      fontSize: 8.5,
      color: colors.textLight,
    },
    freezingLevelCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.sm,
      padding: 10,
    },
    freezingLevelLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    freezingLevelTitle: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    freezingLevelSubtitle: {
      fontSize: 10.5,
      color: colors.textPrimary,
      fontWeight: '500',
      marginTop: 1,
    },
    forecastCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 10,
    },
    forecastCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    forecastSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 1,
    },
    dailyBarsScroll: {
      gap: 10,
      paddingVertical: 4,
      alignItems: 'flex-end',
      minHeight: 110,
    },
    dailyBarsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      minHeight: 110,
      paddingTop: 8,
    },
    dailyBarCol: {
      width: 58,
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 3,
      paddingVertical: 4,
    },
    dailyBarColToday: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    dailyBarSnow: {
      fontSize: 9,
      color: colors.textLight,
      fontWeight: '600',
    },
    dailyBarSnowActive: {
      color: '#0284c7',
      fontWeight: '800',
    },
    barTrack: {
      height: 52,
      width: 14,
      backgroundColor: colors.surface,
      borderRadius: 3,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    barFill: {
      width: '100%',
      borderRadius: 2,
    },
    dailyBarDayName: {
      fontSize: 9.5,
      fontWeight: '600',
      color: colors.textPrimary,
      textTransform: 'capitalize',
    },
    dailyBarDateText: {
      fontSize: 8,
      color: colors.textLight,
    },
    dailyBarTemp: {
      fontSize: 8,
      color: colors.textSecondary,
      marginTop: 1,
    },
    emptyStateBox: {
      alignItems: 'center',
      paddingVertical: 16,
      gap: 6,
    },
    emptyStateText: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    avalancheCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 10,
    },
    avalancheHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    avalancheHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    avalancheBadgeIcon: {
      width: 30,
      height: 30,
      borderRadius: BORDER_RADIUS.round,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avalancheSub: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    dangerLevelTag: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.round,
    },
    dangerLevelTagText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#ffffff',
    },
    scaleBarRow: {
      flexDirection: 'row',
      gap: 4,
    },
    scaleSegment: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
    },
    scaleFill: {
      width: '100%',
      borderRadius: 2,
    },
    scaleNum: {
      fontSize: 9,
    },
    avalancheFactorsRow: {
      flexDirection: 'row',
      gap: 6,
    },
    avalancheFactorBox: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: 6,
      borderRadius: BORDER_RADIUS.sm,
      gap: 2,
    },
    factorLabel: {
      fontSize: 8.5,
      color: colors.textSecondary,
    },
    factorVal: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    aspectsPillsWrap: {
      flexDirection: 'row',
      gap: 2,
      flexWrap: 'wrap',
    },
    aspectPill: {
      backgroundColor: colors.card,
      paddingHorizontal: 3,
      paddingVertical: 1,
      borderRadius: 2,
    },
    aspectPillText: {
      fontSize: 8,
      fontWeight: 'bold',
      color: '#ea580c',
    },
    avalancheSummaryBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      backgroundColor: '#fffbeb',
      padding: 8,
      borderRadius: BORDER_RADIUS.sm,
      borderLeftWidth: 3,
      borderLeftColor: '#ea580c',
    },
    avalancheSummaryText: {
      fontSize: 10.5,
      color: '#9a3412',
      flex: 1,
      lineHeight: 14,
    },
    domainSummaryCard: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 12,
    },
    domainSummaryCol: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    domainSummaryNumber: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.primary,
    },
    domainSummaryLabel: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    domainSummaryDivider: {
      width: 1,
      backgroundColor: colors.border,
      marginVertical: 4,
    },
    pistesBreakdownCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 10,
    },
    diffGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    diffCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      padding: 8,
      width: '48%',
      gap: 8,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    diffCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '12',
    },
    diffColorDot: {
      width: 12,
      height: 12,
      borderRadius: BORDER_RADIUS.round,
    },
    diffCount: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    diffName: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    liftsBreakdownCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 10,
    },
    liftsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    liftTypeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      padding: 8,
      width: '48%',
      gap: 8,
    },
    liftTypeName: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    liftTypeCount: {
      fontSize: 9.5,
      color: colors.textSecondary,
    },
    altitudeCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 8,
    },
    altitudesRow: {
      flexDirection: 'row',
      gap: 12,
    },
    altitudeItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      padding: 8,
      borderRadius: BORDER_RADIUS.sm,
    },
    altitudeLabel: {
      fontSize: 9.5,
      color: colors.textSecondary,
    },
    altitudeValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    weatherCurrentCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 12,
    },
    weatherCurrentTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    weatherTempText: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    weatherFeelsLike: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    weatherConditionDesc: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
      marginTop: 2,
      marginBottom: 2,
    },
    weatherFreezingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.sm,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    weatherFreezingText: {
      fontSize: 11,
      color: colors.textSecondary,
      flex: 1,
    },
    weatherSnowSummaryRibbon: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      paddingVertical: 8,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    weatherSnowRibbonItem: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    weatherSnowRibbonVal: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    weatherSnowRibbonLbl: {
      fontSize: 9,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    weatherSnowRibbonDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border,
    },
    weatherIconCircle: {
      width: 52,
      height: 52,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weatherMetricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    weatherMetricItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      padding: 8,
      borderRadius: BORDER_RADIUS.sm,
      width: '48%',
      gap: 6,
    },
    weatherMetricLabel: {
      fontSize: 9,
      color: colors.textSecondary,
    },
    weatherMetricValue: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    hourlyCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 10,
    },
    hourlyHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    hourlyScrollNav: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    hourlyNavBtn: {
      width: 28,
      height: 28,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hourlyScrollWrapper: {
      width: '100%',
    },
    hourlyScrollView: {
      marginHorizontal: -12,
      paddingHorizontal: 12,
      ...(Platform.OS === 'web'
        ? ({
            overflowX: 'auto',
            overflowY: 'hidden',
            cursor: 'grab',
          } as any)
        : {}),
    },
    hourlyScroll: {
      gap: 8,
      paddingVertical: 4,
    },
    hourlyItem: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: BORDER_RADIUS.md,
      width: 96,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    hourlyIconBox: {
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hourlyTimeText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '700',
    },
    hourlyTemp: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    hourlyPrecipContainer: {
      minHeight: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hourlySnowPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: '#e0f2fe',
      paddingHorizontal: 5,
      paddingVertical: 1.5,
      borderRadius: BORDER_RADIUS.sm,
    },
    hourlySnowPillText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#0284c7',
    },
    hourlyRainPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.card,
      paddingHorizontal: 4,
      paddingVertical: 1.5,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    hourlyRainPillText: {
      fontSize: 9,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    hourlyNoSnowText: {
      fontSize: 10,
      color: colors.textLight,
      fontWeight: '500',
    },
    hourlyWindBox: {
      alignItems: 'center',
      gap: 1,
    },
    hourlyWindRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    hourlyWindText: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    hourlyWindDirText: {
      fontSize: 8.5,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    hourlyVisBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center',
      width: '100%',
    },
    hourlyVisText: {
      fontSize: 8.5,
      fontWeight: '700',
      textAlign: 'center',
    },
    sevenDayForecastCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 10,
    },
    sevenDayHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sevenDayTabsScroll: {
      flexDirection: 'row',
      gap: 6,
      paddingVertical: 2,
    },
    sevenDayTabChip: {
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 9,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 58,
      gap: 2,
    },
    sevenDayTabChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    sevenDayTabDay: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    sevenDayTabDayActive: {
      color: '#ffffff',
      fontWeight: '800',
    },
    sevenDayTabDate: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    sevenDayTabDateActive: {
      color: 'rgba(255,255,255,0.85)',
    },
    sevenDayTabBadgeRow: {
      marginTop: 2,
    },
    sevenDayTabSnowBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: '#e0f2fe',
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 3,
    },
    sevenDayTabSnowText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#0284c7',
    },
    sevenDayTabTemp: {
      fontSize: 9.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    sevenDayTabTempActive: {
      color: '#ffffff',
    },
    sevenDayFullWidthScroll: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 4,
    },
    sevenDayFullCard: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: SPACING.md,
      gap: 12,
      ...SHADOWS.sm,
    },
    sevenDayFullCardToday: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '06',
    },
    sevenDayFullCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sevenDayFullCardTitleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sevenDayFullCardTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    sevenDayFullCardDate: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    sevenDayFullCardStep: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    sevenDayMainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    sevenDayMainConditionGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    sevenDayConditionText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    sevenDayTempGroup: {
      alignItems: 'flex-end',
    },
    sevenDayTempRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
    },
    sevenDayMaxTempText: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    sevenDayMinTempText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    sevenDayTempSub: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    sevenDayGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    sevenDayGridBox: {
      flex: 1,
      minWidth: 125,
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.sm,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    sevenDayGridHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sevenDayGridLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    sevenDayGridValue: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    sevenDayGridSub: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    sevenDayHourlyWrap: {
      gap: 6,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    sevenDayHourlyTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sevenDayHourlyTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    sevenDayHourlyScroll: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 4,
    },
    sevenDayHourlyItem: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.sm,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 50,
      gap: 3,
    },
    sevenDayHourlyTime: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    sevenDayHourlyIcon: {
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sevenDayHourlyTemp: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    sevenDayHourlySnow: {
      fontSize: 9.5,
      fontWeight: '700',
      color: '#0284c7',
    },
    sevenDayHourlyRain: {
      fontSize: 9.5,
      fontWeight: '700',
      color: '#0ea5e9',
    },
    sessionsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sessionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.sm,
      padding: 10,
    },
    sessionCardLeft: {
      gap: 2,
    },
    sessionDateText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
      textTransform: 'capitalize',
    },
    sessionUserName: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    sessionStatsInline: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 2,
    },
    sessionStat: {
      fontSize: 9.5,
      color: colors.primary,
      fontWeight: '600',
    },
    emptySessionsCard: {
      alignItems: 'center',
      padding: 24,
      gap: 6,
    },
    emptySessionsTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    emptySessionsSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    officialWebsiteCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 8,
    },
    officialWebsiteTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    officialWebsiteUrl: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    officialWebsiteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.sm,
      gap: 4,
    },
    officialWebsiteBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#ffffff',
    },
    pisteDirectoryContainer: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: 14,
      gap: 12,
    },
    pisteDirectoryHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    pisteDirectorySubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    pisteCountBadge: {
      backgroundColor: colors.surface,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pisteCountBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    unnamedToggleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.round,
      gap: 4,
    },
    unnamedToggleBtnActive: {
      backgroundColor: colors.primary + '15',
      borderColor: colors.primary,
    },
    unnamedToggleBtnText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    unnamedToggleBtnTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    pisteSearchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      height: 38,
      gap: 8,
    },
    pisteSearchInput: {
      flex: 1,
      fontSize: 12.5,
      color: colors.textPrimary,
      paddingVertical: 0,
    },
    filterChipsRow: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 2,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.round,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    filterChipActiveAll: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterChipTextActiveAll: {
      color: '#ffffff',
      fontWeight: '700',
    },
    filterChipActiveGreen: {
      backgroundColor: '#e8f5e9',
      borderColor: '#00a859',
    },
    filterChipActiveBlue: {
      backgroundColor: '#e0f2fe',
      borderColor: '#0072bc',
    },
    filterChipActiveRed: {
      backgroundColor: '#fee2e2',
      borderColor: '#ef4444',
    },
    filterChipActiveBlack: {
      backgroundColor: '#f1f5f9',
      borderColor: '#0f172a',
    },
    filterChipDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    filterChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    filterChipTextActiveColor: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    pisteListContainer: {
      gap: 8,
      marginTop: 4,
    },
    pisteCard: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    pisteCardMain: {
      flexDirection: 'row',
    },
    pisteDiffIndicator: {
      width: 5,
    },
    pisteCardBody: {
      flex: 1,
      padding: 10,
      gap: 7,
    },
    pisteCardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
    },
    pisteRefBadge: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 3,
    },
    pisteRefBadgeText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: colors.textSecondary,
    },
    pisteUnnamedBadge: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 3,
    },
    pisteUnnamedBadgeText: {
      fontSize: 9.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    pisteNameText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      flexShrink: 1,
    },
    pisteDifficultyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.round,
    },
    pisteDiffDotSmall: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    pisteDifficultyBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
    },
    pisteMetricsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      alignItems: 'center',
    },
    pisteMetricChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.card,
      paddingHorizontal: 6,
      paddingVertical: 2.5,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pisteMetricText: {
      fontSize: 10.5,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    pisteCardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    pisteFeaturesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      alignItems: 'center',
    },
    pisteFeatureTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.card,
      paddingHorizontal: 5,
      paddingVertical: 1.5,
      borderRadius: 3,
    },
    pisteFeatureTagText: {
      fontSize: 9.5,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    pisteMapButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary + '18',
      paddingHorizontal: 8,
      paddingVertical: 3.5,
      borderRadius: BORDER_RADIUS.sm,
    },
    pisteMapButtonText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
    },
    pisteEmptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 24,
      gap: 6,
    },
    pisteEmptyIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pisteEmptyTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    pisteEmptySubtitle: {
      fontSize: 11.5,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 16,
    },
    pisteResetFiltersBtn: {
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.primary,
      borderRadius: BORDER_RADIUS.round,
    },
    pisteResetFiltersText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#ffffff',
    },
    footerBar: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    footerBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      borderRadius: BORDER_RADIUS.sm,
      gap: 6,
    },
    footerBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    footerBtnPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    footerBtnPrimaryText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#ffffff',
    },
    footerBtnIconOnly: {
      width: 42,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.sm,
    },
    modelSelectorContainer: {
      paddingHorizontal: SPACING.md,
      paddingTop: 8,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 6,
    },
    modelSelectorHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modelSelectorLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    modelUpdatingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    modelUpdatingText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.primary,
    },
    modelChipsScroll: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 2,
    },
    modelChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    modelChipActive: {
      backgroundColor: colors.primary + '14',
      borderColor: colors.primary,
    },
    modelChipFlag: {
      fontSize: 16,
    },
    modelChipTitle: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    modelChipTitleActive: {
      color: colors.primary,
    },
    modelChipSub: {
      fontSize: 9.5,
      color: colors.textSecondary,
    },
    modelChipSubActive: {
      color: colors.primary,
      fontWeight: '600',
    },
    modelComparisonCard: {
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      gap: SPACING.sm,
      ...SHADOWS.sm,
    },
    modelComparisonHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    modelComparisonTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 2,
    },
    modelComparisonList: {
      gap: 8,
    },
    modelComparisonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 10,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: 12,
    },
    modelComparisonRowActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '10',
    },
    modelComparisonRowLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    modelComparisonRowFlag: {
      fontSize: 20,
    },
    modelComparisonRowNameWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    modelComparisonRowName: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    modelComparisonRowNameActive: {
      color: colors.primary,
    },
    modelSelectedBadge: {
      backgroundColor: colors.primary,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
    },
    modelSelectedBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      color: '#ffffff',
      textTransform: 'uppercase',
    },
    modelComparisonRowProvider: {
      fontSize: 10.5,
      color: colors.textSecondary,
      marginTop: 1,
    },
    modelComparisonBarTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginTop: 6,
      overflow: 'hidden',
    },
    modelComparisonBarFill: {
      height: '100%',
      borderRadius: 2,
    },
    modelComparisonRowRight: {
      alignItems: 'flex-end',
      minWidth: 70,
    },
    modelComparisonSnowVal: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    modelComparisonSnowValActive: {
      color: '#0284c7',
    },
    modelComparisonSnowUnit: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    modelComparisonTapHint: {
      fontSize: 9.5,
      color: colors.textSecondary,
      marginTop: 2,
    },
    modelComparisonFooterNote: {
      marginTop: 4,
      padding: 8,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modelComparisonFooterText: {
      fontSize: 11,
      lineHeight: 15,
      color: colors.textSecondary,
    },
    infonieveStatusCard: {
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      gap: 10,
      ...SHADOWS.sm,
    },
    infonieveStatusTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    infonieveStatusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infonieveStatusBadgeText: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    infonieveStatusDateBox: {
      flex: 1,
      gap: 2,
    },
    infonieveStatusDateText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    infonieveStatusUpdatedText: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    infonieveStatusObsBox: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infonieveStatusObsLabel: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.textPrimary,
      lineHeight: 16,
    },
    infonieveStatusObsText: {
      fontWeight: 'normal',
      color: colors.textSecondary,
    },
    infonieveCard: {
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      gap: 12,
      ...SHADOWS.sm,
    },
    infonieveHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    infonieveSectionTitle: {
      fontSize: 12.5,
      fontWeight: '800',
      color: '#0284c7',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    infonieveSectionSub: {
      fontSize: 10.5,
      color: colors.textSecondary,
    },
    infonieveGrid4: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    infonieveBox: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      gap: 3,
    },
    infonieveBoxLabel: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    infonieveBoxValRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 2,
    },
    infonieveBoxValue: {
      fontSize: 20,
      fontWeight: '800',
      color: '#0284c7',
    },
    infonieveBoxUnit: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    infonieveBoxValueText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#0284c7',
    },
    infonieveBoxSub: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    infonieveDangerBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      marginTop: 2,
    },
    infonieveDangerBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: '#ffffff',
    },
    infonieveGrid3: {
      flexDirection: 'row',
      gap: 8,
    },
    infonieveCircleCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    infonieveFractionRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 2,
      marginVertical: 2,
    },
    infonieveFractionNum: {
      fontSize: 20,
      fontWeight: '800',
      color: '#0284c7',
    },
    infonieveFractionDen: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    infonievePistesBreakdownRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingTop: 4,
    },
    infonievePisteChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infonievePisteDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    infonievePisteChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    infonieveDayCotasWrap: {
      width: '100%',
      backgroundColor: colors.card,
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 3,
      marginVertical: 4,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 2,
    },
    infonieveDayCotaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    infonieveDayCotaAlt: {
      fontSize: 8.5,
      color: colors.textSecondary,
    },
    infonieveDayCotaVal: {
      fontSize: 9.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    forecastDaysScroll: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 4,
      paddingRight: 16,
    },
    forecastDayColCard: {
      width: 175,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: 12,
      gap: 10,
      ...SHADOWS.sm,
    },
    forecastDayColCardToday: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '08',
    },
    forecastDayColHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    forecastDayColTitleGroup: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
    },
    forecastDayColTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    forecastDayColDate: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    forecastDayColMetrics: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    forecastDayColTemp: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    forecastDayColCotas: {
      gap: 6,
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.sm,
      padding: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    forecastDayColCotaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 4,
    },
    forecastDayColCotaLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flex: 1,
    },
    forecastDayColCotaName: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    forecastDayColCotaAlt: {
      fontSize: 9.5,
      color: colors.textSecondary,
    },
    forecastDayColCotaVal: {
      fontSize: 12,
      fontWeight: '800',
      textAlign: 'right',
    },
    forecastDayColFooter: {
      gap: 5,
    },
    forecastDayColPrecip: {
      fontSize: 10.5,
      color: colors.textSecondary,
      textAlign: 'right',
      fontWeight: '600',
    },
    forecastTodayBadge: {
      backgroundColor: colors.primary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    forecastTodayBadgeText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#ffffff',
      textTransform: 'uppercase',
    },
    forecastDaySnowPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3.5,
      borderRadius: BORDER_RADIUS.sm,
    },
    forecastDaySnowPillActive: {
      backgroundColor: '#0284c7',
    },
    forecastDaySnowPillEmpty: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    forecastDaySnowPillText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textSecondary,
    },
    forecastDaySnowPillTextActive: {
      color: '#ffffff',
    },
    forecastDayBarTrack: {
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    forecastDayBarFill: {
      height: '100%',
      borderRadius: 2.5,
    },
    cotasVerticalList: {
      gap: 10,
      paddingTop: 4,
    },
    cotaVerticalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cotaVerticalLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 160,
    },
    cotaDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    cotaVerticalTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    cotaVerticalAlt: {
      fontSize: 10.5,
      color: colors.textSecondary,
    },
    cotaVerticalCenter: {
      flex: 1,
    },
    cotaBarTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    cotaBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    cotaVerticalVal: {
      fontSize: 16,
      fontWeight: '800',
      minWidth: 65,
      textAlign: 'right',
    },
    cotaVerticalUnit: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
