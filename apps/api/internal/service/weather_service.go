package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
)

type WeatherForecast struct {
	Latitude         float64        `json:"latitude"`
	Longitude        float64        `json:"longitude"`
	GenerationtimeMs float64        `json:"generationtime_ms"`
	UtcOffsetSeconds int            `json:"utc_offset_seconds"`
	Timezone         string         `json:"timezone"`
	TimezoneAbbr     string         `json:"timezone_abbreviation"`
	Elevation        float64        `json:"elevation"`
	CurrentUnits     CurrentUnits   `json:"current_units"`
	Current          CurrentWeather `json:"current"`
	HourlyUnits      HourlyUnits    `json:"hourly_units"`
	Hourly           HourlyData     `json:"hourly"`
	DailyUnits       DailyUnits     `json:"daily_units,omitempty"`
	Daily            DailyData      `json:"daily,omitempty"`
}

type CurrentUnits struct {
	Interval            string `json:"interval"`
	IsDay               string `json:"is_day"`
	Precipitation       string `json:"precipitation"`
	Temperature2m       string `json:"temperature_2m"`
	Time                string `json:"time"`
	WeatherCode         string `json:"weather_code"`
	WindDirection10m    string `json:"wind_direction_10m"`
	WindSpeed10m        string `json:"wind_speed_10m"`
	ApparentTemperature string `json:"apparent_temperature"`
	WindGusts10m        string `json:"wind_gusts_10m"`
	RelativeHumidity2m  string `json:"relative_humidity_2m"`
	SurfacePressure     string `json:"surface_pressure"`
	CloudCover          string `json:"cloud_cover"`
	Visibility          string `json:"visibility"`
}

type CurrentWeather struct {
	Interval            int     `json:"interval"`
	IsDay               int     `json:"is_day"`
	Precipitation       float64 `json:"precipitation"`
	Temperature2m       float64 `json:"temperature_2m"`
	Time                string  `json:"time"`
	WeatherCode         int     `json:"weather_code"`
	WindDirection10m    int     `json:"wind_direction_10m"`
	WindSpeed10m        float64 `json:"wind_speed_10m"`
	ApparentTemperature float64 `json:"apparent_temperature"`
	WindGusts10m        float64 `json:"wind_gusts_10m"`
	RelativeHumidity2m  int     `json:"relative_humidity_2m"`
	SurfacePressure     float64 `json:"surface_pressure"`
	CloudCover          int     `json:"cloud_cover"`
	Visibility          float64 `json:"visibility"`
}

type HourlyUnits struct {
	FreezingLevelHeight      string `json:"freezing_level_height"`
	SnowDepth                string `json:"snow_depth"`
	Snowfall                 string `json:"snowfall"`
	Temperature2m            string `json:"temperature_2m"`
	Time                     string `json:"time"`
	ApparentTemperature      string `json:"apparent_temperature"`
	PrecipitationProbability string `json:"precipitation_probability"`
	Precipitation            string `json:"precipitation"`
	Rain                     string `json:"rain"`
	Showers                  string `json:"showers"`
	CloudCover               string `json:"cloud_cover"`
	Visibility               string `json:"visibility"`
	WindSpeed10m             string `json:"wind_speed_10m"`
	WindGusts10m             string `json:"wind_gusts_10m"`
}

type HourlyData struct {
	FreezingLevelHeight      []float64 `json:"freezing_level_height"`
	SnowDepth                []float64 `json:"snow_depth"`
	Snowfall                 []float64 `json:"snowfall"`
	Temperature2m            []float64 `json:"temperature_2m"`
	Time                     []string  `json:"time"`
	ApparentTemperature      []float64 `json:"apparent_temperature"`
	PrecipitationProbability []int     `json:"precipitation_probability"`
	Precipitation            []float64 `json:"precipitation"`
	Rain                     []float64 `json:"rain"`
	Showers                  []float64 `json:"showers"`
	CloudCover               []int     `json:"cloud_cover"`
	Visibility               []float64 `json:"visibility"`
	WindSpeed10m             []float64 `json:"wind_speed_10m"`
	WindGusts10m             []float64 `json:"wind_gusts_10m"`
}

type DailyUnits struct {
	Time                        string `json:"time"`
	WeatherCode                 string `json:"weather_code"`
	Temperature2mMax            string `json:"temperature_2m_max"`
	Temperature2mMin            string `json:"temperature_2m_min"`
	Sunrise                     string `json:"sunrise"`
	Sunset                      string `json:"sunset"`
	PrecipitationSum            string `json:"precipitation_sum"`
	SnowfallSum                 string `json:"snowfall_sum"`
	PrecipitationProbabilityMax string `json:"precipitation_probability_max"`
}

type DailyData struct {
	Time                        []string  `json:"time"`
	WeatherCode                 []int     `json:"weather_code"`
	Temperature2mMax            []float64 `json:"temperature_2m_max"`
	Temperature2mMin            []float64 `json:"temperature_2m_min"`
	Sunrise                     []string  `json:"sunrise"`
	Sunset                      []string  `json:"sunset"`
	PrecipitationSum            []float64 `json:"precipitation_sum"`
	SnowfallSum                 []float64 `json:"snowfall_sum"`
	PrecipitationProbabilityMax []int     `json:"precipitation_probability_max"`
}

type WeatherService struct {
	logger *slog.Logger
}

func NewWeatherService(logger *slog.Logger) *WeatherService {
	return &WeatherService{
		logger: logger,
	}
}

func (s *WeatherService) GetWeather(ctx context.Context, lat, lon string) (WeatherForecast, error) {
	openMeteoURL := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?"+
			"latitude=%s&longitude=%s"+
			"&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,surface_pressure,cloud_cover,visibility,is_day"+
			"&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,snow_depth,freezing_level_height,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m"+
			"&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,snowfall_sum,precipitation_probability_max"+
			"&wind_speed_unit=kmh&timezone=auto",
		lat, lon,
	)

	resp, err := http.Get(openMeteoURL)
	if err != nil || resp.StatusCode != http.StatusOK {
		return WeatherForecast{}, fmt.Errorf("error fetching weather data: %w", err)
	}
	defer resp.Body.Close()

	var weatherData WeatherForecast
	if err := json.NewDecoder(resp.Body).Decode(&weatherData); err != nil {
		return WeatherForecast{}, fmt.Errorf("error decoding weather data: %w", err)
	}

	return weatherData, nil
}
