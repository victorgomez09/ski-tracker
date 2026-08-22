import { Sun, Cloud, CloudRain, Snowflake, Wind, Compass, Layers, Mountain, Droplets, Flame, Gauge, Sunrise, Sunset, Umbrella, Eye } from 'lucide-react-native';
import { WeatherForecast } from 'models/weather.model';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';

interface WeatherWidgetProps {
    data: WeatherForecast;
}

export const WeatherForecastDetails: React.FC<WeatherWidgetProps> = ({ data }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'current' | 'hourly' | 'daily'>('current');

    const current = data.current;
    const currentUnits = data.current_units;
    const hourlyUnits = data.hourly_units;

    const formatVisibility = (meters: number) => {
        if (!meters && meters !== 0) return t('na');
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km`;
        }
        return `${meters} m`;
    };

    const getWeatherInfo = (code: number) => {
        switch (code) {
            case 0:
                return { label: t('clear_sky'), icon: <Sun size={24} color="#f59e0b" /> };
            case 1:
            case 2:
            case 3:
                return { label: t('partly_cloudy'), icon: <Cloud size={24} color="#3b82f6" /> };
            case 45:
            case 48:
                return { label: t('foggy'), icon: <Cloud size={24} color="#94a3b8" /> };
            case 51:
            case 53:
            case 55:
            case 61:
            case 63:
                return { label: t('rain_showers'), icon: <CloudRain size={24} color="#3b82f6" /> };
            case 71:
            case 73:
            case 75:
            case 77:
                return { label: t('snowfall'), icon: <Snowflake size={24} color="#38bdf8" /> };
            case 95:
            case 96:
            case 99:
                return { label: t('thunderstorm'), icon: <CloudRain size={24} color="#ef4444" /> };
            default:
                return { label: t('variable'), icon: <Cloud size={24} color="#94a3b8" /> };
        }
    };

    const currentWeatherInfo = getWeatherInfo(current.weather_code);

    return (
        <View className="space-y-3">
            {/* Header Tabs */}
            <View className="flex-row justify-between items-center mb-3">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('detailed_weather')}</Text>
                <View className="flex-row bg-slate-800 p-1 rounded-md">
                    <TouchableOpacity
                        className={`px-3 py-1.5 rounded-md ${activeTab === 'current' ? 'bg-blue-600' : ''}`}
                        onPress={() => setActiveTab('current')}
                    >
                        <Text className={`text-xs font-semibold ${activeTab === 'current' ? 'text-white' : 'text-slate-400'}`}>{t('current')}</Text>
                    </TouchableOpacity>
                    {data.hourly && (
                        <TouchableOpacity
                            className={`px-3 py-1.5 rounded-md ${activeTab === 'hourly' ? 'bg-blue-600' : ''}`}
                            onPress={() => setActiveTab('hourly')}
                        >
                            <Text className={`text-xs font-semibold ${activeTab === 'hourly' ? 'text-white' : 'text-slate-400'}`}>{t('hourly')}</Text>
                        </TouchableOpacity>
                    )}
                    {data.daily && (
                        <TouchableOpacity
                            className={`px-3 py-1.5 rounded-md ${activeTab === 'daily' ? 'bg-blue-600' : ''}`}
                            onPress={() => setActiveTab('daily')}
                        >
                            <Text className={`text-xs font-semibold ${activeTab === 'daily' ? 'text-white' : 'text-slate-400'}`}>{t('daily')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* CURRENT TAB */}
            {activeTab === 'current' && (
                <View className="bg-slate-800 border border-slate-700 p-4 rounded-md space-y-4">
                    <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-3">
                            <View className="p-3 rounded-md bg-slate-700">
                                {currentWeatherInfo.icon}
                            </View>
                            <View>
                                <Text className="text-[10px] text-slate-400 font-semibold uppercase">{t('condition')}</Text>
                                <Text className="text-base font-bold text-white">{currentWeatherInfo.label}</Text>
                                <Text className="text-[10px] text-slate-400">
                                    {t('updated')}: {new Date(current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </View>
                        </View>
                        <View className="items-end">
                            <Text className="text-3xl font-extrabold text-white">{current.temperature_2m}{currentUnits.temperature_2m}</Text>
                            <Text className="text-[11px] text-slate-400">{t('feels_like')}: {current.apparent_temperature}{currentUnits.temperature_2m}</Text>
                        </View>
                    </View>

                    {/* Metrics Grid */}
                    <View className="flex-row flex-wrap gap-2 pt-3 border-t border-slate-700">
                        <View className="bg-slate-700/60 rounded-md p-3 flex-row items-center gap-2 w-[48%] mb-2">
                            <Wind size={16} color="#38bdf8" />
                            <View>
                                <Text className="text-[9px] text-slate-400 uppercase font-semibold">{t('wind_speed')}</Text>
                                <Text className="text-xs font-bold text-white">{current.wind_speed_10m} {currentUnits.wind_speed_10m}</Text>
                            </View>
                        </View>

                        <View className="bg-slate-700/60 rounded-md p-3 flex-row items-center gap-2 w-[48%] mb-2">
                            <Flame size={16} color="#f59e0b" />
                            <View>
                                <Text className="text-[9px] text-slate-400 uppercase font-semibold">{t('wind_gusts')}</Text>
                                <Text className="text-xs font-bold text-white">{current.wind_gusts_10m} {currentUnits.wind_gusts_10m}</Text>
                            </View>
                        </View>

                        <View className="bg-slate-700/60 rounded-md p-3 flex-row items-center gap-2 w-[48%] mb-2">
                            <Compass size={16} color="#c084fc" />
                            <View>
                                <Text className="text-[9px] text-slate-400 uppercase font-semibold">{t('wind_dir')}</Text>
                                <Text className="text-xs font-bold text-white">{current.wind_direction_10m}{currentUnits.wind_direction_10m}</Text>
                            </View>
                        </View>

                        <View className="bg-slate-700/60 rounded-md p-3 flex-row items-center gap-2 w-[48%] mb-2">
                            <Eye size={16} color="#34d399" />
                            <View>
                                <Text className="text-[9px] text-slate-400 uppercase font-semibold">{t('visibility')}</Text>
                                <Text className="text-xs font-bold text-white">{formatVisibility(current.visibility)}</Text>
                            </View>
                        </View>

                        <View className="bg-slate-700/60 rounded-md p-3 flex-row items-center gap-2 w-[48%] mb-2">
                            <Droplets size={16} color="#60a5fa" />
                            <View>
                                <Text className="text-[9px] text-slate-400 uppercase font-semibold">{t('humidity')}</Text>
                                <Text className="text-xs font-bold text-white">{current.relative_humidity_2m}{currentUnits.relative_humidity_2m}</Text>
                            </View>
                        </View>

                        <View className="bg-slate-700/60 rounded-md p-3 flex-row items-center gap-2 w-[48%] mb-2">
                            <Gauge size={16} color="#4ade80" />
                            <View>
                                <Text className="text-[9px] text-slate-400 uppercase font-semibold">{t('pressure')}</Text>
                                <Text className="text-xs font-bold text-white">{current.surface_pressure} {currentUnits.surface_pressure}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            )}

            {/* HOURLY TAB */}
            {activeTab === 'hourly' && data.hourly && (
                <View className="bg-slate-800 border border-slate-700 p-4 rounded-md">
                    <Text className="text-[10px] text-slate-400 font-semibold uppercase mb-3">{t('upcoming_hours')}</Text>
                    <ScrollView className="flex flex-col gap-2 w-full h-72" showsVerticalScrollIndicator={true}>
                        {data.hourly.time.slice(0, 12).map((timeStr, index) => {
                            const hourFormatted = new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const temp = data.hourly.temperature_2m[index];
                            const snowfall = data.hourly.snowfall[index];
                            const prob = data.hourly.precipitation_probability[index];
                            const windSpeed = data.hourly.wind_speed_10m ? data.hourly.wind_speed_10m[index] : 0;

                            return (
                                <View key={index} className="bg-slate-700/60 rounded-md p-3 flex-row items-center justify-between my-1">
                                    <Text className="text-xs font-semibold text-white w-14">{hourFormatted}</Text>
                                    
                                    <View className="flex-row items-center gap-3 flex-1 justify-center">
                                        {snowfall > 0 ? (
                                            <View className="bg-sky-900/80 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                                                <Snowflake size={10} color="#38bdf8" />
                                                <Text className="text-[10px] text-sky-200 font-bold">{snowfall}{hourlyUnits.snowfall}</Text>
                                            </View>
                                        ) : prob > 0 ? (
                                            <View className="bg-blue-900/60 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                                                <Umbrella size={10} color="#60a5fa" />
                                                <Text className="text-[10px] text-blue-300 font-bold">{prob}%</Text>
                                            </View>
                                        ) : (
                                            <Text className="text-[10px] text-slate-400">{t('no_precip')}</Text>
                                        )}
                                    </View>
                                    
                                    <View className="flex-row items-center gap-1 w-16 justify-end">
                                        <Wind size={10} color="#94a3b8" />
                                        <Text className="text-[10px] text-slate-300">{windSpeed} {hourlyUnits.wind_speed_10m}</Text>
                                    </View>
                                    
                                    <Text className="text-sm font-bold text-white w-12 text-right">{temp}°</Text>
                                </View>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

            {/* DAILY TAB */}
            {activeTab === 'daily' && data.daily && (
                <View className="bg-slate-800 border border-slate-700 p-4 rounded-md space-y-2">
                    <Text className="text-[10px] text-slate-400 font-semibold uppercase mb-2">{t('multiday_outlook')}</Text>
                    {data.daily.time.map((dayStr, index) => {
                        const dateObj = new Date(dayStr);
                        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        const maxTemp = data.daily?.temperature_2m_max[index];
                        const minTemp = data.daily?.temperature_2m_min[index];
                        const snowfallSum = data.daily?.snowfall_sum ? data.daily.snowfall_sum[index] : 0;

                        return (
                            <View key={index} className="bg-slate-700/60 rounded-md p-3 flex-row items-center justify-between my-1">
                                <Text className="text-xs font-semibold text-white w-28">{dayName}</Text>
                                {snowfallSum > 0 ? (
                                    <View className="bg-sky-900/80 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                                        <Snowflake size={10} color="#38bdf8" />
                                        <Text className="text-[10px] text-sky-200 font-bold">{snowfallSum} cm</Text>
                                    </View>
                                ) : (
                                    <Text className="text-[10px] text-slate-400">{t('no_snow')}</Text>
                                )}
                                <View className="flex-row items-center gap-1">
                                    <Text className="text-xs font-bold text-red-400">{maxTemp}°</Text>
                                    <Text className="text-xs text-slate-500">/</Text>
                                    <Text className="text-xs font-bold text-blue-400">{minTemp}°</Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            )}
        </View>
    );
};