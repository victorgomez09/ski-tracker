import { Sun, Cloud, CloudRain, Snowflake, Thermometer, Wind } from 'lucide-react';
import { WeatherForecast } from 'models/weather.model';
import React from 'react';

interface WeatherWidgetProps {
  data: WeatherForecast;
}

export const WeatherForecastDetails: React.FC<WeatherWidgetProps> = ({ data }) => {
  const current = data.current;
  const units = data.current_units;

  const getWeatherIconAndLabel = (code: number) => {
    switch (code) {
      case 0:
        return { label: 'Clear', icon: <Sun className="w-5 h-5 text-warning" /> };
      case 1:
      case 2:
      case 3:
        return { label: 'Cloudy', icon: <Cloud className="w-5 h-5 text-info" /> };
      case 51:
      case 53:
      case 55:
      case 61:
      case 63:
        return { label: 'Rain', icon: <CloudRain className="w-5 h-5 text-primary" /> };
      case 71:
      case 73:
      case 75:
      case 77:
        return { label: 'Snow', icon: <Snowflake className="w-5 h-5 text-accent" /> };
      default:
        return { label: 'Stable conditions', icon: <Cloud className="w-5 h-5 text-base-content/60" /> };
    }
  };

  const weatherState = getWeatherIconAndLabel(current.weather_code);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/50">Weather Forecast</h3>
        <span className="text-[10px] text-base-content/50">
          {new Date(current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Weather Main Card */}
      <div className="card bg-base-200/60 border border-base-300/80 p-4 space-y-4 hover:border-primary/20 transition-all">
        {/* Current State Banner */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-base-300/60 border border-base-300">
              {weatherState.icon}
            </div>
            <div>
              <div className="text-[10px] text-base-content/60 font-semibold uppercase">Current State</div>
              <div className="text-sm font-extrabold text-base-content">{weatherState.label}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold tracking-tight text-base-content">{current.temperature_2m}</span>
              <span className="text-xs font-semibold text-base-content/60">{units.temperature_2m}</span>
            </div>
          </div>
        </div>

        {/* Metrics Grid inside Weather */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 pt-2 border-t border-base-300/60">
          
          <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
            <Thermometer className="w-4 h-4 text-error shrink-0" />
            <div>
              <div className="text-[10px] text-base-content/60 font-semibold uppercase">Feels Like</div>
              <div className="text-sm font-extrabold text-base-content">{current.apparent_temperature} {units.temperature_2m}</div>
            </div>
          </div>

          <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
            <Wind className="w-4 h-4 text-info shrink-0" />
            <div>
              <div className="text-[10px] text-base-content/60 font-semibold uppercase">Wind</div>
              <div className="text-sm font-extrabold text-base-content">{current.wind_speed_10m} <span className="text-[10px] font-normal">{units.wind_speed_10m}</span></div>
            </div>
          </div>

          <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5 col-span-2 lg:col-span-1">
            <CloudRain className="w-4 h-4 text-primary shrink-0" />
            <div>
              <div className="text-[10px] text-base-content/60 font-semibold uppercase">Precipitation</div>
              <div className="text-sm font-extrabold text-base-content">{current.precipitation} <span className="text-[10px] font-normal">{units.precipitation}</span></div>
            </div>
          </div>

        </div>

        {/* Hourly Forecast Carousel/List */}
        {data.hourly && data.hourly.time && (
          <div className="pt-2">
            <div className="text-[10px] text-base-content/60 font-semibold uppercase mb-2">Next Hours</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {data.hourly.time.slice(0, 6).map((timeStr, index) => {
                const hourFormatted = new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const temp = data.hourly.temperature_2m[index];
                const freezingHeight = data.hourly.freezing_level_height[index];

                return (
                  <div key={index} className="shrink-0 bg-base-200/40 border border-base-300/60 rounded-xl p-2 text-center w-20">
                    <p className="text-[10px] text-base-content/50 mb-0.5">{hourFormatted}</p>
                    <p className="text-xs font-bold text-base-content mb-1">{temp}{units.temperature_2m}</p>
                    <div className="text-[9px] text-primary bg-primary/10 rounded py-0.5 px-1 font-medium">
                      Freezing Level: {freezingHeight}m
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-[10px] text-base-content/60 font-semibold uppercase mb-2">If you want more info, visit: <a href="https://www.snow-forecast.com/" className="text-primary underline" target="_blank" rel="noopener noreferrer">snow-forecast.com</a></p>

      </div>
    </div>
  );
};