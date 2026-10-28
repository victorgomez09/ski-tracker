package pg

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type crewStore struct {
	db *bun.DB
}

func (s *crewStore) Create(ctx context.Context, crew *models.Crew) error {
	_, err := s.db.NewInsert().Model(crew).Exec(ctx)
	if err != nil {
		return fmt.Errorf("error creating crew: %w", err)
	}

	// Creator automatically becomes an admin member
	adminMember := &models.CrewMember{
		CrewID: crew.ID,
		UserID: crew.CreatedBy,
		Role:   "admin",
	}
	_, err = s.db.NewInsert().Model(adminMember).Exec(ctx)
	if err != nil {
		return fmt.Errorf("error adding creator to crew: %w", err)
	}

	return nil
}

func (s *crewStore) GetByID(ctx context.Context, id uuid.UUID) (*models.Crew, error) {
	var crew models.Crew
	err := s.db.NewSelect().
		Model(&crew).
		Relation("Creator").
		Relation("Members.User").
		Relation("Photos.User").
		Relation("Resort").
		Where("c.id = ?", id).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting crew: %w", err)
	}

	crew.MemberCount = len(crew.Members)
	return &crew, nil
}

func (s *crewStore) ListUserCrews(ctx context.Context, userID uuid.UUID) ([]models.Crew, error) {
	var crews []models.Crew

	crewIDsQuery := s.db.NewSelect().
		Column("crew_id").
		Model((*models.CrewMember)(nil)).
		Where("user_id = ?", userID)

	err := s.db.NewSelect().
		Model(&crews).
		Relation("Creator").
		Relation("Resort").
		Where("c.id IN (?)", crewIDsQuery).
		Order("c.created_at DESC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error listing user crews: %w", err)
	}

	for i := range crews {
		cnt, _ := s.db.NewSelect().
			Model((*models.CrewMember)(nil)).
			Where("crew_id = ?", crews[i].ID).
			Count(ctx)
		crews[i].MemberCount = cnt
	}

	return crews, nil
}

func (s *crewStore) AddMember(ctx context.Context, member *models.CrewMember) error {
	_, err := s.db.NewInsert().Model(member).Exec(ctx)
	if err != nil {
		return fmt.Errorf("error adding crew member: %w", err)
	}
	return nil
}

func (s *crewStore) RemoveMember(ctx context.Context, crewID, userID uuid.UUID) error {
	_, err := s.db.NewDelete().
		Model((*models.CrewMember)(nil)).
		Where("crew_id = ?", crewID).
		Where("user_id = ?", userID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("error removing crew member: %w", err)
	}
	return nil
}

func (s *crewStore) ListMembers(ctx context.Context, crewID uuid.UUID) ([]models.CrewMember, error) {
	var members []models.CrewMember
	err := s.db.NewSelect().
		Model(&members).
		Relation("User").
		Where("crew_id = ?", crewID).
		Order("joined_at ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error listing crew members: %w", err)
	}
	return members, nil
}

func (s *crewStore) AddPhoto(ctx context.Context, photo *models.CrewPhoto) error {
	_, err := s.db.NewInsert().Model(photo).Exec(ctx)
	if err != nil {
		return fmt.Errorf("error adding crew photo: %w", err)
	}
	return nil
}

func (s *crewStore) ListPhotos(ctx context.Context, crewID uuid.UUID) ([]models.CrewPhoto, error) {
	var photos []models.CrewPhoto
	err := s.db.NewSelect().
		Model(&photos).
		Relation("User").
		Where("crew_id = ?", crewID).
		Order("cp.created_at DESC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error listing crew photos: %w", err)
	}
	return photos, nil
}

func (s *crewStore) GetCrewLeaderboard(ctx context.Context, crewID uuid.UUID, metric string) ([]models.LeaderboardEntry, error) {
	memberIDsQuery := s.db.NewSelect().
		Column("user_id").
		Model((*models.CrewMember)(nil)).
		Where("crew_id = ?", crewID)

	var valExpr string
	switch metric {
	case "max_speed":
		valExpr = "COALESCE(MAX(ss.max_speed), 0)"
	case "vertical_drop":
		valExpr = "COALESCE(SUM(ss.vertical_drop), 0)"
	default:
		valExpr = "COALESCE(SUM(ss.total_distance), 0)"
	}

	var results []models.LeaderboardEntry
	err := s.db.NewSelect().
		ColumnExpr("u.id AS user_id").
		ColumnExpr("u.display_name").
		ColumnExpr("u.avatar_url").
		ColumnExpr("u.first_name").
		ColumnExpr("u.last_name").
		ColumnExpr(fmt.Sprintf("%s AS value", valExpr)).
		TableExpr("users AS u").
		Join("LEFT JOIN ski_sessions AS ss ON ss.user_id = u.id").
		Where("u.id IN (?)", memberIDsQuery).
		Group("u.id").
		Order("value DESC").
		Scan(ctx, &results)
	if err != nil {
		return nil, fmt.Errorf("error getting crew leaderboard: %w", err)
	}

	return results, nil
}

func (s *crewStore) GetCrewLiveLocations(ctx context.Context, crewID uuid.UUID) ([]models.User, error) {
	memberIDsQuery := s.db.NewSelect().
		Column("user_id").
		Model((*models.CrewMember)(nil)).
		Where("crew_id = ?", crewID)

	fiveMinsAgo := time.Now().Add(-5 * time.Minute)
	var members []models.User
	err := s.db.NewSelect().
		Model(&members).
		Where("id IN (?)", memberIDsQuery).
		Where("privacy_live_location != 'OFF'").
		Where("ghost_mode = FALSE").
		Where("last_location_time >= ?", fiveMinsAgo).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting crew live locations: %w", err)
	}

	return members, nil
}
