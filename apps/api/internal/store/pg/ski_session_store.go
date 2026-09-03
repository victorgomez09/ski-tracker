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

func (u *skiSessionStore) List(ctx context.Context) ([]models.SkiSession, error) {
	var sessions []models.SkiSession
	err := u.db.NewSelect().
		Model(&sessions).
		Relation("Runs").
		Relation("User").
		Relation("Resort").
		Relation("Photos").
		Where("ss.is_public = ?", true).
		Order("ss.created_at DESC").
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return sessions, nil
}

func (u *skiSessionStore) ListByResortID(ctx context.Context, resortID string, userID uuid.UUID) ([]models.SkiSession, error) {
	var sessions []models.SkiSession
	err := u.db.NewSelect().
		Model(&sessions).
		Relation("Runs").
		Relation("User").
		Relation("Photos").
		Where("resort_id = ?", resortID).
		Where("is_public = ? OR user_id = ?", true, userID).
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
		Relation("User").
		Relation("Photos").
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
		Relation("User").
		Relation("Photos").
		Where("ss.id = ?", sessionID).
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

func (u *skiSessionStore) UpdateMetrics(ctx context.Context, sessionID uuid.UUID, metrics models.SessionMetrics) error {
	_, err := u.db.NewUpdate().
		Model((*models.SkiSession)(nil)).
		Set("total_distance = ?", metrics.TotalDistance).
		Set("max_speed = ?", metrics.MaxSpeed).
		Set("vertical_drop = ?", metrics.VerticalDrop).
		Set("avg_speed = ?", metrics.AvgSpeed).
		Set("elevation_gain = ?", metrics.ElevationGain).
		Set("elevation_loss = ?", metrics.ElevationLoss).
		Set("moving_time = ?", metrics.MovingTime).
		Set("duration = ?", metrics.Duration).
		Set("pace = ?", metrics.Pace).
		Where("id = ?", sessionID).
		Exec(ctx)

	return err
}

func (u *skiSessionStore) AddPhotos(ctx context.Context, photos []models.SessionPhoto) error {
	if len(photos) == 0 {
		return nil
	}
	_, err := u.db.NewInsert().Model(&photos).Exec(ctx)
	return err
}

func (u *skiSessionStore) ListFriendsSessions(ctx context.Context, userID uuid.UUID) ([]models.SkiSession, error) {
	var sessions []models.SkiSession

	friendIDsQuery := u.db.NewSelect().
		ColumnExpr("CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END", userID).
		Model((*models.Friendship)(nil)).
		Where("status = 'ACCEPTED'").
		Where("requester_id = ? OR addressee_id = ?", userID, userID)

	err := u.db.NewSelect().
		Model(&sessions).
		Relation("Runs").
		Relation("User").
		Relation("Resort").
		Relation("Photos").
		Where("ss.user_id = ? OR ss.user_id IN (?)", userID, friendIDsQuery).
		Order("ss.created_at DESC").
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return sessions, nil
}
