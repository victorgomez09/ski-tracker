package service

import (
	"context"
	"testing"
	"time"

	"github.com/victorgomez09/ski-tracker/internal/models"
)

func TestComputeSnowReport(t *testing.T) {
	todayStr := time.Now().Format("2006-01-02")
	yesterdayStr := time.Now().AddDate(0, 0, -1).Format("2006-01-02")

	baseForecast := WeatherForecast{
		Elevation: 1800,
		Current: CurrentWeather{
			Temperature2m:    -2.0,
			SnowDepth:        0.45, // 45 cm
			WeatherCode:      71,   // Snowfall
			WindSpeed10m:     15.0,
			WindGusts10m:     25.0,
			WindDirection10m: 180,
			IsDay:            1,
			Time:             "2026-10-28T08:00",
		},
		Hourly: HourlyData{
			FreezingLevelHeight: []float64{1600.0, 1650.0},
		},
		Daily: DailyData{
			Time:        []string{yesterdayStr, todayStr},
			SnowfallSum: []float64{10.0, 15.0},
		},
	}

	summitForecast := WeatherForecast{
		Elevation: 2300,
		Current: CurrentWeather{
			Temperature2m:    -5.0,
			SnowDepth:        0.80, // 80 cm
			WeatherCode:      71,
			WindSpeed10m:     30.0,
			WindGusts10m:     45.0,
			WindDirection10m: 180,
			IsDay:            1,
			Time:             "2026-10-28T08:00",
		},
		Hourly: HourlyData{
			FreezingLevelHeight: []float64{1600.0, 1650.0},
		},
		Daily: DailyData{
			Time:        []string{yesterdayStr, todayStr},
			SnowfallSum: []float64{15.0, 20.0},
		},
	}

	report := computeSnowReport(
		"test-resort-id",
		"Sierra Nevada Test",
		1800,
		2300,
		baseForecast,
		summitForecast,
		1,
		0,
	)

	// Verify Snow Depths
	if report.SnowDepthBaseCM != 45.0 {
		t.Errorf("expected base snow depth 45cm, got %.1f", report.SnowDepthBaseCM)
	}
	if report.SnowDepthSummitCM != 80.0 {
		t.Errorf("expected summit snow depth 80cm, got %.1f", report.SnowDepthSummitCM)
	}

	// Verify Snow Condition (Fresh snow with cold temp -> powder)
	if report.SnowCondition != "powder" {
		t.Errorf("expected snow condition 'powder', got %s", report.SnowCondition)
	}

	// Verify Fresh Snow takes the max between base and summit (summit = 20.0)
	if report.FreshSnow24hCM != 20.0 {
		t.Errorf("expected fresh snow 24h 20.0cm, got %.1f", report.FreshSnow24hCM)
	}
	if report.FreshSnow48hCM != 35.0 { // 20.0 (today) + 15.0 (yesterday)
		t.Errorf("expected fresh snow 48h 35.0cm, got %.1f", report.FreshSnow48hCM)
	}
	if report.ForecastSnow7dCM <= 0 {
		t.Errorf("expected forecast snow 7d > 0, got %.1f", report.ForecastSnow7dCM)
	}

	// Verify Avalanche Report
	if report.AvalancheReport.DangerLevel < 1 || report.AvalancheReport.DangerLevel > 5 {
		t.Errorf("expected avalanche danger level between 1 and 5, got %d", report.AvalancheReport.DangerLevel)
	}
	if report.AvalancheReport.DangerLevelTitle == "" {
		t.Errorf("expected non-empty danger level title")
	}
	if report.AvalancheReport.Summary == "" {
		t.Errorf("expected non-empty avalanche summary")
	}
}

func TestComputeSnowReportCerlerScenario(t *testing.T) {
	// In Cerler: base has 0 snowfall and 4.2°C temp.
	// Summit has 1.26cm snowfall on yesterday and 0.98cm coming in 5 days, -4.3°C temp.
	todayStr := time.Now().Format("2006-01-02")
	yesterdayStr := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	futureDayStr := time.Now().AddDate(0, 0, 5).Format("2006-01-02")

	baseForecast := WeatherForecast{
		Elevation: 1503,
		Current: CurrentWeather{
			Temperature2m: 4.2,
			SnowDepth:     0.0,
			WeatherCode:   0,
		},
		Daily: DailyData{
			Time:        []string{yesterdayStr, todayStr, futureDayStr},
			SnowfallSum: []float64{0.0, 0.0, 0.0},
		},
	}

	summitForecast := WeatherForecast{
		Elevation: 2618,
		Current: CurrentWeather{
			Temperature2m: -4.3,
			SnowDepth:     0.01, // 1cm
			WeatherCode:   3,
		},
		Daily: DailyData{
			Time:        []string{yesterdayStr, todayStr, futureDayStr},
			SnowfallSum: []float64{1.26, 0.0, 0.98},
		},
	}

	report := computeSnowReport(
		"cerler-id",
		"Aramón Cerler",
		1503,
		2618,
		baseForecast,
		summitForecast,
		1,
		0,
	)

	// Past snowfall detection should find yesterday's 1.3 cm snowfall at summit
	if report.LastSnowfallDate == nil || *report.LastSnowfallDate != yesterdayStr {
		t.Errorf("expected last snowfall date %s, got %v", yesterdayStr, report.LastSnowfallDate)
	}
	if report.LastSnowfallAmountCM != 1.3 {
		t.Errorf("expected last snowfall amount 1.3cm, got %.1f", report.LastSnowfallAmountCM)
	}

	// 48h fresh snow should include yesterday's snowfall
	if report.FreshSnow48hCM != 1.3 {
		t.Errorf("expected fresh snow 48h 1.3cm, got %.1f", report.FreshSnow48hCM)
	}

	// 7d forecast should include the future snowfall (0.98 -> 1.0cm)
	if report.ForecastSnow7dCM != 1.0 {
		t.Errorf("expected 7d forecast 1.0cm, got %.1f", report.ForecastSnow7dCM)
	}

	// Summit snow depth should be at least 1.0cm
	if report.SnowDepthSummitCM < 1.0 {
		t.Errorf("expected summit snow depth >= 1.0cm, got %.1f", report.SnowDepthSummitCM)
	}

	// Snow condition at summit should be packed_powder, NOT no_snow
	if report.SnowCondition == "no_snow" {
		t.Errorf("expected condition not to be no_snow, got %s", report.SnowCondition)
	}
}

func TestExtractResortElevations(t *testing.T) {
	// Nested tags as stored in PostgreSQL for Cerler
	resort := models.SkiResort{
		Name: "Aramón Cerler",
		Tags: map[string]interface{}{
			"statistics": map[string]interface{}{
				"minElevation": 1503.1,
				"maxElevation": 2617.6,
				"runs": map[string]interface{}{
					"minElevation": 1503.1,
					"maxElevation": 2617.6,
				},
				"lifts": map[string]interface{}{
					"minElevation": 1128.5,
					"maxElevation": 2618.2,
				},
			},
		},
	}

	minE, maxE := extractResortElevations(resort)
	if minE != 1503.1 || maxE != 2617.6 {
		t.Errorf("expected 1503.1 and 2617.6, got %.1f and %.1f", minE, maxE)
	}
}

func TestGetSpainAndAndorraSnowForecast(t *testing.T) {
	svc := NewWeatherService(nil, nil)
	forecasts, err := svc.GetSpainAndAndorraSnowForecast(context.Background())
	if err != nil {
		t.Fatalf("unexpected error fetching snow forecast: %v", err)
	}

	if len(forecasts) == 0 {
		t.Fatal("expected at least 1 resort forecast")
	}

	foundSierraNevada := false
	foundGrandvalira := false

	for _, f := range forecasts {
		if f.ID == "sierra-nevada" {
			foundSierraNevada = true
			if f.Country != "Spain" {
				t.Errorf("expected Spain for Sierra Nevada, got %s", f.Country)
			}
		}
		if f.ID == "grandvalira" {
			foundGrandvalira = true
			if f.Country != "Andorra" {
				t.Errorf("expected Andorra for Grandvalira, got %s", f.Country)
			}
		}
	}

	if !foundSierraNevada {
		t.Error("expected Sierra Nevada in forecasts")
	}
	if !foundGrandvalira {
		t.Error("expected Grandvalira in forecasts")
	}
}
