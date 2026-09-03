package service

import (
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/victorgomez09/ski-tracker/internal/models"
)

func TestNormalizeActivityType(t *testing.T) {
	tests := []struct {
		input    string
		fallback string
		expected string
	}{
		{"ski", "", "ski"},
		{"SKI", "", "ski"},
		{"Snowboard", "", "snowboard"},
		{"walk", "", "walk"},
		{"HIKE", "", "hike"},
		{"bike", "", "bike"},
		{"car", "", "car"},
		{"general", "", "general"},
		{"", "walk", "walk"},
		{"", "", "ski"},
		{"unknown_activity", "", "unknown_activity"},
	}

	for _, tt := range tests {
		result := normalizeActivityType(tt.input, tt.fallback)
		if result != tt.expected {
			t.Errorf("normalizeActivityType(%q, %q) = %q; expected %q", tt.input, tt.fallback, result, tt.expected)
		}
	}
}

func TestIsSnowActivity(t *testing.T) {
	snowActivities := []string{"ski", "SKI", "snowboard", "Snowboard", "snow", "SNOW"}
	for _, act := range snowActivities {
		if !isSnowActivity(act) {
			t.Errorf("isSnowActivity(%q) should be true", act)
		}
	}

	outdoorActivities := []string{"walk", "hike", "bike", "car", "general", "running"}
	for _, act := range outdoorActivities {
		if isSnowActivity(act) {
			t.Errorf("isSnowActivity(%q) should be false", act)
		}
	}
}

func TestCalculateDistance3DMeters(t *testing.T) {
	p1 := models.SessionPoint{
		Geom:     "SRID=4326;POINT(0.0000 0.0000)",
		Altitude: 1000.0,
	}
	p2 := models.SessionPoint{
		Geom:     "SRID=4326;POINT(0.0000 0.0000)", // Same coordinates, 100m vertical
		Altitude: 1100.0,
	}

	d2D, d3D := calculateDistance3DMeters(p1, p2)
	if d2D != 0 {
		t.Errorf("expected 2D distance 0, got %f", d2D)
	}
	if math.Abs(d3D-100.0) > 0.001 {
		t.Errorf("expected 3D distance 100.0, got %f", d3D)
	}
}

func TestCalculateElevationGainLossHysteresis(t *testing.T) {
	// Scenario: flat walk with GPS noise oscillating +/- 0.8m around 1000m
	// With threshold = 2.0m, gain and loss should both be 0.
	noisyPoints := []models.SessionPoint{
		{Altitude: 1000.0},
		{Altitude: 1000.8},
		{Altitude: 999.3},
		{Altitude: 1000.5},
		{Altitude: 999.7},
		{Altitude: 1000.0},
	}

	gain, loss := calculateElevationGainLossHysteresis(noisyPoints, 2.0)
	if gain != 0 || loss != 0 {
		t.Errorf("expected 0 gain and 0 loss for micro noise, got gain=%f, loss=%f", gain, loss)
	}

	// Scenario 2: Clear hill climb of 50m, small dip of 0.5m (ignored), continue climb of 50m, then descent of 100m
	profilePoints := []models.SessionPoint{
		{Altitude: 1000.0},
		{Altitude: 1050.0}, // +50m
		{Altitude: 1049.5}, // -0.5m (within 2m noise band, ignored)
		{Altitude: 1100.0}, // +50m (total climb: +100m)
		{Altitude: 1000.0}, // -100m descent (total loss: 100m)
	}

	gain, loss = calculateElevationGainLossHysteresis(profilePoints, 2.0)
	if math.Abs(gain-100.0) > 0.01 {
		t.Errorf("expected gain ~100.0m, got %f", gain)
	}
	if math.Abs(loss-100.0) > 0.01 {
		t.Errorf("expected loss ~100.0m, got %f", loss)
	}
}

func TestCalculateOutdoorSessionMetrics(t *testing.T) {
	svc := &SkiSessionService{}

	baseTime := time.Date(2026, 9, 3, 10, 0, 0, 0, time.UTC)

	// Create 100 points, 1 second apart, covering ~1km walk at 1.4 m/s (~5 km/h)
	points := make([]models.SessionPoint, 0, 100)
	lat := 42.0
	lon := 1.0
	alt := 1500.0

	for i := 0; i < 100; i++ {
		ts := baseTime.Add(time.Duration(i) * time.Second)
		// Approx 0.000012 degrees lat is ~1.33 meters
		lat += 0.000012
		// Ascend 10cm per point -> 10 meters total climb over 100 points
		alt += 0.1
		speed := 1.4 // m/s

		points = append(points, models.SessionPoint{
			Geom:      fmt.Sprintf("POINT(%f %f)", lon, lat),
			Altitude:  alt,
			Speed:     speed,
			Timestamp: ts,
		})
	}

	endTime := baseTime.Add(100 * time.Second)
	metrics := svc.calculateOutdoorSessionMetrics(points, "walk", baseTime, &endTime)

	if metrics.TotalDistance <= 0 {
		t.Errorf("expected positive total distance, got %f", metrics.TotalDistance)
	}
	if metrics.MovingTime <= 0 {
		t.Errorf("expected positive moving time, got %d", metrics.MovingTime)
	}
	if metrics.AvgSpeed <= 0 {
		t.Errorf("expected positive average speed, got %f", metrics.AvgSpeed)
	}
	if metrics.ElevationGain < 9.0 || metrics.ElevationGain > 11.0 {
		t.Errorf("expected elevation gain ~10m, got %f", metrics.ElevationGain)
	}
	if metrics.Pace <= 0 {
		t.Errorf("expected positive pace in min/km, got %f", metrics.Pace)
	}
}
