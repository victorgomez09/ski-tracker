package service

import (
	"context"
	"errors"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type CrewService struct {
	store  store.Store
	logger *slog.Logger
}

func NewCrewService(s store.Store, l *slog.Logger) *CrewService {
	return &CrewService{
		store:  s,
		logger: l,
	}
}

func (s *CrewService) CreateCrew(ctx context.Context, name, description, resortID, coverURL string, createdBy uuid.UUID) (*models.Crew, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("crew name cannot be empty")
	}

	crew := &models.Crew{
		Name:          name,
		Description:   description,
		ResortID:      resortID,
		CreatedBy:     createdBy,
		CoverImageURL: coverURL,
	}

	err := s.store.Crew().Create(ctx, crew)
	if err != nil {
		return nil, err
	}

	return s.store.Crew().GetByID(ctx, crew.ID)
}

func (s *CrewService) GetCrew(ctx context.Context, crewID uuid.UUID) (*models.Crew, error) {
	return s.store.Crew().GetByID(ctx, crewID)
}

func (s *CrewService) ListUserCrews(ctx context.Context, userID uuid.UUID) ([]models.Crew, error) {
	return s.store.Crew().ListUserCrews(ctx, userID)
}

func (s *CrewService) AddMember(ctx context.Context, crewID, userID uuid.UUID, role string) error {
	if role == "" {
		role = "member"
	}
	member := &models.CrewMember{
		CrewID: crewID,
		UserID: userID,
		Role:   role,
	}
	return s.store.Crew().AddMember(ctx, member)
}

func (s *CrewService) RemoveMember(ctx context.Context, crewID, targetUserID, requesterID uuid.UUID) error {
	crew, err := s.store.Crew().GetByID(ctx, crewID)
	if err != nil {
		return err
	}

	// Only crew creator/admin or the user leaving can remove
	if requesterID != targetUserID && crew.CreatedBy != requesterID {
		return errors.New("unauthorized to remove member from crew")
	}

	return s.store.Crew().RemoveMember(ctx, crewID, targetUserID)
}

func (s *CrewService) ListMembers(ctx context.Context, crewID uuid.UUID) ([]models.CrewMember, error) {
	return s.store.Crew().ListMembers(ctx, crewID)
}

func (s *CrewService) AddPhoto(ctx context.Context, crewID, userID uuid.UUID, photoURL, caption string) (*models.CrewPhoto, error) {
	photoURL = strings.TrimSpace(photoURL)
	if photoURL == "" {
		return nil, errors.New("photo url cannot be empty")
	}

	photo := &models.CrewPhoto{
		CrewID:   crewID,
		UserID:   userID,
		PhotoURL: photoURL,
		Caption:  caption,
	}

	err := s.store.Crew().AddPhoto(ctx, photo)
	if err != nil {
		return nil, err
	}

	return photo, nil
}

func (s *CrewService) ListPhotos(ctx context.Context, crewID uuid.UUID) ([]models.CrewPhoto, error) {
	return s.store.Crew().ListPhotos(ctx, crewID)
}

func (s *CrewService) GetCrewLeaderboard(ctx context.Context, crewID uuid.UUID, metric string) ([]models.LeaderboardEntry, error) {
	return s.store.Crew().GetCrewLeaderboard(ctx, crewID, metric)
}

func (s *CrewService) GetCrewLiveLocations(ctx context.Context, crewID uuid.UUID) ([]models.User, error) {
	return s.store.Crew().GetCrewLiveLocations(ctx, crewID)
}
