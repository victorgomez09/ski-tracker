package pg

import (
	"context"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type trackPointStore struct {
	db *bun.DB
}

func (u *trackPointStore) GetByID(ctx context.Context, id uuid.UUID) (*models.TrackPoint, error) {
	var trackPoint models.TrackPoint
	err := u.db.NewSelect().Model(&trackPoint).Where("id = ?", id).Scan(ctx)
	if err != nil {
		return nil, err
	}
	return &trackPoint, nil
}

func (u *trackPointStore) GetByUser(ctx context.Context, userID uuid.UUID) ([]*models.TrackPoint, error) {
	var trackPoints []*models.TrackPoint
	err := u.db.NewSelect().Model(&trackPoints).Where("user_id = ?", userID).Scan(ctx)
	if err != nil {
		return nil, err
	}
	return trackPoints, nil
}

func (u *trackPointStore) Create(ctx context.Context, trackPoint *models.TrackPoint) error {
	_, err := u.db.NewInsert().Model(trackPoint).Exec(ctx)
	return err
}

func (u *trackPointStore) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := u.db.NewDelete().Model((*models.TrackPoint)(nil)).Where("id = ?", id).Exec(ctx)
	return err
}
