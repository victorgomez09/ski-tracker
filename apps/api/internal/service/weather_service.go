package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
)

type WeatherForecastResponse struct {
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
}

type HourlyUnits struct {
	FreezingLevelHeight string `json:"freezing_level_height"`
	SnowDepth           string `json:"snow_depth"`
	Snowfall            string `json:"snowfall"`
	Temperature2m       string `json:"temperature_2m"`
	Time                string `json:"time"`
}

type HourlyData struct {
	FreezingLevelHeight []float64 `json:"freezing_level_height"`
	SnowDepth           []float64 `json:"snow_depth"`
	Snowfall            []float64 `json:"snowfall"`
	Temperature2m       []float64 `json:"temperature_2m"`
	Time                []string  `json:"time"`
}

type WeatherService struct {
	logger *slog.Logger
}

func NewWeatherService(logger *slog.Logger) *WeatherService {
	return &WeatherService{
		logger: logger,
	}
}

func (s *WeatherService) GetWeather(ctx context.Context, lat, lon string) (WeatherForecastResponse, error) {
	openMeteoURL := fmt.Sprintf("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day&hourly=snowfall,snow_depth,freezing_level_height,temperature_2m&wind_speed_unit=kmh&timezone=auto", lat, lon)

	resp, err := http.Get(openMeteoURL)
	if err != nil || resp.StatusCode != http.StatusOK {
		return WeatherForecastResponse{}, fmt.Errorf("error fetching weather data: %w", err)
	}
	defer resp.Body.Close()

	var weatherData WeatherForecastResponse
	if err := json.NewDecoder(resp.Body).Decode(&weatherData); err != nil {
		return WeatherForecastResponse{}, fmt.Errorf("error decoding weather data: %w", err)
	}

	return weatherData, nil
}
