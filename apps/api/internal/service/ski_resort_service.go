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
	DistanceKM  float64           `json:"distance_km"`
	TotalPistes int               `json:"total_pistes"`
	TotalLifts  int               `json:"total_lifts"`
	Pistes      []models.SkiPiste `json:"pistes"`
	Lifts       []models.SkiLift  `json:"lifts"`
}

type SkiResortService struct {
	store  store.Store
	logger *slog.Logger
}

func NewSkiResortService(s store.Store, logger *slog.Logger) *SkiResortService {
	return &SkiResortService{store: s, logger: logger}
}

func (s *SkiResortService) ListByName(ctx context.Context, name string) ([]ResortDetailDTO, error) {
	resorts, err := s.store.SkiResort().ListByName(ctx, name)
	if err != nil {
		return nil, err
	}

	result := make([]ResortDetailDTO, len(resorts))
	for i, resort := range resorts {
		result[i] = ResortDetailDTO{
			SkiResort:  resort,
			DistanceKM: 0, // Distance is not calculated in this method
		}
	}

	// Get total number of pistes for each resort
	for i, resort := range resorts {
		pistes, err := s.store.SkiPiste().GetByResortID(ctx, resort.ID)
		if err != nil {
			s.logger.Error("failed to get pistes for resort", "resort_id", resort.ID, "error", err)
			continue
		}

		// calculate total distance of pistes for the resort, filter only by pistes with name
		pistes = mergeContiguousPistes(pistes)
		filterPistes := make([]models.SkiPiste, 0, len(pistes))
		for _, piste := range pistes {
			if piste.Name != "" {
				filterPistes = append(filterPistes, piste)
			}
		}
		result[i].TotalPistes = len(filterPistes)
		totalKmOfPistes := 0.0
		for _, piste := range filterPistes {
			coords, ok := piste.GeometryGeoJSON["coordinates"].([]interface{})
			if !ok || len(coords) < 2 {
				continue
			}

			// Calculate the total distance of the piste by summing the distances between consecutive points
			for j := 0; j < len(coords)-1; j++ {
				pointA, okA := coords[j].([]interface{})
				pointB, okB := coords[j+1].([]interface{})
				if !okA || !okB || len(pointA) < 2 || len(pointB) < 2 {
					continue
				}

				latA, okLatA := pointA[1].(float64)
				lonA, okLonA := pointA[0].(float64)
				latB, okLatB := pointB[1].(float64)
				lonB, okLonB := pointB[0].(float64)

				if !okLatA || !okLonA || !okLatB || !okLonB {
					continue
				}

				totalKmOfPistes += calculateDistance(latA, lonA, latB, lonB)
			}
		}
		result[i].DistanceKM = totalKmOfPistes

		lifts, err := s.store.SkiLift().GetByResortID(ctx, resort.ID)
		if err != nil {
			s.logger.Error("failed to get lifts for resort", "resort_id", resort.ID, "error", err)
			continue
		}
		result[i].TotalLifts = len(lifts)
	}

	return result, nil
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
		Status:    "operating",
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

		// Merge contiguous pistes with the same Name, Difficulty, and PisteType
		pistes = mergeContiguousPistes(pistes)

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

func (s *SkiResortService) GetByCloseness(ctx context.Context, latStr, lngStr string) (*ResortDetailDTO, error) {
	userLat, err1 := strconv.ParseFloat(latStr, 64)
	userLng, err2 := strconv.ParseFloat(lngStr, 64)

	if err1 != nil || err2 != nil {
		return nil, apierr.ErrBadRequest.WithDetail("lat and lng must be valid numbers")
	}

	resort, err := s.store.SkiResort().GetByCloseness(ctx, userLat, userLng)
	if err != nil {
		return nil, err
	}

	pistes, err := s.store.SkiPiste().GetByResortID(ctx, resort.ID)
	if err != nil {
		pistes = []models.SkiPiste{}
	}

	// Merge contiguous pistes with the same Name, Difficulty, and PisteType
	pistes = mergeContiguousPistes(pistes)

	lifts, err := s.store.SkiLift().GetByResortID(ctx, resort.ID)
	if err != nil {
		lifts = []models.SkiLift{}
	}

	dist := calculateDistance(userLat, userLng, resort.Latitude, resort.Longitude)

	detailedResort := &ResortDetailDTO{
		SkiResort:  *resort,
		DistanceKM: dist,
		Pistes:     pistes,
		Lifts:      lifts,
	}

	return detailedResort, nil
}

type PistePoint struct {
	X float64
	Y float64
}

func getEndpoints(piste models.SkiPiste) (PistePoint, PistePoint, bool) {
	geom, ok := piste.GeometryGeoJSON["coordinates"].([]interface{})
	if !ok || len(geom) < 2 {
		return PistePoint{}, PistePoint{}, false
	}
	// Let's get the first and last point
	first, ok1 := geom[0].([]interface{})
	last, ok2 := geom[len(geom)-1].([]interface{})
	if !ok1 || !ok2 || len(first) < 2 || len(last) < 2 {
		return PistePoint{}, PistePoint{}, false
	}

	fX, o1 := first[0].(float64)
	fY, o2 := first[1].(float64)
	lX, o3 := last[0].(float64)
	lY, o4 := last[1].(float64)

	if !o1 || !o2 || !o3 || !o4 {
		return PistePoint{}, PistePoint{}, false
	}

	return PistePoint{X: fX, Y: fY}, PistePoint{X: lX, Y: lY}, true
}

func pointsClose(p1, p2 PistePoint) bool {
	// Let's use a small epsilon for coordinate matching (e.g. ~1-2 meters in degrees is roughly 0.00002)
	const eps = 0.00005
	return math.Abs(p1.X-p2.X) < eps && math.Abs(p1.Y-p2.Y) < eps
}

func mergeContiguousPistes(pistes []models.SkiPiste) []models.SkiPiste {
	if len(pistes) <= 1 {
		return pistes
	}

	// Group pistes by Name + PisteType (we group segments with different difficulties together to merge them)
	type groupKey struct {
		Name      string
		PisteType string
	}

	groups := make(map[groupKey][]models.SkiPiste)
	var namelessOrSingle []models.SkiPiste

	for _, p := range pistes {
		if p.Name == "" {
			namelessOrSingle = append(namelessOrSingle, p)
			continue
		}
		key := groupKey{
			Name:      p.Name,
			PisteType: p.PisteType,
		}
		groups[key] = append(groups[key], p)
	}

	mergedPistes := namelessOrSingle

	// Helper to determine the highest difficulty
	difficultyOrder := map[string]int{
		"novice":       1,
		"easy":         2,
		"intermediate": 3,
		"advanced":     4,
	}

	for _, group := range groups {
		if len(group) <= 1 {
			mergedPistes = append(mergedPistes, group...)
			continue
		}

		// Keep track of which pistes have been merged
		visited := make(map[int]bool)

		for i := 0; i < len(group); i++ {
			if visited[i] {
				continue
			}

			// Start a new line segment chain with current piste
			chain := []models.SkiPiste{group[i]}
			visited[i] = true

			// Keep searching for other segments in the group to connect to the chain
			for {
				added := false
				for j := 0; j < len(group); j++ {
					if visited[j] {
						continue
					}

					// Get start and end points of our current chain
					chainStart, _, okStart := getEndpoints(chain[0])
					_, chainEnd, okEnd := getEndpoints(chain[len(chain)-1])
					segStart, segEnd, okSeg := getEndpoints(group[j])

					if !okStart || !okEnd || !okSeg {
						continue
					}

					// Let's see if we can append or prepend group[j]
					if pointsClose(chainEnd, segStart) {
						// Append segment to the end
						chain = append(chain, group[j])
						visited[j] = true
						added = true
						break
					} else if pointsClose(chainEnd, segEnd) {
						// Append segment to the end, but reverse its coordinates first
						reversed := reverseCoordinates(group[j])
						chain = append(chain, reversed)
						visited[j] = true
						added = true
						break
					} else if pointsClose(chainStart, segEnd) {
						// Prepend segment to the start
						chain = append([]models.SkiPiste{group[j]}, chain...)
						visited[j] = true
						added = true
						break
					} else if pointsClose(chainStart, segStart) {
						// Prepend segment to the start, but reverse its coordinates first
						reversed := reverseCoordinates(group[j])
						chain = append([]models.SkiPiste{reversed}, chain...)
						visited[j] = true
						added = true
						break
					}
				}
				if !added {
					break
				}
			}

			// Now merge the chain into a single SkiPiste
			if len(chain) == 1 {
				mergedPistes = append(mergedPistes, chain[0])
			} else {
				mergedPiste := chain[0]
				var mergedCoords []interface{}

				// Extract coordinates from each segment in the chain and combine them
				for idx, item := range chain {
					coords, ok := item.GeometryGeoJSON["coordinates"].([]interface{})
					if !ok {
						continue
					}
					if idx == 0 {
						mergedCoords = append(mergedCoords, coords...)
					} else {
						// Skip the first coordinate to avoid duplicate points
						if len(coords) > 1 {
							mergedCoords = append(mergedCoords, coords[1:]...)
						}
					}
				}

				// Construct the new geometry
				newGeom := make(map[string]interface{})
				for k, v := range mergedPiste.GeometryGeoJSON {
					newGeom[k] = v
				}
				newGeom["coordinates"] = mergedCoords
				mergedPiste.GeometryGeoJSON = newGeom

				// Determine highest difficulty in the chain
				highestDifficulty := mergedPiste.Difficulty
				for _, item := range chain {
					if difficultyOrder[item.Difficulty] > difficultyOrder[highestDifficulty] {
						highestDifficulty = item.Difficulty
					}
				}
				mergedPiste.Difficulty = highestDifficulty

				// Combine elevation heights if they exist in tags
				var combinedHeights []interface{}
				var resolution float64 = 25.0
				hasElevations := true

				for _, item := range chain {
					if elev, ok := item.Tags["elevationProfile"].(map[string]interface{}); ok {
						if hs, ok := elev["heights"].([]interface{}); ok && len(hs) > 0 {
							if res, ok := elev["resolution"].(float64); ok {
								resolution = res
							}
							if len(combinedHeights) == 0 {
								combinedHeights = append(combinedHeights, hs...)
							} else {
								if len(hs) > 1 {
									combinedHeights = append(combinedHeights, hs[1:]...)
								}
							}
						} else {
							hasElevations = false
						}
					} else {
						hasElevations = false
					}
				}

				if hasElevations && len(combinedHeights) > 0 {
					newTags := make(map[string]interface{})
					for k, v := range mergedPiste.Tags {
						newTags[k] = v
					}
					newTags["elevationProfile"] = map[string]interface{}{
						"heights":    combinedHeights,
						"resolution": resolution,
					}
					mergedPiste.Tags = newTags
				}

				mergedPistes = append(mergedPistes, mergedPiste)
			}
		}
	}

	return mergedPistes
}

func reverseCoordinates(piste models.SkiPiste) models.SkiPiste {
	coords, ok := piste.GeometryGeoJSON["coordinates"].([]interface{})
	if !ok {
		return piste
	}
	n := len(coords)
	revCoords := make([]interface{}, n)
	for i := 0; i < n; i++ {
		revCoords[i] = coords[n-1-i]
	}

	newGeom := make(map[string]interface{})
	for k, v := range piste.GeometryGeoJSON {
		newGeom[k] = v
	}
	newGeom["coordinates"] = revCoords
	piste.GeometryGeoJSON = newGeom

	// If there's an elevation profile, reverse its heights too
	if elev, ok := piste.Tags["elevationProfile"].(map[string]interface{}); ok {
		if hs, ok := elev["heights"].([]interface{}); ok && len(hs) > 0 {
			revHeights := make([]interface{}, len(hs))
			for i := 0; i < len(hs); i++ {
				revHeights[i] = hs[len(hs)-1-i]
			}
			newTags := make(map[string]interface{})
			for k, v := range piste.Tags {
				newTags[k] = v
			}
			newTags["elevationProfile"] = map[string]interface{}{
				"heights":    revHeights,
				"resolution": elev["resolution"],
			}
			piste.Tags = newTags
		}
	}

	return piste
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
