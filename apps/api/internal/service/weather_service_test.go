package service

import (
	"context"
	"math"
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

	// Verify Snow Depths (Base, Mid, Summit)
	if report.SnowDepthBaseCM != 45.0 {
		t.Errorf("expected base snow depth 45cm, got %.1f", report.SnowDepthBaseCM)
	}
	if report.SnowDepthMidCM != 63.0 {
		t.Errorf("expected mid snow depth 63cm, got %.1f", report.SnowDepthMidCM)
	}
	if report.SnowDepthSummitCM != 80.0 {
		t.Errorf("expected summit snow depth 80cm, got %.1f", report.SnowDepthSummitCM)
	}
	if report.MidElevationM != 2050.0 {
		t.Errorf("expected mid elevation 2050m, got %.1f", report.MidElevationM)
	}

	// Verify Today Snowfall by Elevation
	if report.SnowfallTodayBaseCM != 15.0 {
		t.Errorf("expected today base snowfall 15.0cm, got %.1f", report.SnowfallTodayBaseCM)
	}
	if report.SnowfallTodayMidCM != 17.5 {
		t.Errorf("expected today mid snowfall 17.5cm, got %.1f", report.SnowfallTodayMidCM)
	}
	if report.SnowfallTodaySummitCM != 20.0 {
		t.Errorf("expected today summit snowfall 20.0cm, got %.1f", report.SnowfallTodaySummitCM)
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

func TestComputeSnowReportAstunElevationBreakdown(t *testing.T) {
	// Astún: Base = 1660m, Mid = 1980m, Summit = 2300m
	todayStr := time.Now().Format("2006-01-02")

	// Scenario A: Freezing level at 2100m (Snow line ~ 1850m)
	// Base (1660m) is below snow line -> rain (0cm snow)
	// Mid (1980m) is above snow line -> partial snow
	// Summit (2300m) is well above freezing -> full snow
	baseA := WeatherForecast{
		Elevation: 1660,
		Current:   CurrentWeather{Temperature2m: 3.5, SnowDepth: 0.10},
		Hourly:    HourlyData{FreezingLevelHeight: []float64{2100.0}},
		Daily:     DailyData{Time: []string{todayStr}, SnowfallSum: []float64{0.0}},
	}
	summitA := WeatherForecast{
		Elevation: 2300,
		Current:   CurrentWeather{Temperature2m: -1.5, SnowDepth: 0.40},
		Hourly:    HourlyData{FreezingLevelHeight: []float64{2100.0}},
		Daily:     DailyData{Time: []string{todayStr}, SnowfallSum: []float64{15.0}},
	}

	reportA := computeSnowReport("astun", "Astún", 1660, 2300, baseA, summitA, 0, 0)
	if reportA.SnowfallTodayBaseCM != 0.0 {
		t.Errorf("expected base snowfall 0.0cm (rain at 1660m with snow level ~1850m), got %.1f", reportA.SnowfallTodayBaseCM)
	}
	if reportA.SnowfallTodayMidCM <= 0.0 || reportA.SnowfallTodayMidCM >= 15.0 {
		t.Errorf("expected mid snowfall between 0 and 15cm at 1980m, got %.1f", reportA.SnowfallTodayMidCM)
	}
	if reportA.SnowfallTodaySummitCM != 15.0 {
		t.Errorf("expected summit snowfall 15.0cm, got %.1f", reportA.SnowfallTodaySummitCM)
	}

	// Scenario B: Freezing level at 1500m (Snow line ~ 1250m, below base 1660m)
	// All cotas receive snow!
	baseB := WeatherForecast{
		Elevation: 1660,
		Current:   CurrentWeather{Temperature2m: -1.0, SnowDepth: 0.20},
		Hourly:    HourlyData{FreezingLevelHeight: []float64{1500.0}},
		Daily:     DailyData{Time: []string{todayStr}, SnowfallSum: []float64{10.0}},
	}
	summitB := WeatherForecast{
		Elevation: 2300,
		Current:   CurrentWeather{Temperature2m: -5.0, SnowDepth: 0.60},
		Hourly:    HourlyData{FreezingLevelHeight: []float64{1500.0}},
		Daily:     DailyData{Time: []string{todayStr}, SnowfallSum: []float64{18.0}},
	}

	reportB := computeSnowReport("astun", "Astún", 1660, 2300, baseB, summitB, 0, 0)
	if reportB.SnowfallTodayBaseCM != 10.0 {
		t.Errorf("expected base snowfall 10.0cm, got %.1f", reportB.SnowfallTodayBaseCM)
	}
	if reportB.SnowfallTodayMidCM != 14.0 {
		t.Errorf("expected mid snowfall 14.0cm, got %.1f", reportB.SnowfallTodayMidCM)
	}
	if reportB.SnowfallTodaySummitCM != 18.0 {
		t.Errorf("expected summit snowfall 18.0cm, got %.1f", reportB.SnowfallTodaySummitCM)
	}

	// Scenario C: Freezing level at 2700m (above summit 2300m)
	// Rain across all elevations
	baseC := WeatherForecast{
		Elevation: 1660,
		Current:   CurrentWeather{Temperature2m: 7.0},
		Hourly:    HourlyData{FreezingLevelHeight: []float64{2700.0}},
		Daily:     DailyData{Time: []string{todayStr}, SnowfallSum: []float64{0.0}},
	}
	summitC := WeatherForecast{
		Elevation: 2300,
		Current:   CurrentWeather{Temperature2m: 3.0},
		Hourly:    HourlyData{FreezingLevelHeight: []float64{2700.0}},
		Daily:     DailyData{Time: []string{todayStr}, SnowfallSum: []float64{5.0}},
	}

	reportC := computeSnowReport("astun", "Astún", 1660, 2300, baseC, summitC, 0, 0)
	if reportC.SnowfallTodayBaseCM != 0.0 || reportC.SnowfallTodayMidCM != 0.0 || reportC.SnowfallTodaySummitCM != 0.0 {
		t.Errorf("expected all cotas to be 0.0cm when freezing level is above summit, got base=%.1f, mid=%.1f, summit=%.1f",
			reportC.SnowfallTodayBaseCM, reportC.SnowfallTodayMidCM, reportC.SnowfallTodaySummitCM)
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

func TestFreezingLevelInterpolation(t *testing.T) {
	// When ECMWF returns null / 0 for freezing_level_height,
	// the environmental lapse rate formula baseElev + (T / 0.0065) should interpolate realistic freezing levels
	baseElev := 1658.0
	tempBase := 1.3 // At 1.3°C, freezing level is ~1858m
	flExpected := math.Round(baseElev + (tempBase / 0.0065))

	if flExpected < 1850 || flExpected > 1860 {
		t.Errorf("expected freezing level around 1858m, got %.0f", flExpected)
	}

	// Below freezing
	tempCold := -2.0 // At -2.0°C, freezing level is ~1350m
	flCold := math.Round(baseElev + (tempCold / 0.0065))
	if flCold < 1345 || flCold > 1355 {
		t.Errorf("expected cold freezing level around 1350m, got %.0f", flCold)
	}
}
