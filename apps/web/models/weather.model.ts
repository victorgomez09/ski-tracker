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
    temperature_2m: string;
    time: string;
    weather_code: string;
    wind_direction_10m: string;
    wind_speed_10m: string;
    apparent_temperature: string;
  };
  current: {
    interval: number;
    is_day: number;
    precipitation: number;
    temperature_2m: number;
    time: string;
    weather_code: number;
    wind_direction_10m: number;
    wind_speed_10m: number;
    apparent_temperature: number;
  };
  hourly_units: {
    freezing_level_height: string;
    snow_depth: string;
    snowfall: string;
    temperature_2m: string;
    time: string;
  };
  hourly: {
    freezing_level_height: number[];
    snow_depth: number[];
    snowfall: number[];
    temperature_2m: number[];
    time: string[];
  };
}