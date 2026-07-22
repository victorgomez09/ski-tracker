package service

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/api/auth"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type PointDTO struct {
	Lat       float64   `json:"lat" binding:"required"`
	Lon       float64   `json:"lon" binding:"required"`
	Altitude  float64   `json:"altitude"`
	Speed     float64   `json:"speed"`
	Timestamp time.Time `json:"timestamp" binding:"required"`
}

type BatchPointsRequest struct {
	Points []PointDTO `json:"points" binding:"required"`
}

type EnrichedRunMetrics struct {
	VerticalDrop    float64
	MaxSpeed        float64
	AvgSpeed        float64
	TotalDistance   float64
	ElevationGain   float64
	ElevationLoss   float64
	MatchedPisteID  *string
	PredominantDiff string
}

type SkiSessionService struct {
	store      store.Store
	jwtManager *auth.JWTManager
	logger     *slog.Logger
}

func NewSkiSessionService(store store.Store, jwtManager *auth.JWTManager, logger *slog.Logger) *SkiSessionService {
	return &SkiSessionService{
		store:      store,
		jwtManager: jwtManager,
		logger:     logger,
	}
}

func (s *SkiSessionService) ListByResort(ctx context.Context, resortID string) ([]models.SkiSession, error) {
	sessions, err := s.store.SkiSession().ListByResortID(ctx, resortID)
	if err != nil {
		return nil, fmt.Errorf("failed to list ski sessions by resort: %w", err)
	}

	return sessions, nil
}

func (s *SkiSessionService) GetByID(ctx context.Context, sessionID uuid.UUID) (*models.SkiSession, error) {
	session, err := s.store.SkiSession().GetByID(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get ski session by ID: %w", err)
	}

	return session, nil
}

func (s *SkiSessionService) StartSession(ctx context.Context, userID uuid.UUID, resortID string) (*models.SkiSession, error) {
	session := &models.SkiSession{
		UserID:    userID,
		ResortID:  resortID,
		StartTime: time.Now(),
	}

	_, err := s.store.SkiSession().Create(ctx, session)
	if err != nil {
		return nil, fmt.Errorf("failed to start ski session: %w", err)
	}

	return session, nil
}

func (s *SkiSessionService) AddPoints(ctx context.Context, points []models.SessionPoint) error {
	err := s.store.SessionPoint().Bulk(ctx, &points)

	if err != nil {
		s.logger.Error("failed to add points", "error", err)
		return err
	}

	return nil
}

func (s *SkiSessionService) FinishSession(ctx context.Context, sessionID uuid.UUID) error {

	now := time.Now()
	err := s.store.SkiSession().Update(ctx, sessionID, now)

	if err != nil {
		return fmt.Errorf("failed to finish ski session: %w", err)
	}

	go func() {
		bgCtx := context.Background()
		if err := s.processSkiRunsAsync(bgCtx, sessionID); err != nil {
			s.logger.Error("failed to process ski runs asynchronously", "session_id", sessionID, "error", err)
		}
	}()

	return nil
}

func (s *SkiSessionService) processSkiRunsAsync(ctx context.Context, sessionID uuid.UUID) error {
	s.logger.Info("starting ski runs processing", "session_id", sessionID)

	// 1. Get all points for the session
	points, err := s.store.SessionPoint().GetBySessionID(ctx, sessionID)
	if err != nil || len(points) == 0 {
		return fmt.Errorf("no points found for session: %w", err)
	}

	// 2. Apply noise filter (Simple Moving Average)
	smoothedPoints := s.applyMovingAverage(points, 3)

	// 3. Segment the track into Lifts, Runs, or Pauses
	segments := s.segmentTrack(smoothedPoints)

	// 4. Save the detected runs in the database
	for _, seg := range segments {
		if seg.Type == "run" && len(seg.Points) > 10 {
			if err := s.processRunEnrichment(ctx, sessionID, seg.Points); err != nil {
				s.logger.Error("failed to process and enrich detected run", "error", err)
			}
		}
	}

	// 5. Calculate and save session-wide metrics
	sessionMetrics := s.calculatePhysicalMetrics(smoothedPoints)
	if err := s.store.SkiSession().UpdateMetrics(ctx, sessionID, sessionMetrics.TotalDistance, sessionMetrics.MaxSpeed, sessionMetrics.VerticalDrop); err != nil {
		s.logger.Error("failed to update session metrics", "session_id", sessionID, "error", err)
	}

	s.logger.Info("ski runs processing completed", "session_id", sessionID)
	return nil
}

func (s *SkiSessionService) applyMovingAverage(points []models.SessionPoint, windowSize int) []models.SessionPoint {
	if len(points) < windowSize {
		return points
	}
	smoothed := make([]models.SessionPoint, len(points))
	copy(smoothed, points)

	half := windowSize / 2
	for i := half; i < len(points)-half; i++ {
		var sumAlt, sumSpeed float64
		for j := i - half; j <= i+half; j++ {
			sumAlt += points[j].Altitude
			sumSpeed += points[j].Speed
		}
		smoothed[i].Altitude = sumAlt / float64(windowSize)
		smoothed[i].Speed = sumSpeed / float64(windowSize)
	}
	return smoothed
}

type TrackSegment struct {
	Type   string
	Points []models.SessionPoint
}

func (s *SkiSessionService) segmentTrack(points []models.SessionPoint) []TrackSegment {
	var segments []TrackSegment
	if len(points) == 0 {
		return segments
	}

	currentType := "unknown"
	var currentPoints []models.SessionPoint

	const minSpeedInactive = 0.5 // m/s
	const inactivityDuration = 2 * time.Minute

	for i := 0; i < len(points); i++ {
		p := points[i]

		// Check for prolonged stops
		if p.Speed < minSpeedInactive {
			if s.isProlongedStop(points, i, inactivityDuration) {
				if len(currentPoints) > 0 {
					segments = append(segments, TrackSegment{Type: currentType, Points: currentPoints})
					currentPoints = []models.SessionPoint{}
				}
				currentType = "inactive"
				for i < len(points) && points[i].Speed < minSpeedInactive {
					currentPoints = append(currentPoints, points[i])
					i++
				}
				i--
				continue
			}
		}

		// Altitude and speed heuristic
		pointType := currentType
		if i > 0 {
			altDiff := p.Altitude - points[i-1].Altitude
			if altDiff > 0.8 {
				pointType = "lift"
			} else if altDiff < -0.8 && p.Speed > 1.0 {
				pointType = "run"
			}
		}

		if currentType == "unknown" {
			currentType = pointType
		}

		if currentType == pointType {
			currentPoints = append(currentPoints, p)
		} else {
			if len(currentPoints) > 0 {
				segments = append(segments, TrackSegment{Type: currentType, Points: currentPoints})
			}
			currentType = pointType
			currentPoints = []models.SessionPoint{p}
		}
	}

	if len(currentPoints) > 0 {
		segments = append(segments, TrackSegment{Type: currentType, Points: currentPoints})
	}

	return segments
}

func (s *SkiSessionService) isProlongedStop(points []models.SessionPoint, currentIndex int, threshold time.Duration) bool {
	startTime := points[currentIndex].Timestamp
	for j := currentIndex; j < len(points); j++ {
		if points[j].Speed > 1.0 {
			return points[j].Timestamp.Sub(startTime) >= threshold
		}
	}
	return false
}

func (s *SkiSessionService) processRunEnrichment(ctx context.Context, sessionID uuid.UUID, runPoints []models.SessionPoint) error {
	if len(runPoints) == 0 {
		return nil
	}

	// 1. Calculate physical metrics of the run (Vertical drop, speeds, distance)
	metrics := s.calculatePhysicalMetrics(runPoints)

	// 2. Perform spatial Map Matching using PostGIS and the geometry_geojson (jsonb) columns
	matchedPisteID, difficulty, err := s.findMatchedPiste(ctx, runPoints)
	if err != nil {
		s.logger.Warn("could not match run to any piste", "error", err)
	}
	metrics.MatchedPisteID = matchedPisteID
	metrics.PredominantDiff = difficulty

	// 3. Create the processed run model to save it in the database
	skiRun := &models.SkiRun{
		SessionID:       sessionID,
		VerticalDrop:    metrics.VerticalDrop,
		MaxSpeed:        metrics.MaxSpeed,
		AvgSpeed:        metrics.AvgSpeed,
		TotalDistance:   metrics.TotalDistance,
		ElevationGain:   metrics.ElevationGain,
		ElevationLoss:   metrics.ElevationLoss,
		MatchedPisteID:  metrics.MatchedPisteID,
		PredominantDiff: metrics.PredominantDiff,
		TotalPoints:     len(runPoints),
	}
	_, err = s.store.SkiRun().Create(ctx, skiRun)
	if err != nil {
		return fmt.Errorf("failed to save enriched ski run: %w", err)
	}

	s.logger.Info("run successfully matched and enriched",
		"session_id", sessionID,
		"piste_id", metrics.MatchedPisteID,
		"difficulty", metrics.PredominantDiff,
		"distance_m", metrics.TotalDistance,
	)

	return nil
}

// -------------------------------------------------------------------------
// Auxiliary functions for metrics calculation and map matching
// -------------------------------------------------------------------------
func parsePointGeom(geom string) (lon float64, lat float64, ok bool) {
	if geom == "" {
		return 0, 0, false
	}

	var parsedLon, parsedLat float64
	if _, err := fmt.Sscanf(geom, "POINT(%f %f)", &parsedLon, &parsedLat); err != nil {
		return 0, 0, false
	}

	return parsedLon, parsedLat, true
}

func calculateHaversineDistanceMeters(prev, curr models.SessionPoint) float64 {
	prevLon, prevLat, okPrev := parsePointGeom(prev.Geom)
	currLon, currLat, okCurr := parsePointGeom(curr.Geom)
	if !okPrev || !okCurr {
		return 0
	}

	const earthRadiusMeters = 6371000.0
	prevLatRad := prevLat * math.Pi / 180
	currLatRad := currLat * math.Pi / 180
	dLat := (currLat - prevLat) * math.Pi / 180
	dLon := (currLon - prevLon) * math.Pi / 180

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(prevLatRad)*math.Cos(currLatRad)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusMeters * c
}

func (s *SkiSessionService) calculatePhysicalMetrics(points []models.SessionPoint) EnrichedRunMetrics {
	startAlt := points[0].Altitude
	endAlt := points[len(points)-1].Altitude
	verticalDrop := math.Max(0, startAlt-endAlt)

	maxSpeed := 0.0
	speedSum := 0.0
	elevationGain := 0.0
	elevationLoss := 0.0
	totalDistance := 0.0

	for i, p := range points {
		if p.Speed > maxSpeed {
			maxSpeed = p.Speed
		}
		speedSum += p.Speed

		if i > 0 {
			prev := points[i-1]
			altDiff := p.Altitude - prev.Altitude
			if altDiff > 0 {
				elevationGain += altDiff
			} else {
				elevationLoss += math.Abs(altDiff)
			}

			totalDistance += calculateHaversineDistanceMeters(prev, p)
		}
	}

	avgSpeed := speedSum / float64(len(points))

	return EnrichedRunMetrics{
		VerticalDrop:  verticalDrop,
		MaxSpeed:      maxSpeed,
		AvgSpeed:      avgSpeed,
		TotalDistance: totalDistance,
		ElevationGain: elevationGain,
		ElevationLoss: elevationLoss,
	}
}

// Map Matching adapted to read geometry from `geometry_geojson` (jsonb)
func (s *SkiSessionService) findMatchedPiste(ctx context.Context, points []models.SessionPoint) (*string, string, error) {
	// 1. Build WKT LineString with the points of the detected run
	wktLine := "LINESTRING("
	for i, p := range points {
		// Assuming you can extract the lon/lat coordinates from your Geom field (WKT type "POINT(lon lat)")
		// Or you can pass them directly. Simulated example extracting from the WKT string of the point:
		var lon, lat float64
		fmt.Sscanf(p.Geom, "POINT(%f %f)", &lon, &lat)

		wktLine += fmt.Sprintf("%f %f", lon, lat)
		if i < len(points)-1 {
			wktLine += ", "
		}
	}
	wktLine += ")"

	var result struct {
		ID         string
		Difficulty string
	}

	// 2. PostGIS Query: Parse jsonb (geometry_geojson) to geometry with ST_GeomFromGeoJSON
	// and calculate the minimum distance respect to the user's run line.
	query := `
		SELECT id, difficulty 
		FROM ski_pistes
		ORDER BY ST_Distance(
			ST_SetSRID(ST_GeomFromGeoJSON(geometry_geojson::text), 4326), 
			ST_GeomFromText(?, 4326)
		) ASC
		LIMIT 1;
	`

	err := s.store.SkiSession().Raw(ctx, query, wktLine, &result)
	if err != nil {
		return nil, "unknown", err
	}

	if result.ID == "" {
		return nil, "unknown", nil
	}
	if result.Difficulty == "" {
		result.Difficulty = "unknown"
	}

	return &result.ID, result.Difficulty, nil
}
