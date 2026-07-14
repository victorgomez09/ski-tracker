package service

import (
	"log/slog"

	"github.com/victorgomez09/ski-tracker/internal/store"
)

// Container holds all services with their dependencies.
type Container struct {
	SkiResort *SkiResortService
	SkiPiste  *SkiPisteService
	SkiLift   *SkiLiftService
}

// NewContainer creates all services with shared dependencies.
func NewContainer(
	s store.Store,
	// jwtManager *auth.JWTManager,
	logger *slog.Logger,
	dbURL string,
	setupSecret string,
) *Container {
	return &Container{
		// Auth:          NewAuthService(s, jwtManager, logger),
		SkiResort: NewSkiResortService(s, logger),
		SkiPiste:  NewSkiPisteService(s, logger),
		SkiLift:   NewSkiLiftService(s, logger),
	}
}
