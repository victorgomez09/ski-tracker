package service

import (
	"testing"
	"time"
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

	// Verify Fresh Snow and Forecast
	if report.FreshSnow24hCM != 15.0 {
		t.Errorf("expected fresh snow 24h 15.0cm, got %.1f", report.FreshSnow24hCM)
	}
	if report.ForecastSnow7dCM <= 0 {
		t.Errorf("expected forecast snow 7d > 0, got %.1f", report.ForecastSnow7dCM)
	}
}
