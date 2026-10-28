package pg

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type meetingPointStore struct {
	db *bun.DB
}

func (s *meetingPointStore) Create(ctx context.Context, point *models.MeetingPoint) error {
	point.CreatedAt = time.Now()
	point.UpdatedAt = time.Now()
	point.IsActive = true
	_, err := s.db.NewInsert().Model(point).Exec(ctx)
	if err != nil {
		return fmt.Errorf("error creating meeting point: %w", err)
	}
	return nil
}

func (s *meetingPointStore) GetByID(ctx context.Context, id uuid.UUID) (*models.MeetingPoint, error) {
	var point models.MeetingPoint
	err := s.db.NewSelect().
		Model(&point).
		Relation("Creator").
		Relation("Crew").
		Where("mp.id = ?", id).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting meeting point: %w", err)
	}
	return &point, nil
}

func (s *meetingPointStore) ListForUser(ctx context.Context, userID uuid.UUID, resortID string) ([]models.MeetingPoint, error) {
	var points []models.MeetingPoint

	// Friends subquery: IDs of users who are accepted friends with userID
	friendsSubquery := s.db.NewSelect().
		Model((*models.Friendship)(nil)).
		ColumnExpr("CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END", userID).
		Where("(requester_id = ? OR addressee_id = ?) AND status = 'accepted'", userID, userID)

	// Crews subquery: Crew IDs the user belongs to
	crewsSubquery := s.db.NewSelect().
		Model((*models.CrewMember)(nil)).
		Column("crew_id").
		Where("user_id = ?", userID)

	query := s.db.NewSelect().
		Model(&points).
		Relation("Creator").
		Relation("Crew").
		Where("mp.is_active = TRUE").
		WhereGroup(" AND ", func(q *bun.SelectQuery) *bun.SelectQuery {
			return q.
				Where("mp.created_by = ?", userID).
				WhereOr("mp.crew_id IN (?)", crewsSubquery).
				WhereOr("mp.crew_id IS NULL AND mp.created_by IN (?)", friendsSubquery)
		})

	if resortID != "" {
		query = query.Where("mp.resort_id = ?", resortID)
	}

	err := query.Order("mp.created_at DESC").Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error listing meeting points: %w", err)
	}

	for i := range points {
		points[i].CanDelete = (points[i].CreatedBy == userID)
	}

	return points, nil
}

func (s *meetingPointStore) Delete(ctx context.Context, id, userID uuid.UUID) error {
	point, err := s.GetByID(ctx, id)
	if err != nil {
		return err
	}

	canDelete := point.CreatedBy == userID
	if !canDelete && point.CrewID != nil {
		count, _ := s.db.NewSelect().
			Model((*models.CrewMember)(nil)).
			Where("crew_id = ? AND user_id = ? AND role = 'admin'", *point.CrewID, userID).
			Count(ctx)
		if count > 0 {
			canDelete = true
		}
	}

	if !canDelete {
		return fmt.Errorf("unauthorized to delete meeting point")
	}

	_, err = s.db.NewDelete().
		Model((*models.MeetingPoint)(nil)).
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("error deleting meeting point: %w", err)
	}

	return nil
}
