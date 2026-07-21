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
	err := u.db.NewSelect().Model(&points).Where("session_id = ?", sessionID).Scan(ctx)
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
	_, err := u.db.NewInsert().Model(&points).
		Value("geom", "ST_GeomFromText(?, 4326)", bun.Ident("geom")).
		Exec(ctx)
	return err
}

func (u *sessionPointStore) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := u.db.NewDelete().Model((*models.SessionPoint)(nil)).Where("id = ?", id).Exec(ctx)
	return err
}
