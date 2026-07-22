package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

// Store aggregates all repository interfaces.
type Store interface {
	SkiResort() SkiResortStore
	SkiPiste() SkiPisteStore
	SkiLift() SkiLiftStore
	User() UserStore
	SkiSession() SkiSessionStore
	SessionPoint() SessionPointStore
	SkiRun() SkiRunStore
}

// Pagination request parameters.
type ListParams struct {
	Page    int
	PerPage int
}

func (p ListParams) Offset() int {
	return (p.Page - 1) * p.PerPage
}

func (p ListParams) Limit() int {
	return p.PerPage
}

// DefaultListParams returns sensible defaults.
func DefaultListParams() ListParams {
	return ListParams{Page: 1, PerPage: 20}
}

// ============================================================================
// Repository Interfaces
// ============================================================================
type SkiResortListFilter struct {
	Search    string
	Status    string
	Latitude  *float64
	Longitude *float64
	RadiusKm  *float64
}

type SkiResortBBoxFilter struct {
	MinLatitude  *float64
	MaxLatitude  *float64
	MinLongitude *float64
	MaxLongitude *float64
}

type SkiResortStore interface {
	ListByName(ctx context.Context, name string) ([]models.SkiResort, error)
	ListAll(ctx context.Context, filter SkiResortListFilter) ([]models.SkiResort, error)
	ListByBBox(ctx context.Context, filter SkiResortBBoxFilter) ([]models.SkiResort, error)
	GetByCloseness(ctx context.Context, lat, lon float64) (*models.SkiResort, error)
}

type SkiPisteStore interface {
	GetByResortID(ctx context.Context, resortID string) ([]models.SkiPiste, error)
}

type SkiLiftStore interface {
	GetByResortID(ctx context.Context, resortID string) ([]models.SkiLift, error)
}

type UserStore interface {
	GetByID(ctx context.Context, id uuid.UUID) (*models.User, error)
	GetByEmail(ctx context.Context, email string) (*models.User, error)
	Create(ctx context.Context, user *models.User) error
	Update(ctx context.Context, user *models.User) error
	Delete(ctx context.Context, id string) error
}

type SkiSessionStore interface {
	Raw(ctx context.Context, query string, wktLine string, result interface{}) error
	ListByResortID(ctx context.Context, resortID string) ([]models.SkiSession, error)
	ListByUserID(ctx context.Context, userID uuid.UUID) ([]models.SkiSession, error)
	GetByID(ctx context.Context, sessionID uuid.UUID) (*models.SkiSession, error)
	Create(ctx context.Context, skiSession *models.SkiSession) (*models.SkiSession, error)
	Update(ctx context.Context, sessionID uuid.UUID, now time.Time) error
	UpdateMetrics(ctx context.Context, sessionID uuid.UUID, totalDistance, maxSpeed, verticalDrop float64) error
}

type SessionPointStore interface {
	GetBySessionID(ctx context.Context, sessionID uuid.UUID) ([]models.SessionPoint, error)
	Create(ctx context.Context, point *models.SessionPoint) (*models.SessionPoint, error)
	Bulk(ctx context.Context, points *[]models.SessionPoint) error
}

type SkiRunStore interface {
	Create(ctx context.Context, run *models.SkiRun) (*models.SkiRun, error)
}
