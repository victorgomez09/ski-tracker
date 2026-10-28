package service

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type MeetingPointService struct {
	store  store.Store
	logger *slog.Logger
}

func NewMeetingPointService(s store.Store, logger *slog.Logger) *MeetingPointService {
	return &MeetingPointService{
		store:  s,
		logger: logger,
	}
}

func (s *MeetingPointService) Create(ctx context.Context, point *models.MeetingPoint) error {
	if point.Title == "" {
		return fmt.Errorf("title is required")
	}
	if point.ResortID == "" {
		return fmt.Errorf("resort_id is required")
	}
	if point.Latitude == 0 && point.Longitude == 0 {
		return fmt.Errorf("valid coordinates are required")
	}

	return s.store.MeetingPoint().Create(ctx, point)
}

func (s *MeetingPointService) GetByID(ctx context.Context, id uuid.UUID) (*models.MeetingPoint, error) {
	return s.store.MeetingPoint().GetByID(ctx, id)
}

func (s *MeetingPointService) ListForUser(ctx context.Context, userID uuid.UUID, resortID string) ([]models.MeetingPoint, error) {
	return s.store.MeetingPoint().ListForUser(ctx, userID, resortID)
}

func (s *MeetingPointService) Delete(ctx context.Context, id, userID uuid.UUID) error {
	return s.store.MeetingPoint().Delete(ctx, id, userID)
}
