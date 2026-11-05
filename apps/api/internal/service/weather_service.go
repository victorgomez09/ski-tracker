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

type AvalancheReport struct {
	DangerLevel        int      `json:"danger_level"` // 1 - 5
	DangerLevelTitle   string   `json:"danger_level_title"`
	DangerColor        string   `json:"danger_color"`
	CriticalElevationM float64  `json:"critical_elevation_m"`
	DangerousAspects   []string `json:"dangerous_aspects"`
	Summary            string   `json:"summary"`
	WindRisk           string   `json:"wind_risk"`
	FreshSnowRisk      string   `json:"fresh_snow_risk"`
	Confidence         string   `json:"confidence"`
}

type SnowReport struct {
	ResortID             string          `json:"resort_id,omitempty"`
	ResortName           string          `json:"resort_name,omitempty"`
	BaseElevationM       float64         `json:"base_elevation_m"`
	SummitElevationM     float64         `json:"summit_elevation_m"`
	SnowDepthBaseCM      float64         `json:"snow_depth_base_cm"`
	SnowDepthSummitCM    float64         `json:"snow_depth_summit_cm"`
	SnowCondition        string          `json:"snow_condition"` // powder, hard_packed, spring, wet, packed_powder, no_snow
	SnowConditionLabel   string          `json:"snow_condition_label"`
	LastSnowfallDate     *string         `json:"last_snowfall_date"`
	LastSnowfallAmountCM float64         `json:"last_snowfall_amount_cm"`
	FreshSnow24hCM       float64         `json:"fresh_snow_24h_cm"`
	FreshSnow48hCM       float64         `json:"fresh_snow_48h_cm"`
	ForecastSnow7dCM     float64         `json:"forecast_snow_7d_cm"`
	FreezingLevelM       float64         `json:"freezing_level_m"`
	AvalancheReport      AvalancheReport `json:"avalanche_report"`
	DataSource           string          `json:"data_source"`
	GeneratedAt          time.Time       `json:"generated_at"`
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

	// 3. Match dates and hours for resort timezone
	todayStr := time.Now().Format("2006-01-02")
	nowHourStr := time.Now().Format("2006-01-02T15:00")
	if baseForecast.Timezone != "" {
		if loc, err := time.LoadLocation(baseForecast.Timezone); err == nil && loc != nil {
			tLoc := time.Now().In(loc)
			todayStr = tLoc.Format("2006-01-02")
			nowHourStr = tLoc.Format("2006-01-02T15:00")
		}
	}

	todayIndex := -1
	for i, d := range baseForecast.Daily.Time {
		if d == todayStr {
			todayIndex = i
			break
		}
	}
	if todayIndex == -1 && len(baseForecast.Daily.Time) >= 8 {
		todayIndex = 7
	} else if todayIndex == -1 && len(baseForecast.Daily.Time) > 0 {
		todayIndex = 0
	}

	currentHourIdx := -1
	for i, tStr := range baseForecast.Hourly.Time {
		if tStr == nowHourStr {
			currentHourIdx = i
			break
		}
	}
	if currentHourIdx == -1 && todayIndex >= 0 {
		nowHour := time.Now().Hour()
		if baseForecast.Timezone != "" {
			if loc, err := time.LoadLocation(baseForecast.Timezone); err == nil && loc != nil {
				nowHour = time.Now().In(loc).Hour()
			}
		}
		idx := todayIndex*24 + nowHour
		if idx >= 0 && idx < len(baseForecast.Hourly.Time) {
			currentHourIdx = idx
		}
	}
	if currentHourIdx == -1 && len(baseForecast.Hourly.Time) > 0 {
		currentHourIdx = 0
	}

	// 4. Compute Snow Forecast Report using full historical + forecast timeline
	snowReport := computeSnowReport(
		resortID,
		resortName,
		baseElev,
		summitElev,
		baseForecast,
		summitForecast,
		todayIndex,
		currentHourIdx,
	)

	// 5. Merge mountain snowfall and snow depth into baseForecast so clients displaying
	// daily/hourly forecasts see mountain conditions.
	for i := range baseForecast.Daily.SnowfallSum {
		if i < len(summitForecast.Daily.SnowfallSum) {
			if summitForecast.Daily.SnowfallSum[i] > baseForecast.Daily.SnowfallSum[i] {
				baseForecast.Daily.SnowfallSum[i] = math.Round(summitForecast.Daily.SnowfallSum[i]*10) / 10
			}
		}
		if i < len(summitForecast.Daily.WeatherCode) {
			sCode := summitForecast.Daily.WeatherCode[i]
			bCode := baseForecast.Daily.WeatherCode[i]
			if isSnowWeatherCode(sCode) && !isSnowWeatherCode(bCode) {
				baseForecast.Daily.WeatherCode[i] = sCode
			}
		}
	}

	for i := range baseForecast.Hourly.Snowfall {
		if i < len(summitForecast.Hourly.Snowfall) {
			if summitForecast.Hourly.Snowfall[i] > baseForecast.Hourly.Snowfall[i] {
				baseForecast.Hourly.Snowfall[i] = math.Round(summitForecast.Hourly.Snowfall[i]*100) / 100
			}
		}
		if i < len(summitForecast.Hourly.SnowDepth) {
			if summitForecast.Hourly.SnowDepth[i] > baseForecast.Hourly.SnowDepth[i] {
				baseForecast.Hourly.SnowDepth[i] = summitForecast.Hourly.SnowDepth[i]
			}
		}
	}

	if summitForecast.Current.Snowfall > baseForecast.Current.Snowfall {
		baseForecast.Current.Snowfall = summitForecast.Current.Snowfall
	}
	if summitForecast.Current.SnowDepth > baseForecast.Current.SnowDepth {
		baseForecast.Current.SnowDepth = summitForecast.Current.SnowDepth
	}
	if isSnowWeatherCode(summitForecast.Current.WeatherCode) && !isSnowWeatherCode(baseForecast.Current.WeatherCode) {
		baseForecast.Current.WeatherCode = summitForecast.Current.WeatherCode
	}

	// 6. Trim Daily so it starts from today (so frontend multiday outlook shows today + next 6 days)
	if todayIndex > 0 && todayIndex < len(baseForecast.Daily.Time) {
		baseForecast.Daily.Time = baseForecast.Daily.Time[todayIndex:]
		if len(baseForecast.Daily.WeatherCode) > todayIndex {
			baseForecast.Daily.WeatherCode = baseForecast.Daily.WeatherCode[todayIndex:]
		}
		if len(baseForecast.Daily.Temperature2mMax) > todayIndex {
			baseForecast.Daily.Temperature2mMax = baseForecast.Daily.Temperature2mMax[todayIndex:]
		}
		if len(baseForecast.Daily.Temperature2mMin) > todayIndex {
			baseForecast.Daily.Temperature2mMin = baseForecast.Daily.Temperature2mMin[todayIndex:]
		}
		if len(baseForecast.Daily.Sunrise) > todayIndex {
			baseForecast.Daily.Sunrise = baseForecast.Daily.Sunrise[todayIndex:]
		}
		if len(baseForecast.Daily.Sunset) > todayIndex {
			baseForecast.Daily.Sunset = baseForecast.Daily.Sunset[todayIndex:]
		}
		if len(baseForecast.Daily.PrecipitationSum) > todayIndex {
			baseForecast.Daily.PrecipitationSum = baseForecast.Daily.PrecipitationSum[todayIndex:]
		}
		if len(baseForecast.Daily.SnowfallSum) > todayIndex {
			baseForecast.Daily.SnowfallSum = baseForecast.Daily.SnowfallSum[todayIndex:]
		}
		if len(baseForecast.Daily.PrecipitationProbabilityMax) > todayIndex {
			baseForecast.Daily.PrecipitationProbabilityMax = baseForecast.Daily.PrecipitationProbabilityMax[todayIndex:]
		}
	}

	// 7. Trim Hourly so it starts from currentHourIdx (so frontend upcoming hours shows from now)
	if currentHourIdx > 0 && currentHourIdx < len(baseForecast.Hourly.Time) {
		baseForecast.Hourly.Time = baseForecast.Hourly.Time[currentHourIdx:]
		if len(baseForecast.Hourly.FreezingLevelHeight) > currentHourIdx {
			baseForecast.Hourly.FreezingLevelHeight = baseForecast.Hourly.FreezingLevelHeight[currentHourIdx:]
		}
		if len(baseForecast.Hourly.SnowDepth) > currentHourIdx {
			baseForecast.Hourly.SnowDepth = baseForecast.Hourly.SnowDepth[currentHourIdx:]
		}
		if len(baseForecast.Hourly.Snowfall) > currentHourIdx {
			baseForecast.Hourly.Snowfall = baseForecast.Hourly.Snowfall[currentHourIdx:]
		}
		if len(baseForecast.Hourly.Temperature2m) > currentHourIdx {
			baseForecast.Hourly.Temperature2m = baseForecast.Hourly.Temperature2m[currentHourIdx:]
		}
		if len(baseForecast.Hourly.ApparentTemperature) > currentHourIdx {
			baseForecast.Hourly.ApparentTemperature = baseForecast.Hourly.ApparentTemperature[currentHourIdx:]
		}
		if len(baseForecast.Hourly.PrecipitationProbability) > currentHourIdx {
			baseForecast.Hourly.PrecipitationProbability = baseForecast.Hourly.PrecipitationProbability[currentHourIdx:]
		}
		if len(baseForecast.Hourly.Precipitation) > currentHourIdx {
			baseForecast.Hourly.Precipitation = baseForecast.Hourly.Precipitation[currentHourIdx:]
		}
		if len(baseForecast.Hourly.Rain) > currentHourIdx {
			baseForecast.Hourly.Rain = baseForecast.Hourly.Rain[currentHourIdx:]
		}
		if len(baseForecast.Hourly.Showers) > currentHourIdx {
			baseForecast.Hourly.Showers = baseForecast.Hourly.Showers[currentHourIdx:]
		}
		if len(baseForecast.Hourly.CloudCover) > currentHourIdx {
			baseForecast.Hourly.CloudCover = baseForecast.Hourly.CloudCover[currentHourIdx:]
		}
		if len(baseForecast.Hourly.Visibility) > currentHourIdx {
			baseForecast.Hourly.Visibility = baseForecast.Hourly.Visibility[currentHourIdx:]
		}
		if len(baseForecast.Hourly.WindSpeed10m) > currentHourIdx {
			baseForecast.Hourly.WindSpeed10m = baseForecast.Hourly.WindSpeed10m[currentHourIdx:]
		}
		if len(baseForecast.Hourly.WindGusts10m) > currentHourIdx {
			baseForecast.Hourly.WindGusts10m = baseForecast.Hourly.WindGusts10m[currentHourIdx:]
		}
	}

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

func isSnowWeatherCode(code int) bool {
	switch code {
	case 71, 73, 75, 77, 85, 86:
		return true
	default:
		return false
	}
}

func parseElevationValue(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case string:
		if f, err := strconv.ParseFloat(val, 64); err == nil {
			return f
		}
	}
	return 0
}

func extractResortElevations(resort models.SkiResort) (float64, float64) {
	minElev := 0.0
	maxElev := 0.0
	if stats, ok := resort.Tags["statistics"].(map[string]interface{}); ok {
		if v := parseElevationValue(stats["minElevation"]); v > 0 {
			minElev = v
		}
		if v := parseElevationValue(stats["maxElevation"]); v > 0 {
			maxElev = v
		}

		if minElev == 0 || maxElev == 0 {
			if runs, ok := stats["runs"].(map[string]interface{}); ok {
				if minElev == 0 {
					minElev = parseElevationValue(runs["minElevation"])
				}
				if maxElev == 0 {
					maxElev = parseElevationValue(runs["maxElevation"])
				}
			}
		}

		if minElev == 0 || maxElev == 0 {
			if lifts, ok := stats["lifts"].(map[string]interface{}); ok {
				if minElev == 0 {
					minElev = parseElevationValue(lifts["minElevation"])
				}
				if maxElev == 0 {
					maxElev = parseElevationValue(lifts["maxElevation"])
				}
			}
		}
	}

	if minElev == 0 {
		minElev = parseElevationValue(resort.Tags["ele"])
	}
	if minElev == 0 {
		minElev = parseElevationValue(resort.Tags["elevation"])
	}

	if minElev > 0 && maxElev > 0 && maxElev < minElev {
		minElev, maxElev = maxElev, minElev
	} else if minElev > 0 && maxElev == 0 {
		maxElev = minElev + 500
	} else if maxElev > 0 && minElev == 0 {
		minElev = math.Max(0, maxElev-500)
	}

	return minElev, maxElev
}

func computeSnowReport(
	resortID, resortName string,
	baseElev, summitElev float64,
	baseForecast, summitForecast WeatherForecast,
	todayIndex, currentHourIdx int,
) SnowReport {
	// Helper to get snowfall from daily data
	getDailySnow := func(f WeatherForecast, i int) float64 {
		if i >= 0 && i < len(f.Daily.SnowfallSum) {
			return f.Daily.SnowfallSum[i]
		}
		return 0
	}
	getMaxDailySnow := func(i int) float64 {
		return math.Max(getDailySnow(baseForecast, i), getDailySnow(summitForecast, i))
	}

	// 1. Calculate 24h and 48h fresh snowfall from hourly data + daily data
	hourlySnow24h := 0.0
	hourlySnow48h := 0.0
	if currentHourIdx >= 0 {
		start24 := currentHourIdx - 23
		if start24 < 0 {
			start24 = 0
		}
		start48 := currentHourIdx - 47
		if start48 < 0 {
			start48 = 0
		}
		for h := start24; h <= currentHourIdx && h < len(baseForecast.Hourly.Snowfall); h++ {
			snowH := baseForecast.Hourly.Snowfall[h]
			if h < len(summitForecast.Hourly.Snowfall) && summitForecast.Hourly.Snowfall[h] > snowH {
				snowH = summitForecast.Hourly.Snowfall[h]
			}
			hourlySnow24h += snowH
		}
		for h := start48; h <= currentHourIdx && h < len(baseForecast.Hourly.Snowfall); h++ {
			snowH := baseForecast.Hourly.Snowfall[h]
			if h < len(summitForecast.Hourly.Snowfall) && summitForecast.Hourly.Snowfall[h] > snowH {
				snowH = summitForecast.Hourly.Snowfall[h]
			}
			hourlySnow48h += snowH
		}
	}

	dailySnowToday := getMaxDailySnow(todayIndex)
	dailySnowYesterday := getMaxDailySnow(todayIndex - 1)
	dailyBaseToday := getDailySnow(baseForecast, todayIndex)

	freshSnow24hCM := math.Round(math.Max(hourlySnow24h, dailySnowToday)*10) / 10
	freshSnow48hCM := math.Round(math.Max(hourlySnow48h, dailySnowToday+dailySnowYesterday)*10) / 10

	// 2. Snow Depths (Open-Meteo returns snow_depth in meters, convert to cm)
	baseDepthCM := math.Round(baseForecast.Current.SnowDepth * 100 * 10) / 10
	summitDepthCM := math.Round(summitForecast.Current.SnowDepth * 100 * 10) / 10

	// If fresh snow occurred, ground snow depth cannot be less than recent fresh snow
	if dailyBaseToday > baseDepthCM {
		baseDepthCM = dailyBaseToday
	}
	if freshSnow24hCM > summitDepthCM {
		summitDepthCM = freshSnow24hCM
	}
	if freshSnow48hCM > 0 && summitDepthCM < math.Round(freshSnow48hCM*0.8*10)/10 {
		summitDepthCM = math.Round(freshSnow48hCM*0.8*10) / 10
	}
	if summitDepthCM < baseDepthCM {
		summitDepthCM = baseDepthCM
	}

	// 3. Snowfall history from past days and forecast for coming days
	var lastSnowfallDate *string
	var lastSnowfallCM float64

	// Past snowfall detection (scan backwards from todayIndex)
	if todayIndex >= 0 {
		for i := todayIndex; i >= 0; i-- {
			snow := getMaxDailySnow(i)
			if snow > 0 {
				lastSnowfallCM = math.Round(snow*10) / 10
				if i < len(baseForecast.Daily.Time) {
					dStr := baseForecast.Daily.Time[i]
					lastSnowfallDate = &dStr
				}
				break
			}
		}
	}

	// Future 7-day snowfall sum starting today
	forecastSnow7dCM := 0.0
	if todayIndex >= 0 {
		for i := todayIndex; i < len(baseForecast.Daily.SnowfallSum) && i < todayIndex+7; i++ {
			forecastSnow7dCM += getMaxDailySnow(i)
		}
	}
	forecastSnow7dCM = math.Round(forecastSnow7dCM*10) / 10

	// 4. Freezing level height
	freezingLevel := 0.0
	if len(baseForecast.Hourly.FreezingLevelHeight) > 0 {
		if currentHourIdx >= 0 && currentHourIdx < len(baseForecast.Hourly.FreezingLevelHeight) {
			freezingLevel = baseForecast.Hourly.FreezingLevelHeight[currentHourIdx]
		} else {
			freezingLevel = baseForecast.Hourly.FreezingLevelHeight[len(baseForecast.Hourly.FreezingLevelHeight)-1]
		}
	}
	if freezingLevel == 0 && len(summitForecast.Hourly.FreezingLevelHeight) > 0 {
		if currentHourIdx >= 0 && currentHourIdx < len(summitForecast.Hourly.FreezingLevelHeight) {
			freezingLevel = summitForecast.Hourly.FreezingLevelHeight[currentHourIdx]
		}
	}

	// 5. Snow Condition / Quality
	snowCondition := "no_snow"
	snowConditionLabel := "Sin nieve"
	if baseDepthCM > 0 || summitDepthCM > 0 {
		effTemp := summitForecast.Current.Temperature2m
		if baseDepthCM > 0 && summitDepthCM > 0 {
			effTemp = (baseForecast.Current.Temperature2m + summitForecast.Current.Temperature2m) / 2.0
		} else if baseDepthCM > 0 {
			effTemp = baseForecast.Current.Temperature2m
		}

		maxWind := math.Max(baseForecast.Current.WindSpeed10m, summitForecast.Current.WindSpeed10m)
		maxRain := math.Max(baseForecast.Current.Rain, summitForecast.Current.Rain)

		if freshSnow24hCM >= 3.0 && effTemp <= 1.0 {
			snowCondition = "powder"
			snowConditionLabel = "Polvo"
		} else if effTemp > 3.0 || maxRain > 0.5 {
			snowCondition = "wet"
			snowConditionLabel = "Húmeda"
		} else if effTemp >= 0.0 && effTemp <= 5.0 && baseForecast.Current.WeatherCode <= 3 {
			snowCondition = "spring"
			snowConditionLabel = "Primavera"
		} else if effTemp < 0.0 && maxWind > 25.0 {
			snowCondition = "hard_packed"
			snowConditionLabel = "Dura / Venteada"
		} else {
			snowCondition = "packed_powder"
			snowConditionLabel = "Polvo dura"
		}
	}

	// 6. European Avalanche Danger Level (1 to 5)
	dangerLevel := 1
	windRisk := "Bajo"
	freshSnowRisk := "Bajo"

	maxGust := summitForecast.Current.WindGusts10m
	if baseForecast.Current.WindGusts10m > maxGust {
		maxGust = baseForecast.Current.WindGusts10m
	}

	if summitDepthCM >= 15.0 {
		if freshSnow24hCM >= 35.0 || freshSnow48hCM >= 50.0 {
			dangerLevel += 2
			freshSnowRisk = "Muy Alto"
		} else if freshSnow24hCM >= 15.0 || freshSnow48hCM >= 25.0 {
			dangerLevel += 1
			freshSnowRisk = "Alto"
		} else if freshSnow24hCM >= 5.0 {
			freshSnowRisk = "Moderado"
		}

		if maxGust >= 55.0 && (freshSnow48hCM >= 8.0 || summitDepthCM >= 30.0) {
			dangerLevel += 1
			windRisk = "Alto"
		} else if maxGust >= 40.0 && freshSnow48hCM >= 5.0 && dangerLevel < 4 {
			dangerLevel += 1
			windRisk = "Moderado"
		}

		if summitForecast.Current.Rain > 1.0 || (summitForecast.Current.Temperature2m > 5.0 && summitDepthCM >= 30.0) {
			if dangerLevel < 4 {
				dangerLevel += 1
			}
		}
	}

	if dangerLevel > 5 {
		dangerLevel = 5
	}
	if dangerLevel < 1 {
		dangerLevel = 1
	}

	dangerTitles := map[int]string{
		1: "Débil",
		2: "Moderado",
		3: "Notable",
		4: "Fuerte",
		5: "Muy Fuerte",
	}
	dangerColors := map[int]string{
		1: "#22c55e",
		2: "#eab308",
		3: "#f97316",
		4: "#ef4444",
		5: "#7f1d1d",
	}

	windDeg := summitForecast.Current.WindDirection10m
	var dangerousAspects []string
	if windDeg >= 337 || windDeg < 23 {
		dangerousAspects = []string{"SE", "S", "SW"}
	} else if windDeg >= 23 && windDeg < 68 {
		dangerousAspects = []string{"S", "SW", "W"}
	} else if windDeg >= 68 && windDeg < 113 {
		dangerousAspects = []string{"SW", "W", "NW"}
	} else if windDeg >= 113 && windDeg < 158 {
		dangerousAspects = []string{"W", "NW", "N"}
	} else if windDeg >= 158 && windDeg < 203 {
		dangerousAspects = []string{"NW", "N", "NE"}
	} else if windDeg >= 203 && windDeg < 248 {
		dangerousAspects = []string{"N", "NE", "E"}
	} else if windDeg >= 248 && windDeg < 293 {
		dangerousAspects = []string{"NE", "E", "SE"}
	} else {
		dangerousAspects = []string{"E", "SE", "S"}
	}

	critElevation := freezingLevel
	if critElevation == 0 || critElevation < baseElev {
		critElevation = baseElev + (summitElev-baseElev)*0.5
	}
	critElevation = math.Round(critElevation)

	summary := fmt.Sprintf(
		"Peligro %s (Nivel %d/5). Especial precaución en laderas sotavento por encima de los %.0fm debido a la acumulación de viento y transporte de nieve.",
		dangerTitles[dangerLevel], dangerLevel, critElevation,
	)
	if dangerLevel == 1 {
		summary = "Manto nivoso generalmente bien estabilizado en la mayor parte de las pendientes. Riesgo bajo de aludes espontáneos."
	}

	avalancheReport := AvalancheReport{
		DangerLevel:        dangerLevel,
		DangerLevelTitle:   dangerTitles[dangerLevel],
		DangerColor:        dangerColors[dangerLevel],
		CriticalElevationM: critElevation,
		DangerousAspects:   dangerousAspects,
		Summary:            summary,
		WindRisk:           windRisk,
		FreshSnowRisk:      freshSnowRisk,
		Confidence:         "estimated_openmeteo",
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
		AvalancheReport:      avalancheReport,
		DataSource:           "open-meteo",
		GeneratedAt:          time.Now(),
	}
}
