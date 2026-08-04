import { Sun, Cloud, CloudRain, Snowflake, Thermometer, Wind, Compass, Layers, Mountain, Droplets, Flame, Gauge, Sunrise, Sunset, Umbrella, Activity, Eye } from 'lucide-react';
import { WeatherForecast } from 'models/weather.model';
import React, { useState } from 'react';

interface WeatherWidgetProps {
    data: WeatherForecast;
}

export const WeatherForecastDetails: React.FC<WeatherWidgetProps> = ({ data }) => {
    const [activeTab, setActiveTab] = useState<'current' | 'hourly' | 'daily'>('current');

    const current = data.current;
    const currentUnits = data.current_units;
    const hourlyUnits = data.hourly_units;

    const formatVisibility = (meters: number) => {
        if (!meters && meters !== 0) return 'N/A';
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km`;
        }
        return `${meters} m`;
    };

    const getWeatherInfo = (code: number) => {
        switch (code) {
            case 0:
                return { label: 'Clear Sky', icon: <Sun className="w-6 h-6 text-warning" /> };
            case 1:
            case 2:
            case 3:
                return { label: 'Partly Cloudy', icon: <Cloud className="w-6 h-6 text-info" /> };
            case 45:
            case 48:
                return { label: 'Foggy', icon: <Cloud className="w-6 h-6 text-base-content/50" /> };
            case 51:
            case 53:
            case 55:
            case 61:
            case 63:
                return { label: 'Rain / Showers', icon: <CloudRain className="w-6 h-6 text-primary" /> };
            case 71:
            case 73:
            case 75:
            case 77:
                return { label: 'Snowfall', icon: <Snowflake className="w-6 h-6 text-accent" /> };
            case 95:
            case 96:
            case 99:
                return { label: 'Thunderstorm', icon: <CloudRain className="w-6 h-6 text-error" /> };
            default:
                return { label: 'Variable', icon: <Cloud className="w-6 h-6 text-base-content/60" /> };
        }
    };

    const currentWeatherInfo = getWeatherInfo(current.weather_code);

    return (
        <div className="space-y-3">
            {/* Section Header & Internal Navigation Tabs */}
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/50">Detailed Weather</h3>

                <div className="tabs tabs-boxed bg-base-200/80 p-0.5 text-xs">
                    <button
                        type="button"
                        className={`tab tab-xs h-6 rounded-lg font-medium transition-all ${activeTab === 'current' ? 'tab-active bg-primary text-primary-content' : 'text-base-content/70'}`}
                        onClick={() => setActiveTab('current')}
                    >
                        Current
                    </button>
                    {data.hourly && (
                        <button
                            type="button"
                            className={`tab tab-xs h-6 rounded-lg font-medium transition-all ${activeTab === 'hourly' ? 'tab-active bg-primary text-primary-content' : 'text-base-content/70'}`}
                            onClick={() => setActiveTab('hourly')}
                        >
                            Hourly
                        </button>
                    )}
                    {data.daily && (
                        <button
                            type="button"
                            className={`tab tab-xs h-6 rounded-lg font-medium transition-all ${activeTab === 'daily' ? 'tab-active bg-primary text-primary-content' : 'text-base-content/70'}`}
                            onClick={() => setActiveTab('daily')}
                        >
                            Daily
                        </button>
                    )}
                </div>
            </div>

            {/* CONTENT: CURRENT TAB */}
            {activeTab === 'current' && (
                <div className="card bg-base-200/60 border border-base-300/80 p-4 space-y-4 hover:border-primary/20 transition-all">
                    <div className="card-body p-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-xl bg-base-300/60 border border-base-300 shrink-0">
                                    {currentWeatherInfo.icon}
                                </div>
                                <div>
                                    <div className="text-[10px] text-base-content/60 font-semibold uppercase">General Condition</div>
                                    <div className="text-base font-extrabold text-base-content">{currentWeatherInfo.label}</div>
                                    <div className="text-[11px] text-base-content/50">
                                        Updated: {new Date(current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="flex items-baseline gap-1">
                                    <span className="text-3xl font-extrabold tracking-tight text-base-content">{current.temperature_2m}</span>
                                    <span className="text-sm font-bold text-base-content/60">{currentUnits.temperature_2m}</span>
                                </div>
                                <span className="text-[11px] text-base-content/60 font-medium">
                                    Feels like: {current.apparent_temperature}{currentUnits.temperature_2m}
                                </span>
                            </div>
                        </div>

                        {/* Extended Metrics Grid with Visibility */}
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-base-300/60">

                            <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                <Wind className="w-4 h-4 text-info shrink-0" />
                                <div>
                                    <div className="text-[10px] text-base-content/60 font-semibold uppercase">Wind Speed</div>
                                    <div className="text-sm font-extrabold text-base-content">
                                        {current.wind_speed_10m} <span className="text-[10px] font-normal">{currentUnits.wind_speed_10m}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                <Flame className="w-4 h-4 text-warning shrink-0" />
                                <div>
                                    <div className="text-[10px] text-base-content/60 font-semibold uppercase">Wind Gusts</div>
                                    <div className="text-sm font-extrabold text-base-content">
                                        {current.wind_gusts_10m} <span className="text-[10px] font-normal">{currentUnits.wind_gusts_10m}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                <Compass className="w-4 h-4 text-secondary shrink-0" />
                                <div>
                                    <div className="text-[10px] text-base-content/60 font-semibold uppercase">Wind Dir</div>
                                    <div className="text-sm font-extrabold text-base-content">
                                        {current.wind_direction_10m}{currentUnits.wind_direction_10m}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                <Eye className="w-4 h-4 text-accent shrink-0" />
                                <div>
                                    <div className="text-[10px] text-base-content/60 font-semibold uppercase">Visibility</div>
                                    <div className="text-sm font-extrabold text-base-content">
                                        {formatVisibility(current.visibility)}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                <Droplets className="w-4 h-4 text-primary shrink-0" />
                                <div>
                                    <div className="text-[10px] text-base-content/60 font-semibold uppercase">Humidity</div>
                                    <div className="text-sm font-extrabold text-base-content">
                                        {current.relative_humidity_2m}{currentUnits.relative_humidity_2m}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center gap-2.5">
                                <Gauge className="w-4 h-4 text-success shrink-0" />
                                <div>
                                    <div className="text-[10px] text-base-content/60 font-semibold uppercase">Pressure</div>
                                    <div className="text-sm font-extrabold text-base-content">
                                        {current.surface_pressure} <span className="text-[10px] font-normal">{currentUnits.surface_pressure}</span>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {/* CONTENT: HOURLY FORECAST TAB */}
            {activeTab === 'hourly' && data.hourly && (
                <div className="card bg-base-200/60 border border-base-300/80 p-4 space-y-3 hover:border-primary/20 transition-all">
                    <div className="card-body p-0">
                        <div className="text-[10px] text-base-content/60 font-semibold uppercase">Upcoming hours (Temp, Snow, Rain, Wind & Visibility)</div>

                        <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
                            {data.hourly.time.slice(0, 12).map((timeStr, index) => {
                                const hourFormatted = new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const temp = data.hourly.temperature_2m[index];
                                const freezingHeight = data.hourly.freezing_level_height[index];
                                const snowfall = data.hourly.snowfall[index];
                                const snowDepth = data.hourly.snow_depth[index];
                                const rain = data.hourly.rain ? data.hourly.rain[index] : 0;
                                const prob = data.hourly.precipitation_probability[index];
                                const windSpeed = data.hourly.wind_speed_10m ? data.hourly.wind_speed_10m[index] : 0;
                                const windGusts = data.hourly.wind_gusts_10m ? data.hourly.wind_gusts_10m[index] : 0;
                                const visibility = data.hourly.visibility ? data.hourly.visibility[index] : null;

                                return (
                                    <div key={index} className="shrink-0 bg-base-200/40 border border-base-300/60 rounded-xl p-3 text-center w-36 space-y-2">
                                        <div className="text-xs font-semibold text-base-content/70">{hourFormatted}</div>

                                        {/* Temperature */}
                                        <div className="flex items-center justify-center gap-1">
                                            <span className="text-sm font-extrabold text-base-content">{temp}{hourlyUnits.temperature_2m}</span>
                                        </div>

                                        {/* Precipitation & Snow */}
                                        <div className="space-y-1">
                                            {prob > 0 && (
                                                <div className="text-[9px] text-primary bg-primary/10 rounded px-1 py-0.5 font-medium flex items-center justify-center gap-0.5">
                                                    <Umbrella className="w-2.5 h-2.5" /> Prob: {prob}%
                                                </div>
                                            )}

                                            {rain > 0 && (
                                                <div className="text-[9px] text-info bg-info/10 rounded px-1 py-0.5 font-medium flex items-center justify-center gap-0.5">
                                                    <CloudRain className="w-2.5 h-2.5" /> Rain: {rain}mm
                                                </div>
                                            )}

                                            {snowfall > 0 && (
                                                <div className="text-[9px] text-accent bg-accent/10 rounded px-1 py-0.5 font-medium flex items-center justify-center gap-0.5">
                                                    <Snowflake className="w-2.5 h-2.5" /> Snow: {snowfall} {hourlyUnits.snowfall}
                                                </div>
                                            )}

                                            {snowDepth > 0 && (
                                                <div className="text-[9px] text-secondary bg-secondary/10 rounded py-0.5 px-1 font-medium flex items-center justify-center gap-1">
                                                    <Layers className="w-2.5 h-2.5 shrink-0" />
                                                    <span>Depth: {snowDepth} {hourlyUnits.snow_depth}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Wind & Gusts */}
                                        <div className="pt-1.5 border-t border-base-300/50 space-y-1 text-[9px] text-base-content/70">
                                            <div className="flex items-center justify-center gap-1 font-semibold text-base-content">
                                                <Wind className="w-2.5 h-2.5 text-info shrink-0" />
                                                <span>{windSpeed} {hourlyUnits.wind_speed_10m}</span>
                                            </div>
                                            {windGusts > 0 && (
                                                <div className="flex items-center justify-center gap-1 text-warning font-medium">
                                                    <Flame className="w-2.5 h-2.5 shrink-0" />
                                                    <span>Gusts: {windGusts} {hourlyUnits.wind_gusts_10m}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Visibility & Freezing Level */}
                                        <div className="space-y-1 pt-1">
                                            {visibility !== null && (
                                                <div className="text-[9px] text-accent bg-accent/10 rounded py-0.5 px-1 font-medium flex items-center justify-center gap-1">
                                                    <Eye className="w-2.5 h-2.5 shrink-0" />
                                                    <span>Vis: {formatVisibility(visibility)}</span>
                                                </div>
                                            )}

                                            <div className="text-[9px] text-info bg-info/10 rounded py-1 px-1 font-medium flex items-center justify-center gap-1">
                                                <Mountain className="w-2.5 h-2.5 shrink-0" />
                                                <span>Freezing: {freezingHeight} {hourlyUnits.freezing_level_height}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* CONTENT: DAILY FORECAST TAB */}
            {activeTab === 'daily' && data.daily && (
                <div className="card bg-base-200/60 border border-base-300/80 p-4 space-y-2.5 hover:border-primary/20 transition-all">
                    <div className="card-body p-0">
                        <div className="text-[10px] text-base-content/60 font-semibold uppercase mb-1">Multi-day Mountain Outlook</div>

                        <div className="space-y-2">
                            {data.daily.time.map((dayStr, index) => {
                                const dateObj = new Date(dayStr);
                                const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                                const maxTemp = data.daily?.temperature_2m_max[index];
                                const minTemp = data.daily?.temperature_2m_min[index];
                                const snowfallSum = data.daily?.snowfall_sum ? data.daily.snowfall_sum[index] : 0;
                                const sunrise = data.daily?.sunrise ? new Date(data.daily.sunrise[index]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
                                const sunset = data.daily?.sunset ? new Date(data.daily.sunset[index]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

                                return (
                                    <div key={index} className="bg-base-200/40 border border-base-300/60 rounded-xl p-3 flex items-center justify-between text-xs">
                                        <div className="font-semibold text-base-content capitalize w-28">
                                            {dayName}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {snowfallSum > 0 ? (
                                                <span className="badge badge-xs badge-accent gap-1 font-medium">
                                                    <Snowflake className="w-2.5 h-2.5" /> {snowfallSum} cm
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-base-content/40">No snow expected</span>
                                            )}
                                        </div>

                                        {sunrise && sunset && (
                                            <div className="hidden lg:flex items-center gap-2 text-[10px] text-base-content/60">
                                                <span className="flex items-center gap-0.5"><Sunrise className="w-3 h-3 text-warning" />{sunrise}</span>
                                                <span className="flex items-center gap-0.5"><Sunset className="w-3 h-3 text-error" />{sunset}</span>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 font-bold text-base-content">
                                            <span className="text-error">{maxTemp}°</span>
                                            <span className="text-base-content/30">/</span>
                                            <span className="text-info">{minTemp}°</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};