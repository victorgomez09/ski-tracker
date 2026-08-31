package pg

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type friendshipStore struct {
	db *bun.DB
}

func (s *friendshipStore) ListFriends(ctx context.Context, userID uuid.UUID) ([]models.Friendship, error) {
	var friendships []models.Friendship
	err := s.db.NewSelect().
		Model(&friendships).
		Relation("Requester").
		Relation("Addressee").
		Where("status = 'ACCEPTED'").
		WhereGroup(" AND ", func(q *bun.SelectQuery) *bun.SelectQuery {
			return q.Where("requester_id = ?", userID).
				WhereOr("addressee_id = ?", userID)
		}).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error listing friends: %w", err)
	}
	return friendships, nil
}

func (s *friendshipStore) ListRequests(ctx context.Context, userID uuid.UUID) ([]models.Friendship, error) {
	var friendships []models.Friendship
	err := s.db.NewSelect().
		Model(&friendships).
		Relation("Requester").
		Relation("Addressee").
		Where("status = 'PENDING'").
		WhereGroup(" AND ", func(q *bun.SelectQuery) *bun.SelectQuery {
			return q.Where("requester_id = ?", userID).
				WhereOr("addressee_id = ?", userID)
		}).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error listing requests: %w", err)
	}
	return friendships, nil
}

func (s *friendshipStore) GetByID(ctx context.Context, id uuid.UUID) (*models.Friendship, error) {
	friendship := new(models.Friendship)
	err := s.db.NewSelect().
		Model(friendship).
		Relation("Requester").
		Relation("Addressee").
		Where("id = ?", id).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("error getting friendship by id: %w", err)
	}
	return friendship, nil
}

func (s *friendshipStore) GetByUsers(ctx context.Context, requesterID, addresseeID uuid.UUID) (*models.Friendship, error) {
	friendship := new(models.Friendship)
	err := s.db.NewSelect().
		Model(friendship).
		Relation("Requester").
		Relation("Addressee").
		WhereGroup("", func(q *bun.SelectQuery) *bun.SelectQuery {
			return q.Where("requester_id = ? AND addressee_id = ?", requesterID, addresseeID).
				WhereOr("requester_id = ? AND addressee_id = ?", addresseeID, requesterID)
		}).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("error getting friendship by users: %w", err)
	}
	return friendship, nil
}

func (s *friendshipStore) Create(ctx context.Context, friendship *models.Friendship) error {
	_, err := s.db.NewInsert().Model(friendship).Exec(ctx)
	if err != nil {
		return fmt.Errorf("error creating friendship: %w", err)
	}
	return nil
}

func (s *friendshipStore) Update(ctx context.Context, friendship *models.Friendship) error {
	_, err := s.db.NewUpdate().
		Model(friendship).
		WherePK().
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("error updating friendship: %w", err)
	}
	return nil
}

func (s *friendshipStore) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.db.NewDelete().
		Model((*models.Friendship)(nil)).
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("error deleting friendship: %w", err)
	}
	return nil
}

func (s *friendshipStore) SearchUsers(ctx context.Context, query string, currentUserID uuid.UUID) ([]models.User, error) {
	var users []models.User
	likeQuery := "%" + query + "%"
	err := s.db.NewSelect().
		Model(&users).
		Where("id != ?", currentUserID).
		WhereGroup(" AND ", func(q *bun.SelectQuery) *bun.SelectQuery {
			return q.Where("display_name ILIKE ?", likeQuery).
				WhereOr("email ILIKE ?", likeQuery)
		}).
		Limit(30).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error searching users: %w", err)
	}
	return users, nil
}

func (s *friendshipStore) GetFriendsLiveLocations(ctx context.Context, userID uuid.UUID, resortID string) ([]models.User, error) {
	var friends []models.User

	friendIDsQuery := s.db.NewSelect().
		ColumnExpr("CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END", userID).
		Model((*models.Friendship)(nil)).
		Where("status = 'ACCEPTED'").
		Where("requester_id = ? OR addressee_id = ?", userID, userID)

	fiveMinsAgo := time.Now().Add(-5 * time.Minute)
	err := s.db.NewSelect().
		Model(&friends).
		Where("id IN (?)", friendIDsQuery).
		Where("privacy_live_location != 'OFF'").
		Where("last_resort_id = ?", resortID).
		Where("last_location_time >= ?", fiveMinsAgo).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting friends live locations: %w", err)
	}
	return friends, nil
}

func (s *friendshipStore) GetFriendsLeaderboard(ctx context.Context, userID uuid.UUID, period string, metric string) ([]models.LeaderboardEntry, error) {
	friendIDsQuery := s.db.NewSelect().
		ColumnExpr("CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END", userID).
		Model((*models.Friendship)(nil)).
		Where("status = 'ACCEPTED'").
		Where("requester_id = ? OR addressee_id = ?", userID, userID)

	var sinceTime time.Time
	now := time.Now()
	switch period {
	case "week":
		sinceTime = now.AddDate(0, 0, -7)
	case "month":
		sinceTime = now.AddDate(0, -1, 0)
	default:
		sinceTime = now.AddDate(-1, 0, 0) // last 12 months for season
	}

	var aggregateExpr string
	switch metric {
	case "vertical_drop":
		aggregateExpr = "COALESCE(SUM(ss.vertical_drop), 0)"
	case "max_speed":
		aggregateExpr = "COALESCE(MAX(ss.max_speed), 0)"
	default:
		aggregateExpr = "COALESCE(SUM(ss.total_distance), 0)"
	}

	var results []models.LeaderboardEntry
	err := s.db.NewSelect().
		ColumnExpr("u.id AS user_id").
		ColumnExpr("u.display_name").
		ColumnExpr("u.avatar_url").
		ColumnExpr("u.first_name").
		ColumnExpr("u.last_name").
		ColumnExpr(aggregateExpr+" AS value").
		TableExpr("users AS u").
		Join("LEFT JOIN ski_sessions AS ss ON ss.user_id = u.id AND ss.start_time >= ?", sinceTime).
		Where("u.id = ? OR u.id IN (?)", userID, friendIDsQuery).
		GroupExpr("u.id, u.display_name, u.avatar_url, u.first_name, u.last_name").
		Order("value DESC").
		Scan(ctx, &results)

	if err != nil {
		return nil, fmt.Errorf("error querying friends leaderboard: %w", err)
	}

	return results, nil
}
