package v1

import (
	"fmt"
	"time"

	"github.com/gin-contrib/cache"
	"github.com/gin-contrib/cache/persistence"
	"github.com/gin-gonic/gin"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
	"github.com/victorgomez09/ski-tracker/internal/service"
)

type WeatherHandler struct {
	svc   *service.WeatherService
	store *persistence.InMemoryStore
}

func NewWeatherHandler(svc *service.WeatherService, s *persistence.InMemoryStore) *WeatherHandler {
	return &WeatherHandler{svc: svc, store: s}
}

func (h *WeatherHandler) GetWeather(c *gin.Context) {
	lat := c.DefaultQuery("lat", "40.4168")
	lon := c.DefaultQuery("lon", "-3.7038")
	resortID := c.Query("resort_id")

	c.Request.Header.Del("Cache-Control")
	c.Request.Header.Del("Pragma")

	handler := cache.CachePage(h.store, 1*time.Hour, func(c *gin.Context) {
		fmt.Printf("[NO-CACHE] Fetching weather data from API (lat=%s, lon=%s, resort_id=%s)...\n", lat, lon, resortID)
		weatherData, err := h.svc.GetWeather(c, lat, lon, resortID)
		if err != nil {
			httputil.RespondError(c, fmt.Errorf("could not get weather forecast: %w", err))
			return
		}

		httputil.RespondOK(c, weatherData)
	})

	handler(c)
}

func (h *WeatherHandler) GetSnowReport(c *gin.Context) {
	resortID := c.Param("id")
	if resortID == "" {
		httputil.RespondError(c, fmt.Errorf("missing resort id"))
		return
	}

	c.Request.Header.Del("Cache-Control")
	c.Request.Header.Del("Pragma")

	handler := cache.CachePage(h.store, 1*time.Hour, func(c *gin.Context) {
		fmt.Printf("[NO-CACHE] Fetching snow report from API (resort_id=%s)...\n", resortID)
		report, err := h.svc.GetSnowReport(c, resortID)
		if err != nil {
			httputil.RespondError(c, fmt.Errorf("could not get snow report: %w", err))
			return
		}

		httputil.RespondOK(c, report)
	})

	handler(c)
}
