package pg

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type skiSessionStore struct {
	db *bun.DB
}

func (u *skiSessionStore) Raw(ctx context.Context, query string, wktLine string, result interface{}) error {
	err := u.db.NewRaw(query, wktLine).Scan(ctx, &result)
	if err != nil {
		return err
	}
	return nil
}

func (u *skiSessionStore) Create(ctx context.Context, session *models.SkiSession) (*models.SkiSession, error) {
	_, err := u.db.NewInsert().Model(session).Exec(ctx)
	if err != nil {
		return nil, err
	}
	return session, nil
}

func (u *skiSessionStore) Update(ctx context.Context, sessionID uuid.UUID, now time.Time) error {
	_, err := u.db.NewUpdate().
		Model((*models.SkiSession)(nil)).
		Set("end_time = ?", now).
		Where("id = ?", sessionID).
		Exec(ctx)

	return err
}

func (u *skiSessionStore) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := u.db.NewDelete().Model((*models.SkiSession)(nil)).Where("id = ?", id).Exec(ctx)
	return err
}
