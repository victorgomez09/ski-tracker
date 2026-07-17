package server

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	"github.com/victorgomez09/ski-tracker/internal/api/middleware"
	v1 "github.com/victorgomez09/ski-tracker/internal/api/v1"
	"github.com/victorgomez09/ski-tracker/internal/service"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

// RouterDeps holds dependencies required by the router.
type RouterDeps struct {
	Services *service.Container
	// JWTManager  *auth.JWTManager
	Store       store.Store
	AppURL      string
	SetupSecret string
	Logger      *slog.Logger
}

// NewRouter creates and configures the Gin engine with all routes.
func NewRouter(deps *RouterDeps) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	// Global middleware
	r.Use(
		middleware.Recovery(deps.Logger),
		middleware.Branding(),
		middleware.RequestID(),
		middleware.Logger(deps.Logger),
		middleware.CORS(),
	)

	// Health check
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// API v1
	apiV1 := r.Group("/api/v1")
	{
		// Public routes
		skiResortHandler := v1.NewSkiResortHandler(deps.Services.SkiResort, deps.Store)
		apiV1.GET("/resorts/nearby", skiResortHandler.ListNearby)
		apiV1.GET("/resorts/by-name", skiResortHandler.ListByName)
		apiV1.GET("/resorts/bbox", skiResortHandler.ListByBBox)
	}

	return r
}
