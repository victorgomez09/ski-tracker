export type SnowRegion =
  | 'all'
  | 'andorra'
  | 'pirineo_aragones'
  | 'pirineo_catalan'
  | 'cordillera_cantabrica'
  | 'sistema_central'
  | 'sistema_penibetico'
  | 'sistema_iberico';

export type SnowTimeframe = '24h' | '48h' | '72h' | '7d';

export interface DailySnowItem {
  date: string;
  dayName: string;
  snowfall_cm: number;
  snowfall_summit_cm?: number;
  snowfall_mid_cm?: number;
  snowfall_base_cm?: number;
  temp_min: number;
  temp_max: number;
  weather_code: number;
  precipitation_probability: number;
  wind_speed_max_kmh?: number;
  wind_gusts_max_kmh?: number;
  wind_direction_deg?: number;
}

export interface ResortSnowForecast {
  id: string;
  name: string;
  country: 'Spain' | 'Andorra' | string;
  country_code: 'ES' | 'AD';
  region: SnowRegion;
  region_label: string;
  latitude: number;
  longitude: number;
  base_elevation_m: number;
  mid_elevation_m?: number;
  summit_elevation_m: number;
  website?: string;

  // Snowfall metrics in cm
  snowfall_today_cm: number;
  snowfall_24h_cm: number;
  snowfall_48h_cm: number;
  snowfall_72h_cm: number;
  snowfall_7d_cm: number;

  // Triple Elevation Snowfall (Summit / Mid / Base)
  snowfall_summit_24h_cm?: number;
  snowfall_mid_24h_cm?: number;
  snowfall_base_24h_cm?: number;
  snowfall_summit_72h_cm?: number;
  snowfall_mid_72h_cm?: number;
  snowfall_base_72h_cm?: number;
  snowfall_summit_7d_cm?: number;
  snowfall_mid_7d_cm?: number;
  snowfall_base_7d_cm?: number;

  // Wind metrics & direction
  current_wind_speed_kmh?: number;
  current_wind_gusts_kmh?: number;
  wind_direction_deg?: number;
  wind_direction_cardinal?: string;
  max_wind_speed_kmh?: number;
  max_wind_gusts_kmh?: number;
  wind_level?: 'calm' | 'moderate' | 'strong' | 'extreme';
  wind_warning?: string | null;

  current_temp?: number;
  weather_code?: number;
  freezing_level_m?: number;
  snow_depth_base_cm?: number;
  snow_depth_summit_cm?: number;

  // Forecast indicators
  next_snowfall_date: string | null;
  next_snowfall_label: string | null;
  max_snowfall_day: {
    date: string;
    dayName: string;
    amount_cm: number;
  } | null;

  daily: DailySnowItem[];
}

export interface SnowForecastSummary {
  resorts_with_snow_count: number;
  total_resorts: number;
  top_snowfall_resort: ResortSnowForecast | null;
  max_snowfall_cm: number;
  timeframe: SnowTimeframe;
}
