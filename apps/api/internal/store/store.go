package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

// Store aggregates all repository interfaces.
type Store interface {
	SkiResort() SkiResortStore
	SkiPiste() SkiPisteStore
	SkiLift() SkiLiftStore
	User() UserStore
	TrackPoint() TrackPointStore
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

type TrackPointStore interface {
	GetByID(ctx context.Context, id uuid.UUID) (*models.TrackPoint, error)
	GetByUser(ctx context.Context, userID uuid.UUID) ([]*models.TrackPoint, error)
	Create(ctx context.Context, trackPoint *models.TrackPoint) error
	Delete(ctx context.Context, id uuid.UUID) error
}
