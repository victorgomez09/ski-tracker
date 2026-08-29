package pg

import (
	"context"
	"database/sql"
	"errors"
	"math"

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
	var resorts []models.SkiResort
	distanceFormula := `6371 * acos(
		cos(radians(?)) * cos(radians(latitude)) * 
		cos(radians(longitude) - radians(?)) + 
		sin(radians(?)) * sin(radians(latitude))
	)`

	// Step 1: Find all resorts within 50.0 km
	err := s.db.NewSelect().
		Model(&resorts).
		Where("name IS NOT NULL AND name != ? AND tags->>'status' = ?", "No name", "operating").
		Where(distanceFormula+" <= 50.0", latitude, longitude, latitude).
		OrderExpr(distanceFormula+" ASC", latitude, longitude, latitude).
		Scan(ctx)

	if err != nil {
		return nil, err
	}
	if len(resorts) == 0 {
		return nil, sql.ErrNoRows
	}

	// Step 2: Check which of these resorts is <= 5km from center OR has a piste <= 5km
	var validResortIDs []string
	for _, r := range resorts {
		validResortIDs = append(validResortIDs, r.ID)
	}

	var pisteMatchResortIDs []string
	err = s.db.NewSelect().
		TableExpr("ski_pistes AS p").
		ColumnExpr("p.resort_id").
		Where("p.resort_id IN (?)", bun.In(validResortIDs)).
		Where("p.geometry_geojson->>'type' = 'LineString'").
		Where(`ST_DWithin(
			ST_SetSRID(ST_MakePoint(
				(p.geometry_geojson->'coordinates'->0->>0)::float8,
				(p.geometry_geojson->'coordinates'->0->>1)::float8
			), 4326)::geography,
			ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography,
			5000
		)`, longitude, latitude).
		GroupExpr("p.resort_id").
		Scan(ctx, &pisteMatchResortIDs)

	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	// Fast lookup for resorts that have a piste nearby
	hasPisteNearby := make(map[string]bool)
	for _, id := range pisteMatchResortIDs {
		hasPisteNearby[id] = true
	}

	// Evaluate conditions:
	// Since resorts are already sorted by center distance, we just pick the first one that matches:
	// 1. Center distance <= 5.0 km
	// 2. OR it has a piste within 5.0 km
	for _, r := range resorts {
		// Calculate precise center distance in Go to avoid re-querying
		rad := math.Pi / 180
		dLat := (r.Latitude - latitude) * rad
		dLon := (r.Longitude - longitude) * rad
		a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(latitude*rad)*math.Cos(r.Latitude*rad)*math.Sin(dLon/2)*math.Sin(dLon/2)
		dist := 6371 * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

		if dist <= 5.0 || hasPisteNearby[r.ID] {
			return &r, nil
		}
	}

	return nil, sql.ErrNoRows
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

