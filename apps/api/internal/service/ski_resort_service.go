package service

import (
	"context"
	"log/slog"
	"math"
	"strconv"

	"github.com/victorgomez09/ski-tracker/internal/apierr"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type ResortDetailDTO struct {
	models.SkiResort
	DistanceKM float64           `json:"distance_km"`
	Pistes     []models.SkiPiste `json:"pistes"`
	Lifts      []models.SkiLift  `json:"lifts"`
}

type SkiResortService struct {
	store  store.Store
	logger *slog.Logger
}

func NewSkiResortService(s store.Store, logger *slog.Logger) *SkiResortService {
	return &SkiResortService{store: s, logger: logger}
}

func (s *SkiResortService) List(ctx context.Context, latStr, lngStr, radStr string) ([]ResortDetailDTO, error) {
	userLat, err1 := strconv.ParseFloat(latStr, 64)
	userLng, err2 := strconv.ParseFloat(lngStr, 64)
	radiusKm, err3 := strconv.ParseFloat(radStr, 64)

	if err1 != nil || err2 != nil || err3 != nil {
		return nil, apierr.ErrBadRequest.WithDetail("lat, lng and radius must be valid numbers")
	}

	filter := store.SkiResortListFilter{
		Latitude:  &userLat,
		Longitude: &userLng,
		RadiusKm:  &radiusKm,
		// Status:    "operating",
	}

	resorts, err := s.store.SkiResort().ListAll(ctx, filter)
	if err != nil {
		return nil, err
	}

	var detailedResorts []ResortDetailDTO

	for _, resort := range resorts {
		pistes, err := s.store.SkiPiste().GetByResortID(ctx, resort.ID)
		if err != nil {
			pistes = []models.SkiPiste{}
		}

		lifts, err := s.store.SkiLift().GetByResortID(ctx, resort.ID)
		if err != nil {
			lifts = []models.SkiLift{}
		}

		dist := calculateDistance(userLat, userLng, resort.Latitude, resort.Longitude)

		detailedResorts = append(detailedResorts, ResortDetailDTO{
			SkiResort:  resort,
			DistanceKM: dist,
			Pistes:     pistes,
			Lifts:      lifts,
		})
	}

	return detailedResorts, nil
}

func (s *SkiResortService) ListByBBox(ctx context.Context, minLatStr, maxLatStr, minLonStr, maxLonStr string) ([]models.SkiResort, error) {
	minLat, err1 := strconv.ParseFloat(minLatStr, 64)
	maxLat, err2 := strconv.ParseFloat(maxLatStr, 64)
	minLon, err3 := strconv.ParseFloat(minLonStr, 64)
	maxLon, err4 := strconv.ParseFloat(maxLonStr, 64)

	if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
		return nil, apierr.ErrBadRequest.WithDetail("minLat, maxLat, minLon and maxLon must be valid numbers")
	}

	filter := store.SkiResortBBoxFilter{
		MinLatitude:  &minLat,
		MaxLatitude:  &maxLat,
		MinLongitude: &minLon,
		MaxLongitude: &maxLon,
	}

	resorts, err := s.store.SkiResort().ListByBBox(ctx, filter)
	if err != nil {
		return nil, err
	}

	return resorts, nil
}

func calculateDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusKm = 6371.0

	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLon := (lon2 - lon1) * math.Pi / 180.0

	rLat1 := lat1 * math.Pi / 180.0
	rLat2 := lat2 * math.Pi / 180.0

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Sin(dLon/2)*math.Sin(dLon/2)*math.Cos(rLat1)*math.Cos(rLat2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusKm * c
}
