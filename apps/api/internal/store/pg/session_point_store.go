package pg

import (
	"context"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type sessionPointStore struct {
	db *bun.DB
}

func (u *sessionPointStore) GetBySessionID(ctx context.Context, sessionID uuid.UUID) ([]models.SessionPoint, error) {
	var points []models.SessionPoint
	err := u.db.NewSelect().
		Column("id", "session_id", "altitude", "speed", "timestamp").
		ColumnExpr("ST_AsText(geom) AS geom").
		Model(&points).
		Where("session_id = ?", sessionID).
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return points, nil
}

func (u *sessionPointStore) Create(ctx context.Context, point *models.SessionPoint) (*models.SessionPoint, error) {
	_, err := u.db.NewInsert().Model(point).Exec(ctx)
	if err != nil {
		return nil, err
	}
	return point, nil
}

func (u *sessionPointStore) Bulk(ctx context.Context, points *[]models.SessionPoint) error {
	if points == nil || len(*points) == 0 {
		return nil
	}

	for _, p := range *points {
		_, err := u.db.NewInsert().
			Model(&p).
			Value("geom", "ST_GeomFromText(?, 4326)", p.Geom).
			Exec(ctx)

		if err != nil {
			return err
		}
	}

	return nil
}

func (u *sessionPointStore) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := u.db.NewDelete().Model((*models.SessionPoint)(nil)).Where("id = ?", id).Exec(ctx)
	return err
}
