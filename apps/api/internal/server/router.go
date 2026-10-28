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
		apiV1.POST("/auth/refresh", userHandler.RefreshToken)

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
		apiV1.POST("/ota/rollback", otaPublishAuth, otaHandler.Rollback)

		// Native App Release routes (for self-hosted APK updates)
		appReleaseHandler := v1.NewAppReleaseHandler(deps.Services.AppRelease, deps.APIPublicURL)
		apiV1.GET("/app/check-update", appReleaseHandler.CheckUpdate)
		apiV1.GET("/app/latest", appReleaseHandler.GetLatest)
		apiV1.GET("/app/download/:platform/latest", appReleaseHandler.DownloadLatest)
		apiV1.POST("/app/publish", otaPublishAuth, appReleaseHandler.Publish)

		// Ski / Multi-Activity session photos route (public: images and browser downloads do not send Authorization headers)
		skiSessionHandler := v1.NewSkiSessionHandler(deps.Services.SkiSession, deps.Store)
		apiV1.GET("/ski-sessions/photos/*path", skiSessionHandler.GetPhoto)
		apiV1.GET("/sessions/photos/*path", skiSessionHandler.GetPhoto)

		protected := apiV1.Group("")
		protected.Use(middleware.Auth(deps.JWTManager))
		{
			// Resort routes
			skiResortHandler := v1.NewSkiResortHandler(deps.Services.SkiResort, deps.Store)
			protected.GET("/resorts/favorites", skiResortHandler.ListFavorites)
			protected.POST("/resorts/favorites/:id", skiResortHandler.AddFavorite)
			protected.DELETE("/resorts/favorites/:id", skiResortHandler.RemoveFavorite)
			protected.GET("/resorts/bbox", skiResortHandler.ListByBBox)
			protected.GET("/resorts/nearby", skiResortHandler.ListNearby)
			protected.GET("/resorts/by-name", skiResortHandler.ListByName)
			protected.GET("/resorts/by-id/:id", skiResortHandler.GetByID)
			protected.GET("/resorts/by-id/:id/offline-pack", skiResortHandler.GetOfflinePack)
			protected.GET("/resorts/:id/offline-pack", skiResortHandler.GetOfflinePack)
			protected.GET("/resorts/by-id/:id/pois", skiResortHandler.GetPOIs)
			protected.POST("/resorts/by-id/:id/pois/refresh", skiResortHandler.RefreshPOIs)
			protected.GET("/resorts/closeness", skiResortHandler.GetByCloseness)

			// Session routes (supports both /sessions and legacy /ski-sessions)
			protected.GET("/ski-sessions", skiSessionHandler.List)
			protected.GET("/sessions", skiSessionHandler.List)
			protected.GET("/ski-sessions/by-resort", skiSessionHandler.ListByResort)
			protected.GET("/sessions/by-resort", skiSessionHandler.ListByResort)
			protected.GET("/ski-sessions/:id", skiSessionHandler.GetSession)
			protected.GET("/sessions/:id", skiSessionHandler.GetSession)
			protected.POST("/ski-sessions", skiSessionHandler.StartSession)
			protected.POST("/sessions", skiSessionHandler.StartSession)
			protected.POST("/ski-sessions/:id/points", skiSessionHandler.AddPoints)
			protected.POST("/sessions/:id/points", skiSessionHandler.AddPoints)
			protected.POST("/ski-sessions/:id/finish", skiSessionHandler.FinishSession)
			protected.POST("/sessions/:id/finish", skiSessionHandler.FinishSession)

			// User routes
			userHandler := v1.NewUserHandler(deps.Services.User, deps.Store)
			protected.GET("/users/me", userHandler.GetMe)
			protected.GET("/users/:id", userHandler.GetByID)
			protected.GET("/users", userHandler.GetByEmail)
			protected.PUT("/users/:id", userHandler.Update)
			protected.DELETE("/users/:id", userHandler.Delete)

			// Friendship / Social routes
			friendshipHandler := v1.NewFriendshipHandler(deps.Services.Friendship)
			protected.GET("/friends", friendshipHandler.ListFriends)
			protected.GET("/friends/requests", friendshipHandler.ListRequests)
			protected.POST("/friends/request", friendshipHandler.SendRequest)
			protected.POST("/friends/respond", friendshipHandler.RespondRequest)
			protected.DELETE("/friends/:id", friendshipHandler.DeleteFriendship)
			protected.POST("/friends/block/:userId", friendshipHandler.BlockUser)
			protected.GET("/users/search", friendshipHandler.SearchUsers)
			protected.GET("/friends/feed", friendshipHandler.ListFriendsFeed)
			protected.POST("/users/live-location", friendshipHandler.UpdateLiveLocation)
			protected.GET("/friends/live-locations", friendshipHandler.GetFriendsLiveLocations)
			protected.GET("/ski-sessions/live/resort/:resortId", friendshipHandler.GetFriendsLiveLocations)
			protected.GET("/sessions/live/resort/:resortId", friendshipHandler.GetFriendsLiveLocations)
			protected.GET("/friends/leaderboard", friendshipHandler.GetFriendsLeaderboard)
			protected.POST("/users/ghost-mode", friendshipHandler.SetGhostMode)

			// Interaction routes (Reactions / Kudos and Comments)
			interactionHandler := v1.NewInteractionHandler(deps.Services.Interaction)
			protected.POST("/ski-sessions/:id/reactions", interactionHandler.ToggleReaction)
			protected.POST("/sessions/:id/reactions", interactionHandler.ToggleReaction)
			protected.GET("/ski-sessions/:id/reactions", interactionHandler.GetReactions)
			protected.GET("/sessions/:id/reactions", interactionHandler.GetReactions)
			protected.POST("/ski-sessions/:id/comments", interactionHandler.AddComment)
			protected.POST("/sessions/:id/comments", interactionHandler.AddComment)
			protected.GET("/ski-sessions/:id/comments", interactionHandler.GetComments)
			protected.GET("/sessions/:id/comments", interactionHandler.GetComments)
			protected.DELETE("/ski-sessions/:id/comments/:commentId", interactionHandler.DeleteComment)
			protected.DELETE("/sessions/:id/comments/:commentId", interactionHandler.DeleteComment)

			// Crews (Ski Groups) routes
			crewHandler := v1.NewCrewHandler(deps.Services.Crew)
			protected.GET("/crews", crewHandler.ListUserCrews)
			protected.POST("/crews", crewHandler.CreateCrew)
			protected.GET("/crews/:id", crewHandler.GetCrew)
			protected.POST("/crews/:id/join", crewHandler.JoinCrew)
			protected.POST("/crews/:id/leave", crewHandler.LeaveCrew)
			protected.POST("/crews/:id/members", crewHandler.AddMember)
			protected.DELETE("/crews/:id/members/:userId", crewHandler.RemoveMember)
			protected.GET("/crews/:id/photos", crewHandler.ListPhotos)
			protected.POST("/crews/:id/photos", crewHandler.AddPhoto)
			protected.GET("/crews/:id/leaderboard", crewHandler.GetCrewLeaderboard)
			protected.GET("/crews/:id/live-locations", crewHandler.GetCrewLiveLocations)

			// Weather and Snow routes
			weatherHandler := v1.NewWeatherHandler(deps.Services.Weather, deps.Cache)
			protected.GET("/weather", weatherHandler.GetWeather)
			protected.GET("/resorts/by-id/:id/snow-report", weatherHandler.GetSnowReport)
			protected.GET("/resorts/:id/snow-report", weatherHandler.GetSnowReport)

			// Meeting Points routes (2.3)
			meetingPointHandler := v1.NewMeetingPointHandler(deps.Services.MeetingPoint, deps.Logger)
			protected.POST("/meeting-points", meetingPointHandler.Create)
			protected.GET("/meeting-points", meetingPointHandler.List)
			protected.GET("/meeting-points/:id", meetingPointHandler.GetByID)
			protected.DELETE("/meeting-points/:id", meetingPointHandler.Delete)
		}
	}

	return r
}
