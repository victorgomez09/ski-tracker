package v1

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-contrib/cache/persistence"
	"github.com/gin-gonic/gin"
	"github.com/victorgomez09/ski-tracker/internal/service"
)

func TestWeatherHandlerCaching(t *testing.T) {
	gin.SetMode(gin.TestMode)

	memStore := persistence.NewInMemoryStore(1 * time.Hour)
	weatherSvc := service.NewWeatherService(nil, nil)
	handler := NewWeatherHandler(weatherSvc, memStore)

	r := gin.New()
	r.GET("/api/v1/weather", handler.GetWeather)
	r.GET("/api/v1/resorts/:id/snow-report", handler.GetSnowReport)

	// Query coordinates
	targetURL := "/api/v1/weather?lat=37.09&lon=-3.40"

	// 1st request: Misses cache, calls Open-Meteo API
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest(http.MethodGet, targetURL, nil)
	r.ServeHTTP(w1, req1)

	if w1.Code != http.StatusOK {
		t.Fatalf("expected status 200 on first call, got %d. Body: %s", w1.Code, w1.Body.String())
	}

	var resp1 map[string]interface{}
	if err := json.Unmarshal(w1.Body.Bytes(), &resp1); err != nil {
		t.Fatalf("failed to decode response 1: %v", err)
	}

	// Verify snow_report is present
	snowReport, hasReport := resp1["snow_report"].(map[string]interface{})
	if !hasReport || snowReport == nil {
		t.Fatalf("expected snow_report in weather data: %v", resp1)
	}

	// 2nd request: Hits in-memory cache directly
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodGet, targetURL, nil)
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("expected status 200 on cached call, got %d", w2.Code)
	}

	// Ensure both responses have identical payload (served from cache)
	if w1.Body.String() != w2.Body.String() {
		t.Errorf("expected cached response to match original response exactly")
	}
}
