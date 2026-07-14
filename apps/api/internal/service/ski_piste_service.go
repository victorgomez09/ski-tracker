package service

import (
	"context"
	"log/slog"

	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type SkiPisteService struct {
	store  store.Store
	logger *slog.Logger
}

func NewSkiPisteService(s store.Store, logger *slog.Logger) *SkiPisteService {
	return &SkiPisteService{store: s, logger: logger}
}

func (s *SkiPisteService) GetByResortID(ctx context.Context, resortID string) ([]models.SkiPiste, error) {
	pistes, err := s.store.SkiPiste().GetByResortID(ctx, resortID)
	if err != nil {
		return nil, err
	}
	return pistes, nil
}
