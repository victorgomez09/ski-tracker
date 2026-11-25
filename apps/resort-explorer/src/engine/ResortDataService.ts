import valdesquiOsmData from '../data/valdesqui-osm.json';

export interface GeoJSONGeometry {
  type: string;
  coordinates: [number, number][] | [number, number, number][];
}

export interface OSMSkiPiste {
  id: string;
  name: string;
  difficulty: 'novice' | 'easy' | 'intermediate' | 'advanced' | 'expert' | string;
  piste_type?: string;
  geometry_geojson: GeoJSONGeometry;
}

export interface OSMSkiLift {
  id: string;
  name: string;
  lift_type: string;
  geometry_geojson: GeoJSONGeometry;
}

export interface OSMResortPOI {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
}

export interface LiveWeatherInfo {
  temperatureC: number;
  weatherCode: number;
  windSpeedKmh: number;
  snowDepthCm: number;
  snowfallTodayCm: number;
  snowCondition: string;
  snowConditionLabel: string;
  forecast7dCm: number;
  isLiveBackend: boolean;
}

export interface ResortSummary {
  id: string;
  name: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
  base_altitude: number;
  summit_altitude: number;
  pistes_count?: number;
  lifts_count?: number;
  isOfflineReady?: boolean;
}

export interface ResortDataPayload {
  id: string;
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
  base_altitude: number;
  summit_altitude: number;
  bbox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  pistes: OSMSkiPiste[];
  lifts: OSMSkiLift[];
  pois?: OSMResortPOI[];
}

const FALLBACK_RESORTS_CATALOG: ResortSummary[] = [
  {
    id: 'valdesqui',
    name: 'Valdesquí',
    region: 'Sierra de Guadarrama',
    country: 'España',
    latitude: 40.7997,
    longitude: -3.9745,
    base_altitude: 1860,
    summit_altitude: 2280,
    pistes_count: 62,
    lifts_count: 15,
    isOfflineReady: true,
  },
  {
    id: 'sierra-nevada',
    name: 'Sierra Nevada',
    region: 'Granada',
    country: 'España',
    latitude: 37.0954,
    longitude: -3.3989,
    base_altitude: 2100,
    summit_altitude: 3300,
    pistes_count: 131,
    lifts_count: 21,
  },
  {
    id: 'baqueira-beret',
    name: 'Baqueira Beret',
    region: 'Val d\'Aran',
    country: 'España',
    latitude: 42.6997,
    longitude: 0.9467,
    base_altitude: 1500,
    summit_altitude: 2610,
    pistes_count: 115,
    lifts_count: 36,
  },
  {
    id: 'formigal',
    name: 'Formigal - Panticosa',
    region: 'Pirineo Aragonés',
    country: 'España',
    latitude: 42.7731,
    longitude: -0.3672,
    base_altitude: 1501,
    summit_altitude: 2250,
    pistes_count: 147,
    lifts_count: 37,
  },
  {
    id: 'grandvalira',
    name: 'Grandvalira',
    region: 'Pirineos',
    country: 'Andorra',
    latitude: 42.5419,
    longitude: 1.6669,
    base_altitude: 1710,
    summit_altitude: 2640,
    pistes_count: 139,
    lifts_count: 67,
  },
  {
    id: 'la-molina-masella',
    name: 'Alp 2500 (La Molina + Masella)',
    region: 'Cerdanya',
    country: 'España',
    latitude: 42.3396,
    longitude: 1.9367,
    base_altitude: 1600,
    summit_altitude: 2535,
    pistes_count: 135,
    lifts_count: 34,
  },
  {
    id: 'cerler',
    name: 'Cerler',
    region: 'Valle de Benasque',
    country: 'España',
    latitude: 42.5892,
    longitude: 0.5411,
    base_altitude: 1500,
    summit_altitude: 2630,
    pistes_count: 72,
    lifts_count: 19,
  },
  {
    id: 'la-pinilla',
    name: 'La Pinilla',
    region: 'Sierra de Ayllón',
    country: 'España',
    latitude: 41.2017,
    longitude: -3.4719,
    base_altitude: 1500,
    summit_altitude: 2047,
    pistes_count: 23,
    lifts_count: 13,
  },
];

/**
 * Servicio de datos geoespaciales conectado al backend Go (/api/v1/resorts)
 * con catálogo offline de respaldo para exploración instantánea.
 */
export class ResortDataService {
  private static activeResort: ResortDataPayload = ResortDataService.getValdesquiOfflineData();

  public static getApiBaseUrl(): string {
    const params = new URLSearchParams(window.location.search);
    return params.get('apiBaseUrl') || 'http://localhost:8082';
  }

  public static getActiveResort(): ResortDataPayload {
    return this.activeResort;
  }

  public static setActiveResort(data: ResortDataPayload) {
    this.activeResort = data;
  }

  private static extractResortStats(r: any) {
    const tags = r.Tags || r.tags || {};
    const stats = tags.statistics || {};

    const rawMin = stats.minElevation ?? stats.runs?.minElevation ?? stats.lifts?.minElevation ?? r.base_altitude;
    const rawMax = stats.maxElevation ?? stats.runs?.maxElevation ?? stats.lifts?.maxElevation ?? r.summit_altitude;

    const baseAlt = rawMin ? Math.round(Number(rawMin)) : 0;
    const summitAlt = rawMax ? Math.round(Number(rawMax)) : 0;

    let pistesCount = Number(r.pistes_count || stats.pistesCount || (r.Pistes || r.pistes)?.length || 0);
    if (!pistesCount && stats.runs?.byDifficulty) {
      pistesCount = Object.values(stats.runs.byDifficulty).reduce(
        (sum: number, d: any) => sum + (typeof d?.count === 'number' ? d.count : 0),
        0
      );
    }

    let liftsCount = Number(r.lifts_count || stats.liftsCount || (r.Lifts || r.lifts)?.length || 0);
    if (!liftsCount && stats.lifts?.byType) {
      liftsCount = Object.values(stats.lifts.byType).reduce(
        (sum: number, l: any) => sum + (typeof l?.count === 'number' ? l.count : 0),
        0
      );
    }

    const region = r.region || r.Region || tags.region || tags['addr:state'] || tags['addr:province'] || '';

    return { baseAlt, summitAlt, pistesCount, liftsCount, region };
  }

  /**
   * Obtiene la lista de estaciones desde el backend (/api/v1/resorts/bbox)
   * cubriendo la Península Ibérica y Andorra, con respaldo offline.
   */
  public static async fetchResortsCatalog(): Promise<{ resorts: ResortSummary[]; isLive: boolean }> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/resorts/bbox?minLon=-10&minLat=35&maxLon=5&maxLat=44`
      ).catch(() => null);

      if (response && response.ok) {
        const rawList = await response.json();
        if (Array.isArray(rawList) && rawList.length > 0) {
          const mapped: ResortSummary[] = rawList
            .map((r: any) => {
              const { baseAlt, summitAlt, pistesCount, liftsCount, region } = this.extractResortStats(r);
              return {
                id: String(r.id || r.ID),
                name: r.name || r.Name || 'Estación',
                region,
                country: r.country || r.Country || 'España',
                latitude: Number(r.latitude || r.Latitude || 40.7997),
                longitude: Number(r.longitude || r.Longitude || -3.9745),
                base_altitude: baseAlt,
                summit_altitude: summitAlt,
                pistes_count: pistesCount || undefined,
                lifts_count: liftsCount || undefined,
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'es'));
          return { resorts: mapped, isLive: true };
        }
      }
    } catch (e) {
      console.warn('[ResortDataService] Backend no disponible para catálogo, usando catálogo local:', e);
    }
    return { resorts: FALLBACK_RESORTS_CATALOG, isLive: false };
  }

  public static async fetchFromBackend(idOrName = 'valdesqui'): Promise<ResortDataPayload | null> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      // 1. Intentar por ID
      let response = await fetch(`${apiBaseUrl}/api/v1/resorts/by-id/${encodeURIComponent(idOrName)}`).catch(() => null);

      // 2. Si falla o no está, intentar por nombre
      if (!response || !response.ok) {
        response = await fetch(`${apiBaseUrl}/api/v1/resorts/by-name?name=${encodeURIComponent(idOrName)}`).catch(() => null);
      }

      if (!response || !response.ok) return null;
      let data = await response.json();

      if (Array.isArray(data)) {
        if (data.length === 0) return null;
        data = data[0];
      }

      let rawPistes = data.pistes || data.Pistes || [];
      let rawLifts = data.lifts || data.Lifts || [];
      let rawPOIs = data.pois || data.POIs || [];

      const resortID = String(data.id || data.ID || idOrName);

      // Si /by-id no incluyó pistas, intentar /offline-pack
      if (rawPistes.length === 0 && resortID) {
        const packRes = await fetch(
          `${apiBaseUrl}/api/v1/resorts/by-id/${encodeURIComponent(resortID)}/offline-pack`
        ).catch(() => null);
        if (packRes && packRes.ok) {
          const pack = await packRes.json();
          rawPistes = pack.pistes || pack.Pistes || rawPistes;
          rawLifts = pack.lifts || pack.Lifts || rawLifts;
          rawPOIs = pack.pois || pack.POIs || rawPOIs;
        }
      }

      if (rawPOIs.length === 0 && resortID) {
        const poisRes = await fetch(
          `${apiBaseUrl}/api/v1/resorts/by-id/${encodeURIComponent(resortID)}/pois`
        ).catch(() => null);
        if (poisRes && poisRes.ok) {
          const fetchedPOIs = await poisRes.json();
          if (Array.isArray(fetchedPOIs)) rawPOIs = fetchedPOIs;
        }
      }

      const normalizedPistes: OSMSkiPiste[] = rawPistes
        .filter((p: any) => (p.geometry_geojson || p.GeometryGeoJSON)?.coordinates?.length >= 2)
        .map((p: any) => ({
          id: String(p.id || p.ID || Math.random()),
          name: p.name || p.Name || 'Pista',
          difficulty: (p.difficulty || p.Difficulty || 'easy').toLowerCase(),
          piste_type: p.piste_type || p.PisteType || 'downhill',
          geometry_geojson: p.geometry_geojson || p.GeometryGeoJSON,
        }));

      const normalizedLifts: OSMSkiLift[] = rawLifts
        .filter((l: any) => (l.geometry_geojson || l.GeometryGeoJSON)?.coordinates?.length >= 2)
        .map((l: any) => ({
          id: String(l.id || l.ID || Math.random()),
          name: l.name || l.Name || 'Remonte',
          lift_type: (l.lift_type || l.LiftType || 'chair_lift').toLowerCase(),
          geometry_geojson: l.geometry_geojson || l.GeometryGeoJSON,
        }));

      const normalizedPOIs: OSMResortPOI[] = rawPOIs
        .filter((poi: any) => (poi.latitude ?? poi.Latitude) && (poi.longitude ?? poi.Longitude))
        .map((poi: any) => ({
          id: String(poi.id || poi.ID || Math.random()),
          name: poi.name || poi.Name || 'POI',
          category: (poi.category || poi.Category || 'info').toLowerCase(),
          latitude: Number(poi.latitude ?? poi.Latitude),
          longitude: Number(poi.longitude ?? poi.Longitude),
        }));

      const { baseAlt, summitAlt } = this.extractResortStats(data);

      const normalized: ResortDataPayload = {
        id: resortID,
        name: data.name || data.Name || idOrName,
        country: data.country || data.Country || 'Spain',
        latitude: Number(data.latitude || data.Latitude || 40.7940),
        longitude: Number(data.longitude || data.Longitude || -3.9719),
        base_altitude: baseAlt || 1800,
        summit_altitude: summitAlt || 2250,
        pistes: normalizedPistes,
        lifts: normalizedLifts,
        pois: normalizedPOIs,
      };

      if (normalizedPistes.length > 0) {
        this.activeResort = normalized;
        return normalized;
      }
      return null;
    } catch (e) {
      console.warn('[ResortDataService] Fallback local a OSM embebido:', e);
      return null;
    }
  }

  /**
   * Genera un trazado procedural básico en caso de seleccionar una estación sin backend activo
   * y que no sea Valdesquí (que cuenta con su dataset OSM completo embebido).
   */
  public static buildOfflineResortFallback(summary: ResortSummary): ResortDataPayload {
    if (summary.id === 'valdesqui' || summary.name.toLowerCase().includes('valdesqu')) {
      return this.getValdesquiOfflineData();
    }

    const lat = summary.latitude;
    const lon = summary.longitude;
    const pistes: OSMSkiPiste[] = [
      {
        id: `${summary.id}-p1`,
        name: 'Pista Central',
        difficulty: 'easy',
        geometry_geojson: {
          type: 'LineString',
          coordinates: [
            [lon + 0.002, lat - 0.008],
            [lon + 0.001, lat - 0.004],
            [lon - 0.001, lat + 0.001],
            [lon, lat + 0.005],
          ],
        },
      },
      {
        id: `${summary.id}-p2`,
        name: 'Descenso Norte',
        difficulty: 'intermediate',
        geometry_geojson: {
          type: 'LineString',
          coordinates: [
            [lon - 0.003, lat - 0.009],
            [lon - 0.004, lat - 0.003],
            [lon - 0.002, lat + 0.002],
            [lon, lat + 0.005],
          ],
        },
      },
      {
        id: `${summary.id}-p3`,
        name: 'Debutantes Base',
        difficulty: 'novice',
        geometry_geojson: {
          type: 'LineString',
          coordinates: [
            [lon + 0.003, lat + 0.001],
            [lon + 0.002, lat + 0.003],
            [lon + 0.001, lat + 0.005],
          ],
        },
      },
    ];

    const lifts: OSMSkiLift[] = [
      {
        id: `${summary.id}-l1`,
        name: 'Telesilla Principal',
        lift_type: 'chair_lift',
        geometry_geojson: {
          type: 'LineString',
          coordinates: [
            [lon, lat + 0.005],
            [lon + 0.001, lat - 0.007],
          ],
        },
      },
    ];

    return {
      id: summary.id,
      name: summary.name,
      country: summary.country,
      latitude: lat,
      longitude: lon,
      base_altitude: summary.base_altitude,
      summit_altitude: summary.summit_altitude,
      pistes,
      lifts,
    };
  }

  public static getValdesquiOfflineData(): ResortDataPayload {
    return valdesquiOsmData as unknown as ResortDataPayload;
  }

  /**
   * Obtiene el clima en tiempo real y el parte de nieve desde el backend Go
   * (/api/v1/weather) con respaldo directo a Open-Meteo si el backend no responde.
   */
  public static async fetchLiveWeather(
    resortId: string,
    lat: number,
    lon: number
  ): Promise<LiveWeatherInfo | null> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/v1/weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&resort_id=${encodeURIComponent(resortId)}`
      ).catch(() => null);

      if (res && res.ok) {
        const w = await res.json();
        const curr = w.current || w.Current || {};
        const sr = w.snow_report || w.SnowReport || {};
        return {
          temperatureC: Math.round(Number(curr.temperature_2m ?? curr.temperature ?? w.temperature ?? 0)),
          weatherCode: Number(curr.weather_code ?? curr.weathercode ?? w.weather_code ?? 0),
          windSpeedKmh: Math.round(Number(curr.wind_speed_10m ?? curr.windspeed ?? 10)),
          snowDepthCm: Math.round(Number(sr.snow_depth_summit_cm ?? sr.snow_depth_base_cm ?? 0)),
          snowfallTodayCm: Number(sr.snowfall_today_summit_cm ?? 0),
          snowCondition: String(sr.snow_condition || 'packed_powder'),
          snowConditionLabel: String(sr.snow_condition_label || 'Nieve pisada'),
          forecast7dCm: Math.round(Number(sr.forecast_snow_7d_cm ?? 0)),
          isLiveBackend: true,
        };
      }
    } catch {
      // Continuar con respaldo Open-Meteo
    }

    // Respaldo directo Open-Meteo (gratuito, sin API key)
    try {
      const omRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,weather_code,wind_speed_10m,snowfall&timezone=auto`
      ).catch(() => null);
      if (omRes && omRes.ok) {
        const om = await omRes.json();
        const curr = om.current || {};
        const snowfall = Number(curr.snowfall || 0);
        return {
          temperatureC: Math.round(Number(curr.temperature_2m ?? 0)),
          weatherCode: Number(curr.weather_code ?? 0),
          windSpeedKmh: Math.round(Number(curr.wind_speed_10m ?? 10)),
          snowDepthCm: 0,
          snowfallTodayCm: snowfall,
          snowCondition: snowfall > 0 ? 'powder' : 'packed_powder',
          snowConditionLabel: snowfall > 0 ? 'Nevando / Polvo' : 'Nieve pisada',
          forecast7dCm: 0,
          isLiveBackend: false,
        };
      }
    } catch {
      return null;
    }

    return null;
  }
}
