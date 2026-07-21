package service

import (
	"context"
	"log/slog"
	"math"

	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/api/auth"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type CreateTrackPointInput struct {
	Lat       float64 `json:"lat" binding:"required"`
	Lon       float64 `json:"lon" binding:"required"`
	Alt       float64 `json:"alt"`
	Speed     float64 `json:"speed"`
	Timestamp int64   `json:"timestamp" binding:"required"`
}

type TrackPointService struct {
	store      store.Store
	jwtManager *auth.JWTManager
	logger     *slog.Logger
}

func NewTrackPointService(store store.Store, jwtManager *auth.JWTManager, logger *slog.Logger) *TrackPointService {
	return &TrackPointService{
		store:      store,
		jwtManager: jwtManager,
		logger:     logger,
	}
}

func (s *TrackPointService) GetByID(ctx context.Context, id uuid.UUID) (*models.TrackPoint, error) {
	trackPoint, err := s.store.TrackPoint().GetByID(ctx, id)
	if err != nil {
		s.logger.Error("failed to get trackpoint by ID", "trackpoint_id", id, "error", err)
		return nil, err
	}
	return trackPoint, nil
}

func (s *TrackPointService) GetByUser(ctx context.Context, userID uuid.UUID) ([]*models.TrackPoint, error) {
	trackPoints, err := s.store.TrackPoint().GetByUser(ctx, userID)
	if err != nil {
		s.logger.Error("failed to get trackpoints by user ID", "user_id", userID, "error", err)
		return nil, err
	}
	return trackPoints, nil
}

func (s *TrackPointService) Create(ctx context.Context, input []CreateTrackPointInput, userID uuid.UUID) error {
	for _, tp := range input {
		trackPoint := &models.TrackPoint{
			Lat:       tp.Lat,
			Lon:       tp.Lon,
			Alt:       tp.Alt,
			Speed:     tp.Speed,
			Timestamp: tp.Timestamp,
			UserID:    userID,
		}

		err := s.store.TrackPoint().Create(ctx, trackPoint)
		if err != nil {
			s.logger.Error("failed to create trackpoint", "user_id", userID, "error", err)
			return err
		}
	}

	return nil
}

func (s *TrackPointService) Delete(ctx context.Context, id uuid.UUID) error {
	err := s.store.TrackPoint().Delete(ctx, id)
	if err != nil {
		s.logger.Error("failed to delete trackpoint", "trackpoint_id", id, "error", err)
		return err
	}
	return nil
}

// Constante para el radio de la Tierra en metros
const earthRadius = 6371000

// toRadians convierte grados a radianes
func (s *TrackPointService) toRadians(deg float64) float64 {
	return deg * (math.Pi / 180)
}

// CalculateDistance calcula la distancia en metros entre dos puntos (lat1, lon1) y (lat2, lon2) usando Haversine
func (s *TrackPointService) calculateDistance(lat1, lon1, lat2, lon2 float64) float64 {
	dLat := s.toRadians(lat2 - lat1)
	dLon := s.toRadians(lon2 - lon1)

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(s.toRadians(lat1))*math.Cos(s.toRadians(lat2))*
			math.Sin(dLon/2)*math.Sin(dLon/2)

	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadius * c
}

// CalculateSpeed calcula la velocidad en km/h
// p1: punto anterior, p2: punto actual
func (s *TrackPointService) calculateSpeed(lat1, lon1 float64, time1 int64, lat2, lon2 float64, time2 int64) float64 {
	distanceMeters := s.calculateDistance(lat1, lon1, lat2, lon2)

	// Tiempo en segundos
	timeSeconds := float64(time2-time1) / 1000.0

	if timeSeconds <= 0 {
		return 0.0
	}

	// Metros por segundo (m/s)
	speedMps := distanceMeters / timeSeconds

	// Convertir a Kilómetros por hora (km/h)
	speedKmh := speedMps * 3.6

	return speedKmh
}
