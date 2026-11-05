package sync

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

// OsmXMLDoc represents the root of an OpenStreetMap XML document.
type OsmXMLDoc struct {
	XMLName xml.Name     `xml:"osm"`
	Nodes   []OsmXMLNode `xml:"node"`
	Ways    []OsmXMLWay  `xml:"way"`
}

// OsmXMLNode represents an OSM node element.
type OsmXMLNode struct {
	ID   int64        `xml:"id,attr"`
	Lat  float64      `xml:"lat,attr"`
	Lon  float64      `xml:"lon,attr"`
	Tags []OsmXMLTag  `xml:"tag"`
}

// OsmXMLWay represents an OSM way element.
type OsmXMLWay struct {
	ID    int64        `xml:"id,attr"`
	Nodes []OsmXMLNd   `xml:"nd"`
	Tags  []OsmXMLTag  `xml:"tag"`
}

// OsmXMLNd represents a node reference in an OSM way.
type OsmXMLNd struct {
	Ref int64 `xml:"ref,attr"`
}

// OsmXMLTag represents a key-value tag in OSM.
type OsmXMLTag struct {
	K string `xml:"k,attr"`
	V string `xml:"v,attr"`
}

// ClassifyPOICategory identifies category and default name for OSM tags.
func ClassifyPOICategory(tags map[string]string) (string, string) {
	amenity := tags["amenity"]
	tourism := tags["tourism"]
	shop := tags["shop"]
	emergency := tags["emergency"]
	ski := tags["ski"]
	aerialway := tags["aerialway"]
	name := tags["name"]

	// Ignore individual parking space nodes to prevent map clutter
	if amenity == "parking_space" {
		return "", ""
	}

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
			defaultName = strings.Title(strings.ReplaceAll(amenity, "_", " "))
		} else if tourism != "" {
			category = tourism
			defaultName = strings.Title(strings.ReplaceAll(tourism, "_", " "))
		} else {
			return "", ""
		}
	}

	if name == "" {
		name = defaultName
	}

	return category, name
}

// FetchPOIsFromOSM fetches nodes and ways in a 3.5 km bounding box around (lat, lon) and extracts POIs.
func FetchPOIsFromOSM(ctx context.Context, resortID string, lat, lon float64) ([]models.SkiResortPOI, error) {
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

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("OSM API rate limit exceeded (status 429)")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OSM API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var osmDoc OsmXMLDoc
	if err := xml.Unmarshal(body, &osmDoc); err != nil {
		return nil, fmt.Errorf("failed to parse OSM XML: %w", err)
	}

	nodeMap := make(map[int64][2]float64, len(osmDoc.Nodes))
	for _, n := range osmDoc.Nodes {
		nodeMap[n.ID] = [2]float64{n.Lat, n.Lon}
	}

	var pois []models.SkiResortPOI
	now := time.Now()

	for _, n := range osmDoc.Nodes {
		tags := make(map[string]string, len(n.Tags))
		tagsInterface := make(map[string]interface{}, len(n.Tags))
		for _, t := range n.Tags {
			tags[t.K] = t.V
			tagsInterface[t.K] = t.V
		}

		cat, name := ClassifyPOICategory(tags)
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
			CreatedAt: now,
		})
	}

	for _, w := range osmDoc.Ways {
		tags := make(map[string]string, len(w.Tags))
		tagsInterface := make(map[string]interface{}, len(w.Tags))
		for _, t := range w.Tags {
			tags[t.K] = t.V
			tagsInterface[t.K] = t.V
		}

		cat, name := ClassifyPOICategory(tags)
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
			CreatedAt: now,
		})
	}

	return pois, nil
}

// SyncPOIs synchronizes points of interest. By default, it bulk-downloads spots.geojson
// (which contains all OSM spots globally) and filters/matches them in the database without hitting rate limits.
// If opts.UseOSMMapAPI is true, it performs targeted bbox queries against the live OSM API.
func SyncPOIs(ctx context.Context, db *bun.DB, dedupMap map[string]string, logger *slog.Logger, opts SyncPOIOptions) error {
	if opts.UseOSMMapAPI {
		return syncPOIsFromOSMMapAPI(ctx, db, logger, opts)
	}

	spotsURL := "https://tiles.openskimap.org/geojson/spots.geojson"
	if opts.SpotsURL != "" {
		spotsURL = opts.SpotsURL
	}

	return syncSpotsStream(ctx, db, spotsURL, dedupMap, logger)
}

// --- BULK SPOTS GEOJSON SYNC (Direct download & DB filter) ---

type resortCoord struct {
	ID        string  `bun:"id"`
	Name      string  `bun:"name"`
	Latitude  float64 `bun:"latitude"`
	Longitude float64 `bun:"longitude"`
}

type resortSpatialIndex struct {
	grid      map[[2]int][]resortCoord
	validIDs  map[string]bool
}

func newResortSpatialIndex(resorts []resortCoord) *resortSpatialIndex {
	idx := &resortSpatialIndex{
		grid:     make(map[[2]int][]resortCoord),
		validIDs: make(map[string]bool, len(resorts)),
	}
	for _, r := range resorts {
		idx.validIDs[r.ID] = true
		if r.Latitude == 0 && r.Longitude == 0 {
			continue
		}
		key := [2]int{int(math.Floor(r.Latitude * 2)), int(math.Floor(r.Longitude * 2))}
		idx.grid[key] = append(idx.grid[key], r)
	}
	return idx
}

func (idx *resortSpatialIndex) findNearest(lat, lon, maxKm float64) (string, bool) {
	latBin := int(math.Floor(lat * 2))
	lonBin := int(math.Floor(lon * 2))
	var bestID string
	minDist := maxKm

	for dLat := -1; dLat <= 1; dLat++ {
		for dLon := -1; dLon <= 1; dLon++ {
			key := [2]int{latBin + dLat, lonBin + dLon}
			items := idx.grid[key]
			for _, item := range items {
				d := HaversineDistance(lat, lon, item.Latitude, item.Longitude)
				if d < minDist {
					minDist = d
					bestID = item.ID
				}
			}
		}
	}

	return bestID, bestID != ""
}

func syncSpotsStream(ctx context.Context, db *bun.DB, url string, dedupMap map[string]string, logger *slog.Logger) error {
	logger.Info("downloading and processing global spots/POIs dataset directly...")

	// 1. Load canonical resorts from database to build spatial index
	var resorts []resortCoord
	err := db.NewSelect().
		Table("ski_resorts").
		Column("id", "name", "latitude", "longitude").
		Scan(ctx, &resorts)
	if err != nil {
		return fmt.Errorf("failed to query resorts for spatial index: %w", err)
	}

	if len(resorts) == 0 {
		logger.Warn("no ski resorts found in database, skipping spots sync")
		return nil
	}

	resortGrid := newResortSpatialIndex(resorts)

	// 2. Download spots.geojson to temp file
	tmpFile, err := downloadToTempFile(ctx, url, "spots_*.geojson")
	if err != nil {
		return fmt.Errorf("failed to download spots geojson: %w", err)
	}
	defer func() {
		_ = tmpFile.Close()
		_ = os.Remove(tmpFile.Name())
	}()

	batch := make([]models.SkiResortPOI, 0, defaultBatchSize)
	totalProcessed := 0
	totalSaved := 0
	totalFilteredOut := 0

	err = streamGeoJSONFeatures(tmpFile, func(f GeoJSONFeature) error {
		totalProcessed++
		poi, ok := parseSpotFeature(f, dedupMap, resortGrid)
		if !ok {
			totalFilteredOut++
			return nil
		}

		batch = append(batch, *poi)
		totalSaved++

		if len(batch) >= defaultBatchSize {
			if err := savePOIsBatch(ctx, db, batch); err != nil {
				return err
			}
			batch = batch[:0]
			if totalSaved%10000 == 0 {
				logger.Info(fmt.Sprintf("synced %d spots/POIs...", totalSaved))
			}
		}
		return nil
	})

	if err != nil {
		return fmt.Errorf("failed to stream spots geojson: %w", err)
	}

	if len(batch) > 0 {
		if err := savePOIsBatch(ctx, db, batch); err != nil {
			return fmt.Errorf("failed to save final spots batch: %w", err)
		}
	}

	logger.Info("global spots/POIs synchronization completed successfully",
		slog.Int("total_spots_in_file", totalProcessed),
		slog.Int("total_pois_saved", totalSaved),
		slog.Int("filtered_out_unmatched", totalFilteredOut),
	)

	return nil
}

func parseSpotFeature(f GeoJSONFeature, dedupMap map[string]string, resortGrid *resortSpatialIndex) (*models.SkiResortPOI, bool) {
	if f.Properties == nil {
		return nil, false
	}

	id, _ := f.Properties["id"].(string)
	if id == "" {
		if idFloat, ok := f.Properties["id"].(float64); ok {
			id = fmt.Sprintf("%.0f", idFloat)
		} else {
			return nil, false
		}
	}

	lon, lat, ok := ExtractCoordinates(f.Geometry)
	if !ok || (lat == 0 && lon == 0) {
		return nil, false
	}

	spotType, _ := f.Properties["spotType"].(string)
	position, _ := f.Properties["position"].(string)
	name, _ := f.Properties["name"].(string)

	// Determine clean human-readable name if not provided
	if name == "" {
		switch spotType {
		case "lift_station":
			switch position {
			case "top":
				name = "Estación Superior"
			case "bottom":
				name = "Estación Inferior"
			case "mid":
				name = "Estación Intermedia"
			default:
				name = "Estación de Remonte"
			}
		case "halfpipe":
			name = "Halfpipe / Snowpark"
		case "crossing":
			name = "Cruce de Pista"
		case "avalanche_transceiver_checkpoint":
			name = "Control DVA"
		case "avalanche_transceiver_training":
			name = "Zona Entrenamiento DVA"
		default:
			if spotType != "" {
				name = strings.Title(strings.ReplaceAll(spotType, "_", " "))
			} else {
				name = "Punto de Interés"
			}
		}
	}

	// Category classification
	category := spotType
	switch spotType {
	case "lift_station":
		category = "lift_station"
	case "halfpipe":
		category = "snowpark"
	case "avalanche_transceiver_checkpoint", "avalanche_transceiver_training":
		category = "first_aid"
	case "crossing":
		category = "crossing"
	default:
		if category == "" {
			category = "poi"
		}
	}

	// Find associated resort ID
	var resortID string

	// 1. Direct skiAreas association
	if skiAreas, ok := f.Properties["skiAreas"].([]interface{}); ok && len(skiAreas) > 0 {
		if firstArea, ok := skiAreas[0].(map[string]interface{}); ok {
			if props, ok := firstArea["properties"].(map[string]interface{}); ok {
				if saID, ok := props["id"].(string); ok && saID != "" {
					resortID = saID
				}
			}
		}
	}

	// Remap with dedupMap if deduplicated
	if resortID != "" && len(dedupMap) > 0 {
		if canonicalID, ok := dedupMap[resortID]; ok {
			resortID = canonicalID
		}
	}

	// 2. If no direct resort ID or resort ID not in known canonical resorts, match nearest resort within 5.0 km
	if resortID == "" || !resortGrid.validIDs[resortID] {
		if nearestID, found := resortGrid.findNearest(lat, lon, 5.0); found {
			resortID = nearestID
		}
	}

	// Filter out spots that are not within 5 km of any ski resort
	if resortID == "" || !resortGrid.validIDs[resortID] {
		return nil, false
	}

	poiID := fmt.Sprintf("spot-%s", id)

	return &models.SkiResortPOI{
		ID:        poiID,
		ResortID:  resortID,
		Name:      name,
		Category:  category,
		Latitude:  lat,
		Longitude: lon,
		Tags:      f.Properties,
		CreatedAt: time.Now(),
	}, true
}

// --- TARGETED LIVE OSM MAP API SYNC ---

func syncPOIsFromOSMMapAPI(ctx context.Context, db *bun.DB, logger *slog.Logger, opts SyncPOIOptions) error {
	logger.Info("starting targeted POIs synchronization from OpenStreetMap API...")

	var resorts []models.SkiResort
	q := db.NewSelect().
		Model(&resorts).
		Column("id", "name", "country", "latitude", "longitude").
		Where("latitude != 0 AND longitude != 0")

	if opts.ResortID != "" {
		q = q.Where("id = ?", opts.ResortID)
	} else if opts.ResortName != "" {
		q = q.Where("LOWER(name) LIKE LOWER(?)", "%"+opts.ResortName+"%")
	} else {
		q = q.Where(`EXISTS (SELECT 1 FROM ski_pistes sp WHERE sp.resort_id = sr.id) OR 
		            EXISTS (SELECT 1 FROM ski_lifts sl WHERE sl.resort_id = sr.id)`)
	}

	if opts.Country != "" {
		q = q.Where("LOWER(country) = LOWER(?)", opts.Country)
	}

	if !opts.Force && opts.ResortID == "" {
		q = q.Where("NOT EXISTS (SELECT 1 FROM ski_resort_pois srp WHERE srp.resort_id = sr.id)")
	}

	q = q.Order("name ASC")

	if opts.Limit > 0 {
		q = q.Limit(opts.Limit)
	}

	if err := q.Scan(ctx); err != nil {
		return fmt.Errorf("failed to query resorts for targeted POI sync: %w", err)
	}

	if len(resorts) == 0 {
		logger.Info("no resorts need targeted POI synchronization")
		return nil
	}

	logger.Info("resorts selected for targeted POI sync", slog.Int("count", len(resorts)))

	workers := opts.Workers
	if workers <= 0 {
		workers = 2
	}

	type result struct {
		resort models.SkiResort
		pois   []models.SkiResortPOI
		err    error
	}

	resortChan := make(chan models.SkiResort, len(resorts))
	resultChan := make(chan result, len(resorts))

	for _, r := range resorts {
		resortChan <- r
	}
	close(resortChan)

	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for r := range resortChan {
				select {
				case <-ctx.Done():
					return
				default:
				}

				pois, err := FetchPOIsFromOSM(ctx, r.ID, r.Latitude, r.Longitude)
				resultChan <- result{resort: r, pois: pois, err: err}

				time.Sleep(1000 * time.Millisecond) // 1s polite delay
			}
		}(w)
	}

	go func() {
		wg.Wait()
		close(resultChan)
	}()

	totalSaved := 0
	processedCount := 0

	for res := range resultChan {
		processedCount++
		if res.err != nil {
			logger.Warn("failed to fetch POIs for resort",
				slog.String("resort_name", res.resort.Name),
				slog.String("resort_id", res.resort.ID),
				slog.Any("error", res.err),
			)
			continue
		}

		if len(res.pois) > 0 {
			if err := savePOIsBatch(ctx, db, res.pois); err != nil {
				logger.Warn("failed to save POIs for resort",
					slog.String("resort_name", res.resort.Name),
					slog.String("resort_id", res.resort.ID),
					slog.Any("error", err),
				)
				continue
			}
			totalSaved += len(res.pois)
			logger.Info(fmt.Sprintf("[%d/%d] synced POIs for %s (%d found)",
				processedCount, len(resorts), res.resort.Name, len(res.pois)))
		}
	}

	logger.Info("targeted POIs synchronization completed",
		slog.Int("resorts_processed", processedCount),
		slog.Int("total_pois_saved", totalSaved),
	)

	return nil
}

func savePOIsBatch(ctx context.Context, db *bun.DB, batch []models.SkiResortPOI) error {
	if len(batch) == 0 {
		return nil
	}

	const poiBatchSize = 500
	for i := 0; i < len(batch); i += poiBatchSize {
		end := i + poiBatchSize
		if end > len(batch) {
			end = len(batch)
		}
		chunk := batch[i:end]

		_, err := db.NewInsert().
			Model(&chunk).
			On("CONFLICT (id) DO UPDATE").
			Set("resort_id = EXCLUDED.resort_id").
			Set("name = EXCLUDED.name").
			Set("category = EXCLUDED.category").
			Set("latitude = EXCLUDED.latitude").
			Set("longitude = EXCLUDED.longitude").
			Set("tags = EXCLUDED.tags").
			Exec(ctx)

		if err != nil {
			return err
		}
	}

	return nil
}
