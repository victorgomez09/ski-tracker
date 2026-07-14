package pg

import (
	"context"

	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type skiLiftStore struct {
	db *bun.DB
}

func (s *skiLiftStore) GetByResortID(ctx context.Context, resortID string) ([]models.SkiLift, error) {
	var lifts []models.SkiLift
	err := s.db.NewSelect().Model(&lifts).Where("resort_id = ?", resortID).Scan(ctx)
	return lifts, err
}
