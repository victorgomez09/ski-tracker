export type WeatherModelId = 'best_match' | 'ecmwf_ifs025' | 'icon_eu' | 'gfs_seamless';

export interface WeatherModelInfo {
  id: WeatherModelId;
  name: string;
  shortName: string;
  provider: string;
  flag: string;
  tag: string;
  description: string;
}

export interface WeatherModelComparison {
  model_id: WeatherModelId | string;
  name: string;
  provider: string;
  snowfall_7d_cm: number;
  daily_snow_cm: number[];
}

export const WEATHER_MODELS: Record<WeatherModelId, WeatherModelInfo> = {
  ecmwf_ifs025: {
    id: 'ecmwf_ifs025',
    name: 'Europeo (ECMWF)',
    shortName: 'ECMWF',
    provider: 'Infonieve / Snow-Forecast',
    flag: '🇪🇺',
    tag: 'Referencia',
    description: 'IFS 0.25° · Modelo líder europeo para orografía y cota alpina',
  },
  best_match: {
    id: 'best_match',
    name: 'Consenso (Auto)',
    shortName: 'Consenso',
    provider: 'Open-Meteo',
    flag: '⚡',
    tag: 'Automático',
    description: 'Consenso que combina los mejores modelos locales por cuadrícula',
  },
  icon_eu: {
    id: 'icon_eu',
    name: 'Alemán (ICON)',
    shortName: 'ICON-EU',
    provider: 'DWD Alemania',
    flag: '🇩🇪',
    tag: 'Alta Resolución',
    description: 'Modelo de 7 km del Servicio Meteorológico Alemán (DWD)',
  },
  gfs_seamless: {
    id: 'gfs_seamless',
    name: 'Americano (GFS)',
    shortName: 'GFS',
    provider: 'NOAA Estados Unidos',
    flag: '🇺🇸',
    tag: 'Global',
    description: 'Modelo global de la NOAA para tendencias a medio y largo plazo',
  },
};

export interface AvalancheReport {
  danger_level: number; // 1 to 5
  danger_level_title: string;
  danger_color: string;
  critical_elevation_m: number;
  dangerous_aspects: string[];
  summary: string;
  wind_risk: string;
  fresh_snow_risk: string;
  confidence: string;
}

export interface SnowReport {
  resort_id?: string;
  resort_name?: string;
  base_elevation_m: number;
  mid_elevation_m?: number;
  summit_elevation_m: number;
  snow_depth_base_cm: number;
  snow_depth_mid_cm?: number;
  snow_depth_summit_cm: number;
  snowfall_today_base_cm?: number;
  snowfall_today_mid_cm?: number;
  snowfall_today_summit_cm?: number;
  snow_condition: 'powder' | 'hard_packed' | 'spring' | 'wet' | 'packed_powder' | 'no_snow' | string;
  snow_condition_label: string;
  last_snowfall_date: string | null;
  last_snowfall_amount_cm: number;
  fresh_snow_24h_cm: number;
  fresh_snow_48h_cm: number;
  forecast_snow_7d_cm: number;
  freezing_level_m: number;
  snow_line_m?: number;
  avalanche_report?: AvalancheReport;
  data_source: string;
  generated_at: string;
}

export interface WeatherForecast {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  current_units: {
    interval: string;
    is_day: string;
    precipitation: string;
    rain?: string;
    showers?: string;
    snowfall?: string;
    snow_depth?: string;
    temperature_2m: string;
    time: string;
    weather_code: string;
    wind_direction_10m: string;
    wind_speed_10m: string;
    apparent_temperature: string;
    wind_gusts_10m: string;
    relative_humidity_2m: string;
    surface_pressure: string;
    cloud_cover: string;
    visibility: string;
  };
  current: {
    interval: number;
    is_day: number;
    precipitation: number;
    rain?: number;
    showers?: number;
    snowfall?: number;
    snow_depth?: number;
    temperature_2m: number;
    time: string;
    weather_code: number;
    wind_direction_10m: number;
    wind_speed_10m: number;
    apparent_temperature: number;
    wind_gusts_10m: number;
    relative_humidity_2m: number;
    surface_pressure: number;
    cloud_cover: number;
    visibility: number;
  };
  hourly_units: {
    freezing_level_height: string;
    snow_depth: string;
    snowfall: string;
    temperature_2m: string;
    time: string;
    apparent_temperature: string;
    precipitation_probability: string;
    precipitation: string;
    rain: string;
    showers: string;
    cloud_cover: string;
    visibility: string;
    wind_speed_10m: string;
    wind_gusts_10m: string;
    wind_direction_10m?: string;
    weather_code?: string;
  };
  hourly: {
    freezing_level_height: number[];
    snow_depth: number[];
    snowfall: number[];
    temperature_2m: number[];
    time: string[];
    apparent_temperature: number[];
    precipitation_probability: number[];
    precipitation: number[];
    rain: number[];
    showers: number[];
    cloud_cover: number[];
    visibility: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    wind_direction_10m?: number[];
    weather_code?: number[];
  };
  daily_units?: {
    time: string;
    weather_code: string;
    temperature_2m_max: string;
    temperature_2m_min: string;
    sunrise: string;
    sunset: string;
    precipitation_sum: string;
    snowfall_sum: string;
    precipitation_probability_max: string;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
    precipitation_sum: number[];
    snowfall_sum: number[];
    precipitation_probability_max: number[];
  };
  forecast_model?: WeatherModelId | string;
  model_comparisons?: WeatherModelComparison[];
  snow_report?: SnowReport;
}
