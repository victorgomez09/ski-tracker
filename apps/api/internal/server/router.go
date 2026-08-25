package server

import (
	"log/slog"
	"strings"

	"github.com/gin-contrib/cache/persistence"
	"github.com/gin-gonic/gin"
	"github.com/victorgomez09/ski-tracker/internal/api/auth"
	"github.com/victorgomez09/ski-tracker/internal/api/middleware"
	v1 "github.com/victorgomez09/ski-tracker/internal/api/v1"
	"github.com/victorgomez09/ski-tracker/internal/service"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

// RouterDeps holds dependencies required by the router.
type RouterDeps struct {
	Services         *service.Container
	JWTManager       *auth.JWTManager
	Store            store.Store
	AppURL           string
	SetupSecret      string
	OTAPublishSecret string
	Logger           *slog.Logger
	Cache            *persistence.InMemoryStore
	APIPublicURL     string
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
		// User routes
		userHandler := v1.NewUserHandler(deps.Services.User, deps.Store)
		apiV1.POST("/auth/login", userHandler.Login)
		apiV1.POST("/auth/register", userHandler.Create)

		// Expo Updates protocol (must be public: expo-updates does not send a JWT)
		otaHandler := v1.NewOTAHandler(deps.Services.OTA, deps.APIPublicURL)
		apiV1.GET("/ota/manifest", otaHandler.Manifest)
		apiV1.GET("/ota/assets", otaHandler.Assets)

		// OTA publish route - supports both static API Key (for CI/CD) and JWT
		otaPublishAuth := func(c *gin.Context) {
			header := c.GetHeader("Authorization")
			if header != "" {
				parts := strings.SplitN(header, " ", 2)
				if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
					token := parts[1]
					if deps.OTAPublishSecret != "" && token == deps.OTAPublishSecret {
						c.Next()
						return
					}
				}
			}
			middleware.Auth(deps.JWTManager)(c)
		}
		apiV1.POST("/ota/publish", otaPublishAuth, otaHandler.Publish)

		protected := apiV1.Group("")
		protected.Use(middleware.Auth(deps.JWTManager))
		{
			// Resort routes
			skiResortHandler := v1.NewSkiResortHandler(deps.Services.SkiResort, deps.Store)
			protected.GET("/resorts/bbox", skiResortHandler.ListByBBox)
			protected.GET("/resorts/nearby", skiResortHandler.ListNearby)
			protected.GET("/resorts/by-name", skiResortHandler.ListByName)
			protected.GET("/resorts/by-id/:id", skiResortHandler.GetByID)
			protected.GET("/resorts/closeness", skiResortHandler.GetByCloseness)

			// Ski session routes
			skiSessionHandler := v1.NewSkiSessionHandler(deps.Services.SkiSession, deps.Store)
			protected.GET("/ski-sessions", skiSessionHandler.List)
			protected.GET("/ski-sessions/by-resort", skiSessionHandler.ListByResort)
			protected.GET("/ski-sessions/:id", skiSessionHandler.GetSession)
			protected.POST("/ski-sessions", skiSessionHandler.StartSession)
			protected.POST("/ski-sessions/:id/points", skiSessionHandler.AddPoints)
			protected.POST("/ski-sessions/:id/finish", skiSessionHandler.FinishSession)
			protected.GET("/ski-sessions/photos/*path", skiSessionHandler.GetPhoto)

			// User routes
			userHandler := v1.NewUserHandler(deps.Services.User, deps.Store)
			protected.GET("/users/me", userHandler.GetMe)
			protected.GET("/users/:id", userHandler.GetByID)
			protected.GET("/users", userHandler.GetByEmail)
			protected.PUT("/users/:id", userHandler.Update)
			protected.DELETE("/users/:id", userHandler.Delete)

			// Weather routes
			weatherHandler := v1.NewWeatherHandler(deps.Services.Weather, deps.Cache)
			protected.GET("/weather", weatherHandler.GetWeather)
		}
	}

	return r
}
