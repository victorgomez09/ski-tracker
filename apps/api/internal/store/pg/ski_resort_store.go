package pg

import (
	"context"

	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type skiResortStore struct {
	db *bun.DB
}

func (s *skiResortStore) ListAll(ctx context.Context, filter store.SkiResortListFilter) ([]models.SkiResort, error) {
	var resorts []models.SkiResort
	q := s.db.NewSelect().Model(&resorts)

	if filter.Search != "" {
		q = q.Where("LOWER(name) LIKE LOWER(?)", "%"+filter.Search+"%")
	}
	if filter.Status != "" {
		q = q.Where("status = ?", filter.Status)
	}

	isGeoSearch := filter.Latitude != nil && filter.Longitude != nil && filter.RadiusKm != nil
	if isGeoSearch {
		distanceFormula := `6371 * acos(
			cos(radians(?)) * cos(radians(latitude)) * 
			cos(radians(longitude) - radians(?)) + 
			sin(radians(?)) * sin(radians(latitude))
		)`

		q = q.Where(distanceFormula+" <= ?", *filter.Latitude, *filter.Longitude, *filter.Latitude, *filter.RadiusKm)

		q = q.OrderExpr(distanceFormula+" ASC", *filter.Latitude, *filter.Longitude, *filter.Latitude)
	} else {
		q = q.OrderExpr("created_at DESC")
	}

	err := q.Scan(ctx)
	return resorts, err
}
