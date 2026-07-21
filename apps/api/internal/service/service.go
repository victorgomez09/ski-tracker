package service

import (
	"log/slog"

	"github.com/victorgomez09/ski-tracker/internal/api/auth"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

// Container holds all services with their dependencies.
type Container struct {
	SkiResort  *SkiResortService
	SkiPiste   *SkiPisteService
	SkiLift    *SkiLiftService
	User       *UserService
	TrackPoint *TrackPointService
}

// NewContainer creates all services with shared dependencies.
func NewContainer(
	s store.Store,
	jwtManager *auth.JWTManager,
	logger *slog.Logger,
	dbURL string,
	setupSecret string,
) *Container {
	return &Container{
		SkiResort:  NewSkiResortService(s, logger),
		SkiPiste:   NewSkiPisteService(s, logger),
		SkiLift:    NewSkiLiftService(s, logger),
		User:       NewUserService(s, jwtManager, logger),
		TrackPoint: NewTrackPointService(s, jwtManager, logger),
	}
}
