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
	err := u.db.NewRaw(query, wktLine).Scan(ctx, result)
	if err != nil {
		return err
	}
	return nil
}

func (u *skiSessionStore) ListByResortID(ctx context.Context, resortID string) ([]models.SkiSession, error) {
	var sessions []models.SkiSession
	err := u.db.NewSelect().
		Model(&sessions).
		Relation("Runs").
		Where("resort_id = ?", resortID).
		Order("start_time DESC").
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return sessions, nil
}

func (u *skiSessionStore) ListByUserID(ctx context.Context, userID uuid.UUID) ([]models.SkiSession, error) {
	var sessions []models.SkiSession
	err := u.db.NewSelect().
		Model(&sessions).
		Relation("Runs").
		Where("user_id = ?", userID).
		Order("start_time DESC").
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return sessions, nil
}

func (u *skiSessionStore) GetByID(ctx context.Context, sessionID uuid.UUID) (*models.SkiSession, error) {
	var session models.SkiSession
	err := u.db.NewSelect().
		Model(&session).
		Relation("Runs").
		Where("id = ?", sessionID).
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return &session, nil
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

func (u *skiSessionStore) UpdateMetrics(ctx context.Context, sessionID uuid.UUID, totalDistance, maxSpeed, verticalDrop float64) error {
	_, err := u.db.NewUpdate().
		Model((*models.SkiSession)(nil)).
		Set("total_distance = ?", totalDistance).
		Set("max_speed = ?", maxSpeed).
		Set("vertical_drop = ?", verticalDrop).
		Where("id = ?", sessionID).
		Exec(ctx)

	return err
}
