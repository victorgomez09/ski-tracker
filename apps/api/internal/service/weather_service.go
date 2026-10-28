package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
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
	SnowReport       *SnowReport    `json:"snow_report,omitempty"`
}

type CurrentUnits struct {
	Interval            string `json:"interval"`
	IsDay               string `json:"is_day"`
	Precipitation       string `json:"precipitation"`
	Rain                string `json:"rain"`
	Showers             string `json:"showers"`
	Snowfall            string `json:"snowfall"`
	SnowDepth           string `json:"snow_depth"`
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
	Rain                float64 `json:"rain"`
	Showers             float64 `json:"showers"`
	Snowfall            float64 `json:"snowfall"`
	SnowDepth           float64 `json:"snow_depth"`
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

type SnowReport struct {
	ResortID             string    `json:"resort_id,omitempty"`
	ResortName           string    `json:"resort_name,omitempty"`
	BaseElevationM       float64   `json:"base_elevation_m"`
	SummitElevationM     float64   `json:"summit_elevation_m"`
	SnowDepthBaseCM      float64   `json:"snow_depth_base_cm"`
	SnowDepthSummitCM    float64   `json:"snow_depth_summit_cm"`
	SnowCondition        string    `json:"snow_condition"` // powder, hard_packed, spring, wet, packed_powder, no_snow
	SnowConditionLabel   string    `json:"snow_condition_label"`
	LastSnowfallDate     *string   `json:"last_snowfall_date"`
	LastSnowfallAmountCM float64   `json:"last_snowfall_amount_cm"`
	FreshSnow24hCM       float64   `json:"fresh_snow_24h_cm"`
	FreshSnow48hCM       float64   `json:"fresh_snow_48h_cm"`
	ForecastSnow7dCM     float64   `json:"forecast_snow_7d_cm"`
	FreezingLevelM       float64   `json:"freezing_level_m"`
	DataSource           string    `json:"data_source"`
	GeneratedAt          time.Time `json:"generated_at"`
}

type WeatherService struct {
	store  store.Store
	logger *slog.Logger
}

func NewWeatherService(s store.Store, logger *slog.Logger) *WeatherService {
	return &WeatherService{
		store:  s,
		logger: logger,
	}
}

func (s *WeatherService) GetWeather(ctx context.Context, lat, lon, resortID string) (WeatherForecast, error) {
	var resort *models.SkiResort
	baseElev := 0.0
	summitElev := 0.0
	resortName := ""

	// 1. Resolve resort details if store is available
	if s.store != nil {
		if resortID != "" {
			r, err := s.store.SkiResort().GetByID(ctx, resortID)
			if err == nil {
				resort = &r
			}
		} else {
			latF, errLat := strconv.ParseFloat(lat, 64)
			lonF, errLon := strconv.ParseFloat(lon, 64)
			if errLat == nil && errLon == nil {
				r, err := s.store.SkiResort().GetByCloseness(ctx, latF, lonF)
				if err == nil && r != nil {
					resort = r
					resortID = r.ID
				}
			}
		}

		if resort != nil {
			resortName = resort.Name
			baseElev, summitElev = extractResortElevations(*resort)
		}
	}

	// 2. Fetch from Open-Meteo
	var openMeteoURL string
	hasDualElevation := baseElev > 0 && summitElev > baseElev

	if hasDualElevation {
		openMeteoURL = fmt.Sprintf(
			"https://api.open-meteo.com/v1/forecast?"+
				"latitude=%s,%s&longitude=%s,%s&elevation=%.0f,%.0f"+
				"&current=temperature_2m,apparent_temperature,precipitation,rain,showers,snowfall,snow_depth,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,surface_pressure,cloud_cover,visibility,is_day"+
				"&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,snow_depth,freezing_level_height,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m"+
				"&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,snowfall_sum,precipitation_probability_max"+
				"&past_days=7&wind_speed_unit=kmh&timezone=auto",
			lat, lat, lon, lon, baseElev, summitElev,
		)
	} else {
		openMeteoURL = fmt.Sprintf(
			"https://api.open-meteo.com/v1/forecast?"+
				"latitude=%s&longitude=%s"+
				"&current=temperature_2m,apparent_temperature,precipitation,rain,showers,snowfall,snow_depth,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,surface_pressure,cloud_cover,visibility,is_day"+
				"&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,snow_depth,freezing_level_height,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m"+
				"&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,snowfall_sum,precipitation_probability_max"+
				"&past_days=7&wind_speed_unit=kmh&timezone=auto",
			lat, lon,
		)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, openMeteoURL, nil)
	if err != nil {
		return WeatherForecast{}, fmt.Errorf("error creating weather request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		return WeatherForecast{}, fmt.Errorf("error fetching weather data (status %d): %w", status, err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return WeatherForecast{}, fmt.Errorf("error reading weather data: %w", err)
	}

	var baseForecast, summitForecast WeatherForecast
	trimmed := bytes.TrimSpace(bodyBytes)

	if bytes.HasPrefix(trimmed, []byte("[")) {
		var list []WeatherForecast
		if err := json.Unmarshal(trimmed, &list); err != nil {
			return WeatherForecast{}, fmt.Errorf("error unmarshaling weather forecast array: %w", err)
		}
		if len(list) >= 2 {
			baseForecast = list[0]
			summitForecast = list[1]
		} else if len(list) == 1 {
			baseForecast = list[0]
			summitForecast = list[0]
		}
	} else {
		if err := json.Unmarshal(trimmed, &baseForecast); err != nil {
			return WeatherForecast{}, fmt.Errorf("error unmarshaling weather forecast: %w", err)
		}
		summitForecast = baseForecast
		if baseElev == 0 {
			baseElev = baseForecast.Elevation
		}
		if summitElev == 0 {
			summitElev = baseElev + 500
		}
		summitForecast.Elevation = summitElev
		summitForecast.Current.Temperature2m -= 3.0
		summitForecast.Current.ApparentTemperature -= 3.5
	}

	if baseElev == 0 {
		baseElev = baseForecast.Elevation
	}
	if summitElev == 0 {
		summitElev = summitForecast.Elevation
	}

	// 3. Compute Snow Forecast Report
	snowReport := computeSnowReport(
		resortID,
		resortName,
		baseElev,
		summitElev,
		baseForecast,
		summitForecast,
	)

	baseForecast.SnowReport = &snowReport
	return baseForecast, nil
}

func (s *WeatherService) GetSnowReport(ctx context.Context, resortID string) (SnowReport, error) {
	if s.store == nil {
		return SnowReport{}, fmt.Errorf("store is not initialized")
	}

	resort, err := s.store.SkiResort().GetByID(ctx, resortID)
	if err != nil {
		return SnowReport{}, fmt.Errorf("resort not found: %w", err)
	}

	latStr := strconv.FormatFloat(resort.Latitude, 'f', 6, 64)
	lonStr := strconv.FormatFloat(resort.Longitude, 'f', 6, 64)

	forecast, err := s.GetWeather(ctx, latStr, lonStr, resort.ID)
	if err != nil {
		return SnowReport{}, err
	}

	if forecast.SnowReport != nil {
		return *forecast.SnowReport, nil
	}
	return SnowReport{}, fmt.Errorf("failed to generate snow report")
}

func extractResortElevations(resort models.SkiResort) (float64, float64) {
	minElev := 0.0
	maxElev := 0.0
	if stats, ok := resort.Tags["statistics"].(map[string]interface{}); ok {
		if v, ok := stats["minElevation"].(float64); ok && v > 0 {
			minElev = v
		}
		if v, ok := stats["maxElevation"].(float64); ok && v > 0 {
			maxElev = v
		}
		if minElev == 0 {
			if runs, ok := stats["runs"].(map[string]interface{}); ok {
				if v, ok := runs["minElevation"].(float64); ok && v > 0 {
					minElev = v
				}
				if v, ok := runs["maxElevation"].(float64); ok && v > 0 {
					maxElev = v
				}
			}
		}
	}
	return minElev, maxElev
}

func computeSnowReport(
	resortID, resortName string,
	baseElev, summitElev float64,
	baseForecast, summitForecast WeatherForecast,
) SnowReport {
	// 1. Snow Depths (Open-Meteo returns snow_depth in meters, convert to cm)
	baseDepthCM := math.Round(baseForecast.Current.SnowDepth * 100 * 10) / 10
	summitDepthCM := math.Round(summitForecast.Current.SnowDepth * 100 * 10) / 10
	if summitDepthCM < baseDepthCM {
		summitDepthCM = baseDepthCM
	}

	// 2. Snowfall history from past days and forecast for coming days
	var lastSnowfallDate *string
	var lastSnowfallCM float64
	var freshSnow24hCM float64
	var freshSnow48hCM float64
	var forecastSnow7dCM float64

	todayStr := time.Now().Format("2006-01-02")
	todayIndex := -1
	for i, d := range baseForecast.Daily.Time {
		if d == todayStr {
			todayIndex = i
			break
		}
	}
	if todayIndex == -1 && len(baseForecast.Daily.Time) >= 8 {
		todayIndex = 7
	}

	if todayIndex >= 0 && todayIndex < len(baseForecast.Daily.SnowfallSum) {
		freshSnow24hCM = baseForecast.Daily.SnowfallSum[todayIndex]
		if todayIndex > 0 {
			freshSnow48hCM = freshSnow24hCM + baseForecast.Daily.SnowfallSum[todayIndex-1]
		}
	}

	// Past snowfall detection
	if todayIndex >= 0 {
		for i := todayIndex; i >= 0; i-- {
			if i < len(baseForecast.Daily.SnowfallSum) && baseForecast.Daily.SnowfallSum[i] > 0 {
				lastSnowfallCM = baseForecast.Daily.SnowfallSum[i]
				dStr := baseForecast.Daily.Time[i]
				lastSnowfallDate = &dStr
				break
			}
		}
	}

	// Future 7-day snowfall sum
	if todayIndex >= 0 {
		for i := todayIndex; i < len(baseForecast.Daily.SnowfallSum); i++ {
			forecastSnow7dCM += baseForecast.Daily.SnowfallSum[i]
		}
	}
	forecastSnow7dCM = math.Round(forecastSnow7dCM*10) / 10

	// Freezing level height
	freezingLevel := 0.0
	if len(baseForecast.Hourly.FreezingLevelHeight) > 0 {
		nowHour := time.Now().Hour()
		if todayIndex >= 0 {
			idx := todayIndex*24 + nowHour
			if idx >= 0 && idx < len(baseForecast.Hourly.FreezingLevelHeight) {
				freezingLevel = baseForecast.Hourly.FreezingLevelHeight[idx]
			} else {
				freezingLevel = baseForecast.Hourly.FreezingLevelHeight[len(baseForecast.Hourly.FreezingLevelHeight)-1]
			}
		} else {
			freezingLevel = baseForecast.Hourly.FreezingLevelHeight[len(baseForecast.Hourly.FreezingLevelHeight)-1]
		}
	}

	// 3. Snow Condition / Quality
	snowCondition := "no_snow"
	snowConditionLabel := "Sin nieve"
	if baseDepthCM > 0 || summitDepthCM > 0 {
		if freshSnow24hCM >= 3.0 && baseForecast.Current.Temperature2m <= 1.0 {
			snowCondition = "powder"
			snowConditionLabel = "Polvo"
		} else if baseForecast.Current.Temperature2m > 3.0 || baseForecast.Current.Rain > 0.5 {
			snowCondition = "wet"
			snowConditionLabel = "Húmeda"
		} else if baseForecast.Current.Temperature2m >= 0.0 && baseForecast.Current.Temperature2m <= 5.0 && baseForecast.Current.WeatherCode <= 3 {
			snowCondition = "spring"
			snowConditionLabel = "Primavera"
		} else if baseForecast.Current.Temperature2m < 0.0 && baseForecast.Current.WindSpeed10m > 25.0 {
			snowCondition = "hard_packed"
			snowConditionLabel = "Dura / Venteada"
		} else {
			snowCondition = "packed_powder"
			snowConditionLabel = "Polvo dura"
		}
	}

	return SnowReport{
		ResortID:             resortID,
		ResortName:           resortName,
		BaseElevationM:       baseElev,
		SummitElevationM:     summitElev,
		SnowDepthBaseCM:      baseDepthCM,
		SnowDepthSummitCM:    summitDepthCM,
		SnowCondition:        snowCondition,
		SnowConditionLabel:   snowConditionLabel,
		LastSnowfallDate:     lastSnowfallDate,
		LastSnowfallAmountCM: lastSnowfallCM,
		FreshSnow24hCM:       freshSnow24hCM,
		FreshSnow48hCM:       freshSnow48hCM,
		ForecastSnow7dCM:     forecastSnow7dCM,
		FreezingLevelM:       freezingLevel,
		DataSource:           "open-meteo",
		GeneratedAt:          time.Now(),
	}
}
