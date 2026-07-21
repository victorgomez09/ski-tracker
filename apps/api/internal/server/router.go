package server

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	"github.com/victorgomez09/ski-tracker/internal/api/auth"
	"github.com/victorgomez09/ski-tracker/internal/api/middleware"
	v1 "github.com/victorgomez09/ski-tracker/internal/api/v1"
	"github.com/victorgomez09/ski-tracker/internal/service"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

// RouterDeps holds dependencies required by the router.
type RouterDeps struct {
	Services    *service.Container
	JWTManager  *auth.JWTManager
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
		// User routes
		userHandler := v1.NewUserHandler(deps.Services.User, deps.Store)
		apiV1.POST("/auth/login", userHandler.Login)
		apiV1.POST("/auth/register", userHandler.Create)

		protected := apiV1.Group("")
		protected.Use(middleware.Auth(deps.JWTManager))
		{
			// Resort routes
			skiResortHandler := v1.NewSkiResortHandler(deps.Services.SkiResort, deps.Store)
			protected.GET("/resorts/bbox", skiResortHandler.ListByBBox)
			protected.GET("/resorts/nearby", skiResortHandler.ListNearby)
			protected.GET("/resorts/by-name", skiResortHandler.ListByName)
			protected.GET("/resorts/closeness", skiResortHandler.GetByCloseness)

			// Ski session routes
			skiSessionHandler := v1.NewSkiSessionHandler(deps.Services.SkiSession, deps.Store)
			protected.POST("/ski-sessions", skiSessionHandler.StartSession)
			protected.POST("/ski-sessions/:id/points", skiSessionHandler.AddPoints)
			protected.POST("/ski-sessions/:id/finish", skiSessionHandler.FinishSession)

			// User routes
			userHandler := v1.NewUserHandler(deps.Services.User, deps.Store)
			protected.GET("/users/me", userHandler.GetMe)
			protected.GET("/users/:id", userHandler.GetByID)
			protected.GET("/users", userHandler.GetByEmail)
			protected.PUT("/users/:id", userHandler.Update)
			protected.DELETE("/users/:id", userHandler.Delete)
		}
	}

	return r
}
