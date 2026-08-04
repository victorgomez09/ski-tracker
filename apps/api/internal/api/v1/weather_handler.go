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

	c.Request.Header.Del("Cache-Control")
	c.Request.Header.Del("Pragma")

	handler := cache.CachePage(h.store, 1*time.Hour, func(c *gin.Context) {
		fmt.Println("[NO-CACHE] Fetching weather data from API...")
		weatherData, err := h.svc.GetWeather(c, lat, lon)
		if err != nil {
			httputil.RespondError(c, fmt.Errorf("could not get weather forecast: %w", err))
			return
		}

		httputil.RespondOK(c, weatherData)
	})

	handler(c)
}
