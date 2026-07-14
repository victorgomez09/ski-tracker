package service

import (
	"context"
	"log/slog"

	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type SkiLiftService struct {
	store  store.Store
	logger *slog.Logger
}

func NewSkiLiftService(s store.Store, logger *slog.Logger) *SkiLiftService {
	return &SkiLiftService{store: s, logger: logger}
}

func (s *SkiLiftService) GetByResortID(ctx context.Context, resortID string) ([]models.SkiLift, error) {
	lifts, err := s.store.SkiLift().GetByResortID(ctx, resortID)
	if err != nil {
		return nil, err
	}
	return lifts, nil
}
