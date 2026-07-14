package pg

import (
	"context"

	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type skiPisteStore struct {
	db *bun.DB
}

func (s *skiPisteStore) GetByResortID(ctx context.Context, resortID string) ([]models.SkiPiste, error) {
	var pistes []models.SkiPiste
	err := s.db.NewSelect().Model(&pistes).Where("resort_id = ?", resortID).Scan(ctx)
	return pistes, err
}
