package service

import (
	"context"
	"database/sql"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/apierr"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type ResortDetailDTO struct {
	models.SkiResort
	DistanceKM  float64               `json:"distance_km"`
	TotalPistes int                   `json:"total_pistes"`
	TotalLifts  int                   `json:"total_lifts"`
	Pistes      []models.SkiPiste     `json:"pistes"`
	Lifts       []models.SkiLift      `json:"lifts"`
	POIs        []models.SkiResortPOI `json:"pois"`
}

type SkiResortService struct {
	store  store.Store
	logger *slog.Logger
}

func NewSkiResortService(s store.Store, logger *slog.Logger) *SkiResortService {
	return &SkiResortService{store: s, logger: logger}
}

func (s *SkiResortService) GetByID(ctx context.Context, id string) (ResortDetailDTO, error) {
	resort, err := s.store.SkiResort().GetByID(ctx, id)
	if err != nil {
		return ResortDetailDTO{}, err
	}

	result := ResortDetailDTO{
		SkiResort:  resort,
		DistanceKM: 0, // Distance is not calculated in this method
	}

	// Get total number of pistes for each resort
	pistes, err := s.store.SkiPiste().GetByResortID(ctx, resort.ID)
	if err != nil {
		s.logger.Error("failed to get pistes for resort", "resort_id", resort.ID, "error", err)
		return ResortDetailDTO{}, err
	}

	// calculate total distance of valid pistes for the resort
	pistes = mergeContiguousPistes(pistes)
	result.DistanceKM = calculateResortDownhillDistanceKM(resort, pistes)

	// Filter pistes with name for listing / display
	filterPistes := make([]models.SkiPiste, 0, len(pistes))
	for _, piste := range pistes {
		if piste.Name != "" {
			filterPistes = append(filterPistes, piste)
		}
	}
	result.TotalPistes = len(filterPistes)

	lifts, err := s.store.SkiLift().GetByResortID(ctx, resort.ID)
	if err != nil {
		s.logger.Error("failed to get lifts for resort", "resort_id", resort.ID, "error", err)
		return ResortDetailDTO{}, err
	}
	result.TotalLifts = len(lifts)
	result.Pistes = pistes
	result.Lifts = lifts

	pois, err := s.GetPOIsByResortID(ctx, resort.ID)
	if err != nil {
		s.logger.Warn("failed to get POIs for resort", "resort_id", resort.ID, "error", err)
	}
	result.POIs = pois

	return result, nil
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

		// calculate total distance of valid downhill pistes for the resort
		pistes = mergeContiguousPistes(pistes)
		result[i].DistanceKM = calculateResortDownhillDistanceKM(resort, pistes)

		// Filter pistes with name for listing / display
		filterPistes := make([]models.SkiPiste, 0, len(pistes))
		for _, piste := range pistes {
			if piste.Name != "" {
				filterPistes = append(filterPistes, piste)
			}
		}
		result[i].TotalPistes = len(filterPistes)

		lifts, err := s.store.SkiLift().GetByResortID(ctx, resort.ID)
		if err != nil {
			s.logger.Error("failed to get lifts for resort", "resort_id", resort.ID, "error", err)
			continue
		}
		result[i].TotalLifts = len(lifts)
		result[i].Pistes = pistes
		result[i].Lifts = lifts

		pois, err := s.GetPOIsByResortID(ctx, resort.ID)
		if err != nil {
			s.logger.Warn("failed to get POIs for resort", "resort_id", resort.ID, "error", err)
		}
		result[i].POIs = pois
	}

	return result, nil
}

func (s *SkiResortService) ListFavorites(ctx context.Context, userID uuid.UUID) ([]ResortDetailDTO, error) {
	resorts, err := s.store.SkiResort().ListFavorites(ctx, userID)
	if err != nil {
		return nil, err
	}

	result := make([]ResortDetailDTO, len(resorts))
	for i, resort := range resorts {
		result[i] = ResortDetailDTO{
			SkiResort:  resort,
			DistanceKM: 0,
		}
	}

	for i, resort := range resorts {
		pistes, err := s.store.SkiPiste().GetByResortID(ctx, resort.ID)
		if err != nil {
			s.logger.Error("failed to get pistes for favorite resort", "resort_id", resort.ID, "error", err)
			continue
		}

		pistes = mergeContiguousPistes(pistes)
		result[i].DistanceKM = calculateResortDownhillDistanceKM(resort, pistes)

		filterPistes := make([]models.SkiPiste, 0, len(pistes))
		for _, piste := range pistes {
			if piste.Name != "" {
				filterPistes = append(filterPistes, piste)
			}
		}
		result[i].TotalPistes = len(filterPistes)

		lifts, err := s.store.SkiLift().GetByResortID(ctx, resort.ID)
		if err != nil {
			s.logger.Error("failed to get lifts for favorite resort", "resort_id", resort.ID, "error", err)
			continue
		}
		result[i].TotalLifts = len(lifts)
		result[i].Pistes = pistes
		result[i].Lifts = lifts

		pois, err := s.GetPOIsByResortID(ctx, resort.ID)
		if err != nil {
			s.logger.Warn("failed to get POIs for favorite resort", "resort_id", resort.ID, "error", err)
		}
		result[i].POIs = pois
	}

	return result, nil
}

func (s *SkiResortService) AddFavorite(ctx context.Context, userID uuid.UUID, resortID string) error {
	return s.store.SkiResort().AddFavorite(ctx, userID, resortID)
}

func (s *SkiResortService) RemoveFavorite(ctx context.Context, userID uuid.UUID, resortID string) error {
	return s.store.SkiResort().RemoveFavorite(ctx, userID, resortID)
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

		pois, err := s.GetPOIsByResortID(ctx, resort.ID)
		if err != nil {
			pois = []models.SkiResortPOI{}
		}

		detailedResorts = append(detailedResorts, ResortDetailDTO{
			SkiResort:  resort,
			DistanceKM: dist,
			Pistes:     pistes,
			Lifts:      lifts,
			POIs:       pois,
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
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if resort == nil {
		return nil, nil
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

	pois, err := s.GetPOIsByResortID(ctx, resort.ID)
	if err != nil {
		pois = []models.SkiResortPOI{}
	}

	detailedResort := &ResortDetailDTO{
		SkiResort:  *resort,
		DistanceKM: dist,
		Pistes:     pistes,
		Lifts:      lifts,
		POIs:       pois,
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

		type gpItem struct {
			piste models.SkiPiste
			start PistePoint
			end   PistePoint
			ok    bool
		}

		gPistes := make([]gpItem, len(group))
		for idx, p := range group {
			start, end, ok := getEndpoints(p)
			gPistes[idx] = gpItem{
				piste: p,
				start: start,
				end:   end,
				ok:    ok,
			}
		}

		// Keep track of which pistes have been merged
		visited := make(map[int]bool)

		for i := 0; i < len(group); i++ {
			if visited[i] {
				continue
			}

			// Start a new line segment chain with current piste
			chain := []models.SkiPiste{gPistes[i].piste}
			visited[i] = true
			chainStart := gPistes[i].start
			chainEnd := gPistes[i].end
			okStart := gPistes[i].ok
			okEnd := gPistes[i].ok

			// Keep searching for other segments in the group to connect to the chain
			for {
				added := false
				for j := 0; j < len(group); j++ {
					if visited[j] {
						continue
					}

					seg := gPistes[j]
					if !okStart || !okEnd || !seg.ok {
						continue
					}

					// Only merge strictly sequential segments in the same direction (never reverse parallel forks)
					if pointsClose(chainEnd, seg.start) {
						// Append segment to the end
						chain = append(chain, seg.piste)
						chainEnd = seg.end
						visited[j] = true
						added = true
						break
					} else if pointsClose(chainStart, seg.end) {
						// Prepend segment to the start
						chain = append([]models.SkiPiste{seg.piste}, chain...)
						chainStart = seg.start
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

func (s *SkiResortService) GetPOIsByResortID(ctx context.Context, resortID string) ([]models.SkiResortPOI, error) {
	pois, err := s.store.SkiResort().GetPOIsByResortID(ctx, resortID)
	if err == nil && len(pois) > 0 {
		return pois, nil
	}

	resort, err := s.store.SkiResort().GetByID(ctx, resortID)
	if err != nil {
		return nil, err
	}

	fetched, err := s.fetchPOIsFromOSM(ctx, resortID, resort.Latitude, resort.Longitude)
	if err != nil {
		s.logger.Warn("failed to fetch POIs from OSM", "resort_id", resortID, "error", err)
		return pois, nil
	}

	if len(fetched) > 0 {
		if err := s.store.SkiResort().SavePOIs(ctx, fetched); err != nil {
			s.logger.Warn("failed to save POIs to database", "resort_id", resortID, "error", err)
		}
		return fetched, nil
	}

	return pois, nil
}

func (s *SkiResortService) RefreshPOIs(ctx context.Context, resortID string) ([]models.SkiResortPOI, error) {
	resort, err := s.store.SkiResort().GetByID(ctx, resortID)
	if err != nil {
		return nil, err
	}

	fetched, err := s.fetchPOIsFromOSM(ctx, resortID, resort.Latitude, resort.Longitude)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch POIs from OSM: %w", err)
	}

	if len(fetched) > 0 {
		if err := s.store.SkiResort().SavePOIs(ctx, fetched); err != nil {
			return nil, fmt.Errorf("failed to save refreshed POIs: %w", err)
		}
	}

	return fetched, nil
}

type osmXMLDoc struct {
	XMLName xml.Name     `xml:"osm"`
	Nodes   []osmXMLNode `xml:"node"`
	Ways    []osmXMLWay  `xml:"way"`
}

type osmXMLNode struct {
	ID   int64        `xml:"id,attr"`
	Lat  float64      `xml:"lat,attr"`
	Lon  float64      `xml:"lon,attr"`
	Tags []osmXMLTag  `xml:"tag"`
}

type osmXMLWay struct {
	ID    int64        `xml:"id,attr"`
	Nodes []osmXMLNd   `xml:"nd"`
	Tags  []osmXMLTag  `xml:"tag"`
}

type osmXMLNd struct {
	Ref int64 `xml:"ref,attr"`
}

type osmXMLTag struct {
	K string `xml:"k,attr"`
	V string `xml:"v,attr"`
}

func (s *SkiResortService) fetchPOIsFromOSM(ctx context.Context, resortID string, lat, lon float64) ([]models.SkiResortPOI, error) {
	// 3.5 km bounding box around resort center
	deltaLat := 3.5 / 111.0
	cosLat := math.Cos(lat * math.Pi / 180.0)
	if cosLat < 0.1 {
		cosLat = 0.1
	}
	deltaLon := 3.5 / (111.0 * cosLat)

	minLat := lat - deltaLat
	maxLat := lat + deltaLat
	minLon := lon - deltaLon
	maxLon := lon + deltaLon

	url := fmt.Sprintf("https://api.openstreetmap.org/api/0.6/map?bbox=%.6f,%.6f,%.6f,%.6f", minLon, minLat, maxLon, maxLat)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "SkiTrackerApp/1.0 (contact@skitracker.com)")

	client := &http.Client{Timeout: 12 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OSM API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var osmDoc osmXMLDoc
	if err := xml.Unmarshal(body, &osmDoc); err != nil {
		return nil, fmt.Errorf("failed to parse OSM XML: %w", err)
	}

	nodeMap := make(map[int64][2]float64, len(osmDoc.Nodes))
	for _, n := range osmDoc.Nodes {
		nodeMap[n.ID] = [2]float64{n.Lat, n.Lon}
	}

	var pois []models.SkiResortPOI

	for _, n := range osmDoc.Nodes {
		tags := make(map[string]string, len(n.Tags))
		tagsInterface := make(map[string]interface{}, len(n.Tags))
		for _, t := range n.Tags {
			tags[t.K] = t.V
			tagsInterface[t.K] = t.V
		}

		cat, name := classifyPOICategory(tags)
		if cat == "" {
			continue
		}

		pois = append(pois, models.SkiResortPOI{
			ID:        fmt.Sprintf("osm-node-%d", n.ID),
			ResortID:  resortID,
			Name:      name,
			Category:  cat,
			Latitude:  n.Lat,
			Longitude: n.Lon,
			Tags:      tagsInterface,
			CreatedAt: time.Now(),
		})
	}

	for _, w := range osmDoc.Ways {
		tags := make(map[string]string, len(w.Tags))
		tagsInterface := make(map[string]interface{}, len(w.Tags))
		for _, t := range w.Tags {
			tags[t.K] = t.V
			tagsInterface[t.K] = t.V
		}

		cat, name := classifyPOICategory(tags)
		if cat == "" {
			continue
		}

		var sumLat, sumLon float64
		var count int
		for _, nd := range w.Nodes {
			if pt, ok := nodeMap[nd.Ref]; ok {
				sumLat += pt[0]
				sumLon += pt[1]
				count++
			}
		}

		if count == 0 {
			continue
		}

		pois = append(pois, models.SkiResortPOI{
			ID:        fmt.Sprintf("osm-way-%d", w.ID),
			ResortID:  resortID,
			Name:      name,
			Category:  cat,
			Latitude:  sumLat / float64(count),
			Longitude: sumLon / float64(count),
			Tags:      tagsInterface,
			CreatedAt: time.Now(),
		})
	}

	return pois, nil
}

func classifyPOICategory(tags map[string]string) (string, string) {
	amenity := tags["amenity"]
	tourism := tags["tourism"]
	shop := tags["shop"]
	emergency := tags["emergency"]
	ski := tags["ski"]
	aerialway := tags["aerialway"]
	name := tags["name"]

	var category string
	var defaultName string

	switch {
	case amenity == "toilets":
		category = "toilets"
		defaultName = "Aseos"
	case amenity == "restaurant" || amenity == "fast_food":
		category = "restaurant"
		defaultName = "Restaurante"
	case amenity == "cafe" || amenity == "bar" || amenity == "pub":
		category = "cafe"
		defaultName = "Cafetería / Bar"
	case emergency == "first_aid" || emergency == "defibrillator" || amenity == "first_aid":
		category = "first_aid"
		defaultName = "Primeros Auxilios"
	case ski == "rental" || shop == "rental" || shop == "ski" || shop == "sports":
		category = "rental"
		defaultName = "Alquiler de Esquí"
	case ski == "school" || amenity == "ski_school":
		category = "ski_school"
		defaultName = "Escuela de Esquí"
	case tourism == "viewpoint":
		category = "viewpoint"
		defaultName = "Mirador"
	case tourism == "information" || aerialway == "ticket":
		category = "info"
		defaultName = "Información / Taquillas"
	case amenity == "parking":
		category = "parking"
		defaultName = "Aparcamiento"
	case tourism == "alpine_hut" || tourism == "hotel" || tourism == "hostel" || amenity == "shelter":
		category = "hotel"
		defaultName = "Refugio / Alojamiento"
	case amenity == "dressing_room":
		category = "dressing_room"
		defaultName = "Vestuarios"
	default:
		if amenity != "" {
			category = amenity
			defaultName = strings.Title(amenity)
		} else if tourism != "" {
			category = tourism
			defaultName = strings.Title(tourism)
		} else {
			return "", ""
		}
	}

	if name == "" {
		name = defaultName
	}

	return category, name
}

func calculateResortDownhillDistanceKM(resort models.SkiResort, pistes []models.SkiPiste) float64 {
	// 1. Try reading official downhill statistics from resort tags (precomputed by OpenSkiMap)
	if resort.Tags != nil {
		if stats, ok := resort.Tags["statistics"].(map[string]interface{}); ok {
			if runs, ok := stats["runs"].(map[string]interface{}); ok {
				if byActivity, ok := runs["byActivity"].(map[string]interface{}); ok {
					if downhill, ok := byActivity["downhill"].(map[string]interface{}); ok {
						if byDiff, ok := downhill["byDifficulty"].(map[string]interface{}); ok {
							var totalKm float64
							for _, diffData := range byDiff {
								if diffMap, ok := diffData.(map[string]interface{}); ok {
									if length, ok := diffMap["lengthInKm"].(float64); ok {
										totalKm += length
									}
								}
							}
							if totalKm > 0 {
								return math.Round(totalKm*10) / 10
							}
						}
					}
				}
			}
		}
	}

	// 2. Fallback: calculate distance of named downhill pistes from geometry (excluding unnamed connectors)
	var totalKm float64
	for _, piste := range pistes {
		if piste.Name == "" {
			continue
		}
		if piste.PisteType != "" && piste.PisteType != "downhill" && piste.PisteType != "alpine" {
			continue
		}
		coords, ok := piste.GeometryGeoJSON["coordinates"].([]interface{})
		if !ok || len(coords) < 2 {
			continue
		}
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
			totalKm += calculateDistance(latA, lonA, latB, lonB)
		}
	}
	return math.Round(totalKm*10) / 10
}
