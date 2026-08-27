package pg

import (
	"context"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type skiResortStore struct {
	db *bun.DB
}

func (s *skiResortStore) GetByID(ctx context.Context, id string) (models.SkiResort, error) {
	var resort models.SkiResort
	q := s.db.NewSelect().Model(&resort).Where("id = ?", id).Where("name IS NOT NULL AND name != ? AND tags->>'status' = ?", "No name", "operating")

	err := q.Scan(ctx)
	return resort, err
}

func (s *skiResortStore) ListByName(ctx context.Context, name string) ([]models.SkiResort, error) {
	var resorts []models.SkiResort
	q := s.db.NewSelect().Model(&resorts)
	if name != "" {
		q = q.Where("LOWER(name) LIKE LOWER(?) AND tags->>'status' = ?", "%"+name+"%", "operating")
	}

	err := q.Scan(ctx)
	return resorts, err
}

func (s *skiResortStore) ListAll(ctx context.Context, filter store.SkiResortListFilter) ([]models.SkiResort, error) {
	var resorts []models.SkiResort
	q := s.db.NewSelect().Model(&resorts)

	q = q.Where("name IS NOT NULL AND name != ? AND tags->>'status' = ?", "No name", "operating")

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

func (s *skiResortStore) ListByBBox(ctx context.Context, filter store.SkiResortBBoxFilter) ([]models.SkiResort, error) {
	var resorts []models.SkiResort
	q := s.db.NewSelect().Model(&resorts)

	if filter.MinLatitude != nil {
		q = q.Where("latitude >= ?", *filter.MinLatitude)
	}
	if filter.MaxLatitude != nil {
		q = q.Where("latitude <= ?", *filter.MaxLatitude)
	}
	if filter.MinLongitude != nil {
		q = q.Where("longitude >= ?", *filter.MinLongitude)
	}
	if filter.MaxLongitude != nil {
		q = q.Where("longitude <= ?", *filter.MaxLongitude)
	}
	q = q.Where("name IS NOT NULL AND name != ? AND tags->>'status' = ?", "No name", "operating")

	err := q.Scan(ctx)
	return resorts, err
}

func (s *skiResortStore) GetByCloseness(ctx context.Context, latitude, longitude float64) (*models.SkiResort, error) {
	var resort models.SkiResort
	distanceFormula := `6371 * acos(
		cos(radians(?)) * cos(radians(latitude)) * 
		cos(radians(longitude) - radians(?)) + 
		sin(radians(?)) * sin(radians(latitude))
	)`

	err := s.db.NewSelect().
		Model(&resort).
		Where("name IS NOT NULL AND name != ? AND tags->>'status' = ?", "No name", "operating").
		Where(distanceFormula+" <= 50.0", latitude, longitude, latitude). // Pre-filter resorts to optimize PostGIS execution
		Where(
			distanceFormula+` <= 5.0 OR EXISTS (
				SELECT 1 FROM ski_pistes p 
				WHERE p.resort_id = sr.id 
				AND ST_DWithin(
					ST_SetSRID(ST_GeomFromGeoJSON(p.geometry_geojson::text), 4326)::geography,
					ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography,
					5000
				)
			)`,
			latitude, longitude, latitude,
			longitude, latitude,
		).
		OrderExpr(distanceFormula+" ASC", latitude, longitude, latitude).
		Limit(1).
		Scan(ctx)

	if err != nil {
		return nil, err
	}

	return &resort, nil
}

func (s *skiResortStore) ListFavorites(ctx context.Context, userID uuid.UUID) ([]models.SkiResort, error) {
	var resorts []models.SkiResort
	err := s.db.NewSelect().
		Model(&resorts).
		Join("JOIN user_favorite_resorts AS ufr ON ufr.resort_id = sr.id").
		Where("ufr.user_id = ?", userID).
		OrderExpr("ufr.created_at DESC").
		Scan(ctx)

	return resorts, err
}

func (s *skiResortStore) AddFavorite(ctx context.Context, userID uuid.UUID, resortID string) error {
	fav := &models.UserFavoriteResort{
		UserID:   userID,
		ResortID: resortID,
	}
	_, err := s.db.NewInsert().
		Model(fav).
		On("CONFLICT (user_id, resort_id) DO NOTHING").
		Exec(ctx)
	return err
}

func (s *skiResortStore) RemoveFavorite(ctx context.Context, userID uuid.UUID, resortID string) error {
	_, err := s.db.NewDelete().
		Model((*models.UserFavoriteResort)(nil)).
		Where("user_id = ? AND resort_id = ?", userID, resortID).
		Exec(ctx)
	return err
}

