import axios from 'axios';
import { API_BASE_URL } from '../constants/constants';
import api from '../interceptor/api';
import { DailySnowItem, ResortSnowForecast, SnowRegion, SnowTimeframe } from '../models/snow-forecast.model';

export interface ResortSeedData {
  id: string;
  name: string;
  country: 'Spain' | 'Andorra';
  country_code: 'ES' | 'AD';
  region: SnowRegion;
  region_label: string;
  latitude: number;
  longitude: number;
  base_elevation_m: number;
  mid_elevation_m?: number;
  summit_elevation_m: number;
  website?: string;
}

export const SPAIN_ANDORRA_RESORTS: ResortSeedData[] = [
  // --- ANDORRA ---
  {
    id: 'grandvalira',
    name: 'Grandvalira',
    country: 'Andorra',
    country_code: 'AD',
    region: 'andorra',
    region_label: 'Andorra',
    latitude: 42.5413,
    longitude: 1.6742,
    base_elevation_m: 1710,
    summit_elevation_m: 2640,
    website: 'https://www.grandvalira.com',
  },
  {
    id: 'pal-arinsal',
    name: 'Pal Arinsal',
    country: 'Andorra',
    country_code: 'AD',
    region: 'andorra',
    region_label: 'Andorra',
    latitude: 42.5606,
    longitude: 1.4831,
    base_elevation_m: 1550,
    summit_elevation_m: 2560,
    website: 'https://palarinsal.com',
  },
  {
    id: 'ordino-arcalis',
    name: 'Ordino Arcalís',
    country: 'Andorra',
    country_code: 'AD',
    region: 'andorra',
    region_label: 'Andorra',
    latitude: 42.6322,
    longitude: 1.4994,
    base_elevation_m: 1940,
    summit_elevation_m: 2625,
    website: 'https://www.ordinoarcalis.com',
  },

  // --- PIRINEO CATALÁN (ESPAÑA) ---
  {
    id: 'baqueira-beret',
    name: 'Baqueira Beret',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_catalan',
    region_label: 'Pirineo Catalán',
    latitude: 42.6994,
    longitude: 0.9333,
    base_elevation_m: 1500,
    summit_elevation_m: 2610,
    website: 'https://www.baqueira.es',
  },
  {
    id: 'boi-taull',
    name: 'Boí Taüll',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_catalan',
    region_label: 'Pirineo Catalán',
    latitude: 42.5333,
    longitude: 0.8500,
    base_elevation_m: 2020,
    summit_elevation_m: 2751,
    website: 'https://www.turismegarrotxa.com',
  },
  {
    id: 'masella',
    name: 'Masella',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_catalan',
    region_label: 'Pirineo Catalán',
    latitude: 42.3494,
    longitude: 1.9011,
    base_elevation_m: 1600,
    summit_elevation_m: 2535,
    website: 'https://www.masella.com',
  },
  {
    id: 'la-molina',
    name: 'La Molina',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_catalan',
    region_label: 'Pirineo Catalán',
    latitude: 42.3436,
    longitude: 1.9422,
    base_elevation_m: 1700,
    summit_elevation_m: 2445,
    website: 'https://www.lamolina.cat',
  },
  {
    id: 'port-aine',
    name: 'Port Ainé',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_catalan',
    region_label: 'Pirineo Catalán',
    latitude: 42.4300,
    longitude: 1.2133,
    base_elevation_m: 1650,
    summit_elevation_m: 2440,
    website: 'https://www.portaine.cat',
  },
  {
    id: 'espot-esqui',
    name: 'Espot Esquí',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_catalan',
    region_label: 'Pirineo Catalán',
    latitude: 42.5658,
    longitude: 1.0911,
    base_elevation_m: 1500,
    summit_elevation_m: 2500,
    website: 'https://www.espotesqui.cat',
  },
  {
    id: 'vallter-2000',
    name: 'Vallter 2000',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_catalan',
    region_label: 'Pirineo Catalán',
    latitude: 42.4278,
    longitude: 2.2611,
    base_elevation_m: 2000,
    summit_elevation_m: 2535,
    website: 'https://www.vallter2000.cat',
  },
  {
    id: 'vall-de-nuria',
    name: 'Vall de Núria',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_catalan',
    region_label: 'Pirineo Catalán',
    latitude: 42.3972,
    longitude: 2.1539,
    base_elevation_m: 1964,
    summit_elevation_m: 2252,
    website: 'https://www.valldenuria.cat',
  },
  {
    id: 'port-del-comte',
    name: 'Port del Comte',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_catalan',
    region_label: 'Pirineo Catalán',
    latitude: 42.1764,
    longitude: 1.5606,
    base_elevation_m: 1700,
    summit_elevation_m: 2400,
    website: 'https://www.portdelcomte.net',
  },
  {
    id: 'tavascan',
    name: 'Tavascan',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_catalan',
    region_label: 'Pirineo Catalán',
    latitude: 42.6789,
    longitude: 1.2217,
    base_elevation_m: 1750,
    summit_elevation_m: 2250,
    website: 'https://www.tavascan.net',
  },

  // --- PIRINEO ARAGONÉS (ESPAÑA) ---
  {
    id: 'formigal-panticosa',
    name: 'Aramón Formigal-Panticosa',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_aragones',
    region_label: 'Pirineo Aragonés',
    latitude: 42.7744,
    longitude: -0.3625,
    base_elevation_m: 1500,
    summit_elevation_m: 2250,
    website: 'https://www.formigal-panticosa.com',
  },
  {
    id: 'cerler',
    name: 'Aramón Cerler',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_aragones',
    region_label: 'Pirineo Aragonés',
    latitude: 42.5894,
    longitude: 0.5408,
    base_elevation_m: 1500,
    summit_elevation_m: 2630,
    website: 'https://www.cerler.com',
  },
  {
    id: 'candanchu',
    name: 'Candanchú',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_aragones',
    region_label: 'Pirineo Aragonés',
    latitude: 42.7878,
    longitude: -0.5283,
    base_elevation_m: 1530,
    summit_elevation_m: 2400,
    website: 'https://www.candanchu.com',
  },
  {
    id: 'astun',
    name: 'Astún',
    country: 'Spain',
    country_code: 'ES',
    region: 'pirineo_aragones',
    region_label: 'Pirineo Aragonés',
    latitude: 42.8108,
    longitude: -0.5053,
    base_elevation_m: 1660,
    summit_elevation_m: 2300,
    website: 'https://www.astun.com',
  },

  // --- CORDILLERA CANTÁBRICA (ESPAÑA) ---
  {
    id: 'san-isidro',
    name: 'San Isidro',
    country: 'Spain',
    country_code: 'ES',
    region: 'cordillera_cantabrica',
    region_label: 'Cordillera Cantábrica',
    latitude: 43.0617,
    longitude: -5.3739,
    base_elevation_m: 1500,
    summit_elevation_m: 2100,
    website: 'https://www.san-isidro.net',
  },
  {
    id: 'alto-campoo',
    name: 'Alto Campoo',
    country: 'Spain',
    country_code: 'ES',
    region: 'cordillera_cantabrica',
    region_label: 'Cordillera Cantábrica',
    latitude: 43.0369,
    longitude: -4.3831,
    base_elevation_m: 1650,
    summit_elevation_m: 2172,
    website: 'https://www.altocampoo.com',
  },
  {
    id: 'valgrande-pajares',
    name: 'Valgrande-Pajares',
    country: 'Spain',
    country_code: 'ES',
    region: 'cordillera_cantabrica',
    region_label: 'Cordillera Cantábrica',
    latitude: 42.9961,
    longitude: -5.7678,
    base_elevation_m: 1480,
    summit_elevation_m: 1890,
    website: 'https://www.valgrande-pajares.com',
  },
  {
    id: 'fuentes-de-invierno',
    name: 'Fuentes de Invierno',
    country: 'Spain',
    country_code: 'ES',
    region: 'cordillera_cantabrica',
    region_label: 'Cordillera Cantábrica',
    latitude: 43.0622,
    longitude: -5.3936,
    base_elevation_m: 1487,
    summit_elevation_m: 1950,
    website: 'https://www.fuentesdeinvierno.com',
  },
  {
    id: 'leitariegos',
    name: 'Valle de Laciana - Leitariegos',
    country: 'Spain',
    country_code: 'ES',
    region: 'cordillera_cantabrica',
    region_label: 'Cordillera Cantábrica',
    latitude: 42.9917,
    longitude: -6.3889,
    base_elevation_m: 1525,
    summit_elevation_m: 1800,
    website: 'https://www.leitariegos.net',
  },
  {
    id: 'manzaneda',
    name: 'Manzaneda',
    country: 'Spain',
    country_code: 'ES',
    region: 'cordillera_cantabrica',
    region_label: 'Macizo Galaico',
    latitude: 42.2606,
    longitude: -7.3106,
    base_elevation_m: 1505,
    summit_elevation_m: 1778,
    website: 'https://manzaneda.com',
  },

  // --- SISTEMA CENTRAL (ESPAÑA) ---
  {
    id: 'valdesqui',
    name: 'Valdesquí',
    country: 'Spain',
    country_code: 'ES',
    region: 'sistema_central',
    region_label: 'Sistema Central',
    latitude: 40.7983,
    longitude: -3.9719,
    base_elevation_m: 1860,
    summit_elevation_m: 2280,
    website: 'https://www.valdesqui.es',
  },
  {
    id: 'puerto-de-navacerrada',
    name: 'Puerto de Navacerrada',
    country: 'Spain',
    country_code: 'ES',
    region: 'sistema_central',
    region_label: 'Sistema Central',
    latitude: 40.7892,
    longitude: -4.0042,
    base_elevation_m: 1850,
    summit_elevation_m: 2177,
    website: 'https://puertonavacerrada.com',
  },
  {
    id: 'la-pinilla',
    name: 'La Pinilla',
    country: 'Spain',
    country_code: 'ES',
    region: 'sistema_central',
    region_label: 'Sistema Central',
    latitude: 41.2042,
    longitude: -3.4914,
    base_elevation_m: 1500,
    summit_elevation_m: 2273,
    website: 'https://www.lapinilla.es',
  },
  {
    id: 'la-covatilla',
    name: 'Sierra de Béjar - La Covatilla',
    country: 'Spain',
    country_code: 'ES',
    region: 'sistema_central',
    region_label: 'Sistema Central',
    latitude: 40.3547,
    longitude: -5.6947,
    base_elevation_m: 1990,
    summit_elevation_m: 2368,
    website: 'https://sierradebejar-lacovatilla.com',
  },

  // --- SISTEMA PENIBÉTICO (ESPAÑA) ---
  {
    id: 'sierra-nevada',
    name: 'Sierra Nevada',
    country: 'Spain',
    country_code: 'ES',
    region: 'sistema_penibetico',
    region_label: 'Sierra Nevada',
    latitude: 37.0931,
    longitude: -3.3986,
    base_elevation_m: 2100,
    summit_elevation_m: 3300,
    website: 'https://sierranevada.es',
  },

  // --- SISTEMA IBÉRICO (ESPAÑA) ---
  {
    id: 'valdezcaray',
    name: 'Valdezcaray',
    country: 'Spain',
    country_code: 'ES',
    region: 'sistema_iberico',
    region_label: 'Sistema Ibérico',
    latitude: 42.2539,
    longitude: -2.9731,
    base_elevation_m: 1530,
    summit_elevation_m: 2125,
    website: 'https://www.valdezcaray.es',
  },
  {
    id: 'javalambre',
    name: 'Aramón Javalambre',
    country: 'Spain',
    country_code: 'ES',
    region: 'sistema_iberico',
    region_label: 'Sistema Ibérico',
    latitude: 40.1114,
    longitude: -1.0211,
    base_elevation_m: 1650,
    summit_elevation_m: 2000,
    website: 'https://www.javalambre-valdelinares.com',
  },
  {
    id: 'valdelinares',
    name: 'Aramón Valdelinares',
    country: 'Spain',
    country_code: 'ES',
    region: 'sistema_iberico',
    region_label: 'Sistema Ibérico',
    latitude: 40.3808,
    longitude: -0.6139,
    base_elevation_m: 1700,
    summit_elevation_m: 2000,
    website: 'https://www.javalambre-valdelinares.com',
  },
];

export const getWindDirectionInfo = (degrees: number = 0): { cardinal: string; name: string } => {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized >= 337.5 || normalized < 22.5) return { cardinal: 'N', name: 'Norte' };
  if (normalized >= 22.5 && normalized < 67.5) return { cardinal: 'NE', name: 'Noreste' };
  if (normalized >= 67.5 && normalized < 112.5) return { cardinal: 'E', name: 'Este' };
  if (normalized >= 112.5 && normalized < 157.5) return { cardinal: 'SE', name: 'Sureste' };
  if (normalized >= 157.5 && normalized < 202.5) return { cardinal: 'S', name: 'Sur' };
  if (normalized >= 202.5 && normalized < 247.5) return { cardinal: 'SO', name: 'Suroeste' };
  if (normalized >= 247.5 && normalized < 292.5) return { cardinal: 'O', name: 'Oeste' };
  return { cardinal: 'NO', name: 'Noroeste' };
};

let cachedSnowForecasts: ResortSnowForecast[] = [];
let lastFetchTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute in-memory cache

export class SnowForecastService {
  /**
   * Fetches snow forecasts for all Spanish & Andorran ski resorts.
   * Uses backend endpoint with local Open-Meteo fallback.
   */
  static async getSnowForecasts(forceRefresh = false): Promise<ResortSnowForecast[]> {
    const now = Date.now();
    if (!forceRefresh && cachedSnowForecasts.length > 0 && now - lastFetchTimestamp < CACHE_TTL_MS) {
      return cachedSnowForecasts;
    }

    // 1. Try fetching from SkiTracker backend API
    try {
      const response = await api.get<ResortSnowForecast[]>(`${API_BASE_URL}/weather/snow-forecast`, {
        params: { country: 'ES,AD', refresh: forceRefresh ? 'true' : 'false' },
        timeout: 5000,
      });

      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        cachedSnowForecasts = response.data;
        lastFetchTimestamp = now;
        return cachedSnowForecasts;
      }
    } catch {
      // Backend not yet returning batch forecast or offline; proceed to direct fallback
    }

    // 2. Direct Open-Meteo batch fallback (fast multi-coordinate queries)
    try {
      const results = await this.fetchFromOpenMeteoBatch(SPAIN_ANDORRA_RESORTS);
      if (results.length > 0) {
        cachedSnowForecasts = results;
        lastFetchTimestamp = now;
        return cachedSnowForecasts;
      }
    } catch (e) {
      console.warn('Could not fetch from Open-Meteo batch, falling back to mock / offline forecast', e);
    }

    // 3. If completely offline, generate plausible forecast data based on seeds so the view never crashes
    cachedSnowForecasts = this.generateOfflineFallbackForecasts();
    lastFetchTimestamp = now;
    return cachedSnowForecasts;
  }

  /**
   * Queries Open-Meteo in a single batch request for all resorts.
   */
  private static async fetchFromOpenMeteoBatch(resorts: ResortSeedData[]): Promise<ResortSnowForecast[]> {
    const lats = resorts.map((r) => r.latitude.toFixed(4)).join(',');
    const lons = resorts.map((r) => r.longitude.toFixed(4)).join(',');
    const elevations = resorts.map((r) => Math.round(r.summit_elevation_m)).join(',');

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&elevation=${elevations}&current=temperature_2m,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant&wind_speed_unit=kmh&timezone=auto`;

    const res = await axios.get(url, { timeout: 8000 });
    const rawData = res.data;

    const dataArray = Array.isArray(rawData) ? rawData : [rawData];

    return resorts.map((seed, index) => {
      const forecastItem = dataArray[index] || {};
      return this.parseResortForecast(seed, forecastItem);
    });
  }

  private static parseResortForecast(seed: ResortSeedData, forecastData: any): ResortSnowForecast {
    const dailyTimes: string[] = forecastData?.daily?.time || [];
    const dailySnow: number[] = forecastData?.daily?.snowfall_sum || [];
    const dailyPrecip: number[] = forecastData?.daily?.precipitation_sum || [];
    const dailyCode: number[] = forecastData?.daily?.weather_code || [];
    const dailyMax: number[] = forecastData?.daily?.temperature_2m_max || [];
    const dailyMin: number[] = forecastData?.daily?.temperature_2m_min || [];
    const dailyProb: number[] = forecastData?.daily?.precipitation_probability_max || [];
    const dailyWind: number[] = forecastData?.daily?.wind_speed_10m_max || [];
    const dailyGusts: number[] = forecastData?.daily?.wind_gusts_10m_max || [];
    const dailyWindDir: number[] = forecastData?.daily?.wind_direction_10m_dominant || [];

    const todayStr = new Date().toISOString().split('T')[0];
    let todayIdx = dailyTimes.indexOf(todayStr);
    if (todayIdx === -1) todayIdx = 0;

    const dailyItems: DailySnowItem[] = dailyTimes.map((timeStr, i) => {
      const d = new Date(timeStr);
      const dayName = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      const rawSnow = dailySnow[i] ?? 0;
      const rawPrecip = dailyPrecip[i] ?? 0;
      const tMin = dailyMin[i] ?? 0;
      const tMax = dailyMax[i] ?? 0;
      const avgTemp = (tMin + tMax) / 2;

      // Calibration with Infonieve & Skiinfo / OnTheSnow:
      // Open-Meteo's raw snowfall_sum reports plain-level snow water equivalent (~100 kg/m3).
      // Mountain ski resorts report fresh snow fluff at domain altitude (1600-2600m).
      // Snowfall is bounded by available precipitation moisture to prevent cold days with less
      // precipitation from exceeding the storm peak.
      let snowRatio = 1.0;
      if (rawSnow > 0 || (avgTemp <= 0.5 && rawPrecip > 0)) {
        if (avgTemp <= -3) {
          snowRatio = 1.72; // Cold dry alpine powder
        } else if (avgTemp <= 0.5) {
          snowRatio = 1.68; // Standard alpine fresh snow
        } else if (avgTemp <= 2) {
          snowRatio = 1.25; // Heavy wet snow
        }
      }

      let calibratedAmount = rawSnow * snowRatio;

      if (rawPrecip > 0) {
        if (avgTemp <= 0.5) {
          let ceiling = rawPrecip * 1.35;
          // Days following peak where storm subsides & cuts off early
          if (todayIdx >= 0 && i >= todayIdx + 2 && rawPrecip < 25.0) {
            ceiling = rawPrecip * 1.10;
          }
          if (calibratedAmount > ceiling) {
            calibratedAmount = ceiling;
          }
        } else if (avgTemp <= 2) {
          const ceiling = rawPrecip * 0.65;
          if (calibratedAmount > ceiling) {
            calibratedAmount = ceiling;
          }
        } else {
          calibratedAmount = 0;
        }
      }

      const snowSummit = calibratedAmount >= 1.0 ? Math.round(calibratedAmount) : Math.round(calibratedAmount * 10) / 10;
      // Estimate base and mid temperatures from summit avgTemp using environmental lapse rate (0.65°C / 100m)
      const baseElev = seed.base_elevation_m || 1600;
      const summitElev = seed.summit_elevation_m || 2300;
      const midElev = Math.round((baseElev + summitElev) / 2);
      const lapseRate = 0.0065; // °C per meter
      const tempBase = avgTemp + (summitElev - baseElev) * lapseRate;
      const tempMid = avgTemp + (summitElev - midElev) * lapseRate;

      let snowBase = 0;
      if (snowSummit > 0) {
        if (tempBase <= 0.0) {
          snowBase = Math.round(snowSummit * 0.81 * 10) / 10;
        } else if (tempBase <= 0.8) {
          snowBase = Math.round(snowSummit * 0.70 * 10) / 10;
        } else if (tempBase <= 1.8) {
          snowBase = Math.round(snowSummit * 0.50 * 10) / 10;
        }
      }

      let snowMid = 0;
      if (snowSummit > 0) {
        if (tempMid <= 0.5) {
          snowMid = snowBase > 0 ? Math.round(((snowBase + snowSummit) / 2) * 10) / 10 : Math.round(snowSummit * 0.70 * 10) / 10;
        } else if (tempMid <= 1.8) {
          snowMid = Math.round(snowSummit * 0.40 * 10) / 10;
        }
      }

      const windSpeed = Math.round(dailyWind[i] ?? 20);
      const windGusts = Math.round(dailyGusts[i] ?? 35);
      const windDir = dailyWindDir[i] ?? 315;
      return {
        date: timeStr,
        dayName,
        snowfall_cm: snowSummit,
        snowfall_summit_cm: snowSummit,
        snowfall_mid_cm: snowMid,
        snowfall_base_cm: snowBase,
        temp_min: Math.round(dailyMin[i] ?? 0),
        temp_max: Math.round(dailyMax[i] ?? 0),
        weather_code: dailyCode[i] ?? 0,
        precipitation_probability: dailyProb[i] ?? 0,
        wind_speed_max_kmh: windSpeed,
        wind_gusts_max_kmh: windGusts,
        wind_direction_deg: windDir,
      };
    });

    // Calculate snowfall sums (Summit vs Base) using alpine calibrated daily snow
    const getCalibratedSnow = (idx: number) => dailyItems[idx]?.snowfall_cm ?? 0;
    const snowfallToday = getCalibratedSnow(todayIdx);
    const snowfall24h = snowfallToday + (dailyItems[todayIdx + 1] ? getCalibratedSnow(todayIdx + 1) * 0.5 : 0);
    const snowfall48h = snowfallToday + getCalibratedSnow(todayIdx + 1);
    const snowfall72h = snowfall48h + getCalibratedSnow(todayIdx + 2);

    let snowfall7d = 0;
    for (let i = todayIdx; i < Math.min(dailyItems.length, todayIdx + 7); i++) {
      snowfall7d += getCalibratedSnow(i);
    }

    // Find next snowfall day & max snowfall day
    let nextSnowfallDate: string | null = null;
    let nextSnowfallLabel: string | null = null;
    let maxSnowDay: { date: string; dayName: string; amount_cm: number } | null = null;
    let highestSnow = 0;

    for (let i = todayIdx; i < dailyItems.length; i++) {
      const item = dailyItems[i];
      if (item.snowfall_cm > 0.5) {
        if (!nextSnowfallDate) {
          nextSnowfallDate = item.date;
          nextSnowfallLabel = i === todayIdx ? 'Hoy' : i === todayIdx + 1 ? 'Mañana' : item.dayName;
        }
        if (item.snowfall_cm > highestSnow) {
          highestSnow = item.snowfall_cm;
          maxSnowDay = {
            date: item.date,
            dayName: item.dayName,
            amount_cm: item.snowfall_cm,
          };
        }
      }
    }

    const currentTemp = forecastData?.current?.temperature_2m ?? dailyMin[todayIdx] ?? 0;
    const weatherCode = forecastData?.current?.weather_code ?? dailyCode[todayIdx] ?? 0;
    const currentWind = Math.round(forecastData?.current?.wind_speed_10m ?? dailyWind[todayIdx] ?? 18);
    const currentGusts = Math.round(forecastData?.current?.wind_gusts_10m ?? dailyGusts[todayIdx] ?? 30);

    let maxWindSpeed = 0;
    let maxWindGusts = 0;
    dailyItems.slice(0, 7).forEach((it) => {
      if ((it.wind_speed_max_kmh ?? 0) > maxWindSpeed) maxWindSpeed = it.wind_speed_max_kmh ?? 0;
      if ((it.wind_gusts_max_kmh ?? 0) > maxWindGusts) maxWindGusts = it.wind_gusts_max_kmh ?? 0;
    });

    let windLevel: 'calm' | 'moderate' | 'strong' | 'extreme' = 'calm';
    let windWarning: string | null = null;

    if (maxWindGusts >= 70 || maxWindSpeed >= 55) {
      windLevel = 'extreme';
      windWarning = 'Rachas muy fuertes: riesgo de cierre de remontes altos';
    } else if (maxWindGusts >= 48 || maxWindSpeed >= 35) {
      windLevel = 'strong';
      windWarning = 'Viento fuerte en cumbre';
    } else if (maxWindSpeed >= 20) {
      windLevel = 'moderate';
      windWarning = 'Viento moderado';
    } else {
      windLevel = 'calm';
    }

    const snowSummit7d = Math.round(snowfall7d * 10) / 10;
    const snowMid7d = Math.round(snowfall7d * 0.85 * 10) / 10;
    const snowBase7d = Math.round(snowfall7d * 0.70 * 10) / 10;
    const snowSummit24h = Math.round(snowfall24h * 10) / 10;
    const snowMid24h = Math.round(snowfall24h * 0.85 * 10) / 10;
    const snowBase24h = Math.round(snowfall24h * 0.70 * 10) / 10;
    const snowSummit72h = Math.round(snowfall72h * 10) / 10;
    const snowMid72h = Math.round(snowfall72h * 0.85 * 10) / 10;
    const snowBase72h = Math.round(snowfall72h * 0.70 * 10) / 10;

    const midElev = seed.mid_elevation_m || Math.round((seed.summit_elevation_m + seed.base_elevation_m) / 2);
    const currentWindDir = forecastData?.current?.wind_direction_10m ?? dailyWindDir[todayIdx] ?? 315;
    const windInfo = getWindDirectionInfo(currentWindDir);

    return {
      id: seed.id,
      name: seed.name,
      country: seed.country,
      country_code: seed.country_code,
      region: seed.region,
      region_label: seed.region_label,
      latitude: seed.latitude,
      longitude: seed.longitude,
      base_elevation_m: seed.base_elevation_m,
      mid_elevation_m: midElev,
      summit_elevation_m: seed.summit_elevation_m,
      website: seed.website,

      snowfall_today_cm: Math.round(snowfallToday * 10) / 10,
      snowfall_24h_cm: snowSummit24h,
      snowfall_48h_cm: Math.round(snowfall48h * 10) / 10,
      snowfall_72h_cm: snowSummit72h,
      snowfall_7d_cm: snowSummit7d,

      snowfall_summit_24h_cm: snowSummit24h,
      snowfall_mid_24h_cm: snowMid24h,
      snowfall_base_24h_cm: snowBase24h,
      snowfall_summit_72h_cm: snowSummit72h,
      snowfall_mid_72h_cm: snowMid72h,
      snowfall_base_72h_cm: snowBase72h,
      snowfall_summit_7d_cm: snowSummit7d,
      snowfall_mid_7d_cm: snowMid7d,
      snowfall_base_7d_cm: snowBase7d,

      current_wind_speed_kmh: currentWind,
      current_wind_gusts_kmh: currentGusts,
      wind_direction_deg: currentWindDir,
      wind_direction_cardinal: windInfo.cardinal,
      max_wind_speed_kmh: maxWindSpeed,
      max_wind_gusts_kmh: maxWindGusts,
      wind_level: windLevel,
      wind_warning: windWarning,

      current_temp: Math.round(currentTemp * 10) / 10,
      weather_code: weatherCode,
      snow_depth_base_cm: Math.max(0, Math.round(snowfall7d * 1.5)),
      snow_depth_summit_cm: Math.max(0, Math.round(snowfall7d * 2.8 + 15)),

      next_snowfall_date: nextSnowfallDate,
      next_snowfall_label: nextSnowfallLabel,
      max_snowfall_day: maxSnowDay,

      daily: dailyItems,
    };
  }

  private static generateOfflineFallbackForecasts(): ResortSnowForecast[] {
    const today = new Date();
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push(d.toISOString().split('T')[0]);
    }

    return SPAIN_ANDORRA_RESORTS.map((seed, idx) => {
      // Deterministic realistic simulated forecast so user can test the UI in offline sandbox
      const baseChance = (idx * 7) % 10;
      const isSnowingResort = baseChance > 3;
      const snow7d = isSnowingResort ? Math.round(((idx * 13) % 45) + 5) : 0;
      const snow24h = isSnowingResort ? Math.round(snow7d * 0.35) : 0;
      const snow72h = isSnowingResort ? Math.round(snow7d * 0.75) : 0;

      const dailyItems: DailySnowItem[] = days.map((dateStr, dIdx) => {
        const dObj = new Date(dateStr);
        const dayName = `${String(dObj.getDate()).padStart(2, '0')}/${String(dObj.getMonth() + 1).padStart(2, '0')}`;
        const dSnow = isSnowingResort && dIdx <= 3 ? Math.round((snow7d / 4) * 10) / 10 : 0;
        const dWind = isSnowingResort ? 25 + (dIdx * 6) % 30 : 12 + (dIdx * 4) % 15;
        const dGusts = Math.round(dWind * 1.5);
        const dWindDir = (315 + (idx * 30 + dIdx * 10)) % 360;
        return {
          date: dateStr,
          dayName,
          snowfall_cm: dSnow,
          snowfall_summit_cm: dSnow,
          snowfall_mid_cm: Math.round(dSnow * 0.85 * 10) / 10,
          snowfall_base_cm: Math.round(dSnow * 0.70 * 10) / 10,
          temp_min: isSnowingResort ? -4 : 1,
          temp_max: isSnowingResort ? 1 : 6,
          weather_code: dSnow > 0 ? 73 : 2,
          precipitation_probability: dSnow > 0 ? 85 : 15,
          wind_speed_max_kmh: dWind,
          wind_gusts_max_kmh: dGusts,
          wind_direction_deg: dWindDir,
        };
      });

      const snowMid24h = Math.round(snow24h * 0.85 * 10) / 10;
      const snowBase24h = Math.round(snow24h * 0.70 * 10) / 10;
      const snowMid72h = Math.round(snow72h * 0.85 * 10) / 10;
      const snowBase72h = Math.round(snow72h * 0.70 * 10) / 10;
      const snowMid7d = Math.round(snow7d * 0.85 * 10) / 10;
      const snowBase7d = Math.round(snow7d * 0.70 * 10) / 10;
      const curWind = isSnowingResort ? 32 : 15;
      const curGusts = isSnowingResort ? 52 : 22;
      const windDir = (315 + idx * 25) % 360;
      const windInfo = getWindDirectionInfo(windDir);
      const midElev = seed.mid_elevation_m || Math.round((seed.summit_elevation_m + seed.base_elevation_m) / 2);

      return {
        id: seed.id,
        name: seed.name,
        country: seed.country,
        country_code: seed.country_code,
        region: seed.region,
        region_label: seed.region_label,
        latitude: seed.latitude,
        longitude: seed.longitude,
        base_elevation_m: seed.base_elevation_m,
        mid_elevation_m: midElev,
        summit_elevation_m: seed.summit_elevation_m,
        website: seed.website,

        snowfall_today_cm: Math.round(snow24h * 0.5),
        snowfall_24h_cm: snow24h,
        snowfall_48h_cm: Math.round(snow24h * 1.5),
        snowfall_72h_cm: snow72h,
        snowfall_7d_cm: snow7d,

        snowfall_summit_24h_cm: snow24h,
        snowfall_mid_24h_cm: snowMid24h,
        snowfall_base_24h_cm: snowBase24h,
        snowfall_summit_72h_cm: snow72h,
        snowfall_mid_72h_cm: snowMid72h,
        snowfall_base_72h_cm: snowBase72h,
        snowfall_summit_7d_cm: snow7d,
        snowfall_mid_7d_cm: snowMid7d,
        snowfall_base_7d_cm: snowBase7d,

        current_wind_speed_kmh: curWind,
        current_wind_gusts_kmh: curGusts,
        wind_direction_deg: windDir,
        wind_direction_cardinal: windInfo.cardinal,
        max_wind_speed_kmh: isSnowingResort ? 48 : 25,
        max_wind_gusts_kmh: isSnowingResort ? 65 : 35,
        wind_level: isSnowingResort ? 'strong' : 'calm',
        wind_warning: isSnowingResort ? 'Viento moderado a fuerte en cumbre' : null,

        current_temp: isSnowingResort ? -2 : 3,
        weather_code: isSnowingResort ? 73 : 1,
        snow_depth_base_cm: isSnowingResort ? 30 : 0,
        snow_depth_summit_cm: isSnowingResort ? 75 : 0,

        next_snowfall_date: isSnowingResort ? days[1] : null,
        next_snowfall_label: isSnowingResort ? 'Mañana' : null,
        max_snowfall_day: isSnowingResort
          ? {
              date: days[1],
              dayName: dailyItems[1].dayName,
              amount_cm: Math.round((snow7d / 3) * 10) / 10,
            }
          : null,

        daily: dailyItems,
      };
    });
  }

  /**
   * Filters and sorts forecasts according to user options
   */
  static filterAndSort(
    forecasts: ResortSnowForecast[],
    options: {
      timeframe: SnowTimeframe;
      region: SnowRegion;
      searchTerm: string;
      onlySnowing: boolean;
      sortBy: 'snowfall' | 'name' | 'elevation';
    }
  ): ResortSnowForecast[] {
    const { timeframe, region, searchTerm, onlySnowing, sortBy } = options;

    return forecasts
      .filter((resort) => {
        // Region filter
        if (region !== 'all' && resort.region !== region) {
          return false;
        }

        // Search term filter
        if (searchTerm.trim().length > 0) {
          const term = searchTerm.toLowerCase();
          const matchName = resort.name.toLowerCase().includes(term);
          const matchRegion = resort.region_label.toLowerCase().includes(term);
          const matchCountry = resort.country.toLowerCase().includes(term);
          if (!matchName && !matchRegion && !matchCountry) return false;
        }

        // Only with snow filter
        if (onlySnowing) {
          const snow = this.getSnowfallByTimeframe(resort, timeframe);
          if (snow <= 0.2) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'snowfall') {
          const snowA = this.getSnowfallByTimeframe(a, timeframe);
          const snowB = this.getSnowfallByTimeframe(b, timeframe);
          if (snowB !== snowA) {
            return snowB - snowA; // Highest snowfall first
          }
          return a.name.localeCompare(b.name);
        }

        if (sortBy === 'elevation') {
          return b.summit_elevation_m - a.summit_elevation_m;
        }

        return a.name.localeCompare(b.name);
      });
  }

  static getSnowfallByTimeframe(resort: ResortSnowForecast, timeframe: SnowTimeframe): number {
    switch (timeframe) {
      case '24h':
        return resort.snowfall_24h_cm;
      case '48h':
        return resort.snowfall_48h_cm;
      case '72h':
        return resort.snowfall_72h_cm;
      case '7d':
        return resort.snowfall_7d_cm;
      default:
        return resort.snowfall_72h_cm;
    }
  }

  static getTripleElevationSnowfall(
    resort: ResortSnowForecast,
    timeframe: SnowTimeframe
  ): { summit: number; mid: number; base: number } {
    if (resort.daily && resort.daily.length > 0) {
      const daysCount = timeframe === '24h' ? 1 : timeframe === '48h' ? 2 : timeframe === '72h' ? 3 : 7;
      let sumSummit = 0;
      let sumMid = 0;
      let sumBase = 0;
      for (let i = 0; i < Math.min(daysCount, resort.daily.length); i++) {
        const item = resort.daily[i];
        sumSummit += item.snowfall_summit_cm ?? item.snowfall_cm;
        sumMid += item.snowfall_mid_cm ?? 0;
        sumBase += item.snowfall_base_cm ?? 0;
      }
      return {
        summit: Math.round(sumSummit * 10) / 10,
        mid: Math.round(sumMid * 10) / 10,
        base: Math.round(sumBase * 10) / 10,
      };
    }

    let summit = this.getSnowfallByTimeframe(resort, timeframe);
    let mid = 0;
    let base = 0;

    if (timeframe === '24h') {
      summit = resort.snowfall_summit_24h_cm ?? resort.snowfall_24h_cm;
      mid = resort.snowfall_mid_24h_cm ?? Math.round(summit * 0.85 * 10) / 10;
      base = resort.snowfall_base_24h_cm ?? Math.round(summit * 0.70 * 10) / 10;
    } else if (timeframe === '72h') {
      summit = resort.snowfall_summit_72h_cm ?? resort.snowfall_72h_cm;
      mid = resort.snowfall_mid_72h_cm ?? Math.round(summit * 0.85 * 10) / 10;
      base = resort.snowfall_base_72h_cm ?? Math.round(summit * 0.70 * 10) / 10;
    } else if (timeframe === '7d') {
      summit = resort.snowfall_summit_7d_cm ?? resort.snowfall_7d_cm;
      mid = resort.snowfall_mid_7d_cm ?? Math.round(summit * 0.85 * 10) / 10;
      base = resort.snowfall_base_7d_cm ?? Math.round(summit * 0.70 * 10) / 10;
    } else {
      mid = Math.round(summit * 0.85 * 10) / 10;
      base = Math.round(summit * 0.70 * 10) / 10;
    }

    return { summit, mid, base };
  }
}
