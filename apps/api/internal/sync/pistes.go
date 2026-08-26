package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"runtime"
	"runtime/debug"
	"strconv"

	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type GeoJSONFeature struct {
	Type       string                 `json:"type"`
	ID         interface{}            `json:"id"`
	Geometry   map[string]interface{} `json:"geometry"`
	Properties map[string]interface{} `json:"properties"`
}

// HasPistesData checks if the database already contains resorts/pistes data.
func HasPistesData(ctx context.Context, db *bun.DB) (bool, error) {
	resortsCount, err := db.NewSelect().Model((*models.SkiResort)(nil)).Count(ctx)
	if err != nil {
		return false, err
	}
	if resortsCount == 0 {
		return false, nil
	}

	pistesCount, err := db.NewSelect().Model((*models.SkiPiste)(nil)).Count(ctx)
	if err != nil {
		return false, err
	}
	return pistesCount > 0, nil
}

// SyncPistesDataIfEmpty runs sync only if the database does not already contain ski resorts.
func SyncPistesDataIfEmpty(ctx context.Context, db *bun.DB, logger *slog.Logger) error {
	hasData, err := HasPistesData(ctx, db)
	if err != nil {
		return fmt.Errorf("failed to check existing pistes data: %w", err)
	}
	if hasData {
		logger.Info("ski resorts and pistes data already present in database, skipping startup sync")
		return nil
	}
	return SyncPistesData(ctx, db, logger)
}

// SyncPistesData downloads global resort, piste, and lift data and updates the database using streaming
func SyncPistesData(ctx context.Context, db *bun.DB, logger *slog.Logger) error {
	logger.Info("starting global pistes data synchronization")

	// Dynamic memory tuning for ARM / constrained environments (e.g. Raspberry Pi)
	if runtime.GOARCH == "arm" || runtime.GOARCH == "arm64" {
		logger.Info("detected ARM architecture - applying memory optimizations for sync",
			slog.String("arch", runtime.GOARCH),
		)
		oldGC := debug.SetGCPercent(50)
		defer func() {
			debug.SetGCPercent(oldGC)
			runtime.GC()
			debug.FreeOSMemory()
		}()
	} else {
		defer func() {
			runtime.GC()
			debug.FreeOSMemory()
		}()
	}

	pistesURL := "https://tiles.openskimap.org/geojson/runs.geojson"
	liftsURL := "https://tiles.openskimap.org/geojson/lifts.geojson"
	resortsURL := "https://tiles.openskimap.org/geojson/ski_areas.geojson"

	// Process Resorts (Streaming)
	logger.Info("downloading and streaming resorts data...")
	if err := syncResortsStream(ctx, db, resortsURL, logger); err != nil {
		return fmt.Errorf("failed to sync resorts: %w", err)
	}

	// Process Pistes (Streaming)
	logger.Info("downloading and streaming pistes data...")
	if err := syncPistesStream(ctx, db, pistesURL, logger); err != nil {
		return fmt.Errorf("failed to sync pistes: %w", err)
	}

	// Process Lifts (Streaming)
	logger.Info("downloading and streaming lifts data...")
	if err := syncLiftsStream(ctx, db, liftsURL, logger); err != nil {
		return fmt.Errorf("failed to sync lifts: %w", err)
	}

	logger.Info("global synchronization completed successfully")
	return nil
}

// --- STREAMING PARSER ENGINE ---

// streamGeoJSONFeatures reads a GeoJSON FeatureCollection stream from an io.Reader and invokes handleFeature for each feature
func streamGeoJSONFeatures(r io.Reader, handleFeature func(f GeoJSONFeature) error) error {
	dec := json.NewDecoder(r)

	// Expect start of JSON object '{'
	tok, err := dec.Token()
	if err != nil {
		return fmt.Errorf("failed to read JSON start: %w", err)
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '{' {
		return fmt.Errorf("expected '{' at beginning of GeoJSON, got %v", tok)
	}

	// Seek to the "features" key
	foundFeatures := false
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return fmt.Errorf("error reading JSON key: %w", err)
		}
		key, ok := tok.(string)
		if !ok {
			continue
		}
		if key == "features" {
			foundFeatures = true
			break
		}
		// Skip values for other keys (e.g. "type": "FeatureCollection")
		var dummy json.RawMessage
		if err := dec.Decode(&dummy); err != nil {
			return fmt.Errorf("error skipping property %s: %w", key, err)
		}
	}

	if !foundFeatures {
		return fmt.Errorf("could not find 'features' array in GeoJSON")
	}

	// Expect start of features array '['
	tok, err = dec.Token()
	if err != nil {
		return fmt.Errorf("failed to read features array start: %w", err)
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '[' {
		return fmt.Errorf("expected '[' for features array, got %v", tok)
	}

	// Stream decode each feature individually
	for dec.More() {
		var f GeoJSONFeature
		if err := dec.Decode(&f); err != nil {
			return fmt.Errorf("failed to decode GeoJSON feature: %w", err)
		}
		if err := handleFeature(f); err != nil {
			return err
		}
	}

	return nil
}

// --- STREAMING PROCESSORS ---

const batchSize = 1000

func syncResortsStream(ctx context.Context, db *bun.DB, url string, logger *slog.Logger) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected HTTP status: %d", resp.StatusCode)
	}

	batch := make([]models.SkiResort, 0, batchSize)
	total := 0

	err = streamGeoJSONFeatures(resp.Body, func(f GeoJSONFeature) error {
		resort, ok := parseResortFeature(f)
		if !ok {
			return nil
		}
		batch = append(batch, *resort)
		total++

		if len(batch) >= batchSize {
			if err := saveResortsBatch(ctx, db, batch); err != nil {
				return err
			}
			batch = batch[:0]
		}
		return nil
	})

	if err != nil {
		return err
	}

	if len(batch) > 0 {
		if err := saveResortsBatch(ctx, db, batch); err != nil {
			return err
		}
	}

	logger.Info("ski resorts saved/updated successfully", slog.Int("total", total))
	return nil
}

func syncPistesStream(ctx context.Context, db *bun.DB, url string, logger *slog.Logger) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected HTTP status: %d", resp.StatusCode)
	}

	batch := make([]models.SkiPiste, 0, batchSize)
	total := 0

	err = streamGeoJSONFeatures(resp.Body, func(f GeoJSONFeature) error {
		piste, ok := parsePisteFeature(f)
		if !ok {
			return nil
		}
		batch = append(batch, *piste)
		total++

		if len(batch) >= batchSize {
			if err := savePistesBatch(ctx, db, batch); err != nil {
				return err
			}
			batch = batch[:0]
			if total%10000 == 0 {
				logger.Info(fmt.Sprintf("synced %d pistes...", total))
			}
		}
		return nil
	})

	if err != nil {
		return err
	}

	if len(batch) > 0 {
		if err := savePistesBatch(ctx, db, batch); err != nil {
			return err
		}
	}

	logger.Info("pistes saved/updated successfully", slog.Int("total", total))
	return nil
}

func syncLiftsStream(ctx context.Context, db *bun.DB, url string, logger *slog.Logger) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected HTTP status: %d", resp.StatusCode)
	}

	batch := make([]models.SkiLift, 0, batchSize)
	total := 0

	err = streamGeoJSONFeatures(resp.Body, func(f GeoJSONFeature) error {
		lift, ok := parseLiftFeature(f)
		if !ok {
			return nil
		}
		batch = append(batch, *lift)
		total++

		if len(batch) >= batchSize {
			if err := saveLiftsBatch(ctx, db, batch); err != nil {
				return err
			}
			batch = batch[:0]
			if total%10000 == 0 {
				logger.Info(fmt.Sprintf("synced %d lifts...", total))
			}
		}
		return nil
	})

	if err != nil {
		return err
	}

	if len(batch) > 0 {
		if err := saveLiftsBatch(ctx, db, batch); err != nil {
			return err
		}
	}

	logger.Info("lifts saved/updated successfully", slog.Int("total", total))
	return nil
}

// --- FEATURE PARSERS ---

func parseResortFeature(f GeoJSONFeature) (*models.SkiResort, bool) {
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

	name, _ := f.Properties["name"].(string)
	if name == "" {
		name = "No name"
	}

	var lat, lon float64
	if geomType, ok := f.Geometry["type"].(string); ok {
		switch geomType {
		case "Point":
			if coords, ok := f.Geometry["coordinates"].([]interface{}); ok && len(coords) == 2 {
				lon, _ = coords[0].(float64)
				lat, _ = coords[1].(float64)
			}
		case "Polygon":
			if rings, ok := f.Geometry["coordinates"].([]interface{}); ok && len(rings) > 0 {
				if ring, ok := rings[0].([]interface{}); ok && len(ring) > 0 {
					if coords, ok := ring[0].([]interface{}); ok && len(coords) == 2 {
						lon, _ = coords[0].(float64)
						lat, _ = coords[1].(float64)
					}
				}
			}
		case "MultiPolygon":
			if polys, ok := f.Geometry["coordinates"].([]interface{}); ok && len(polys) > 0 {
				if rings, ok := polys[0].([]interface{}); ok && len(rings) > 0 {
					if ring, ok := rings[0].([]interface{}); ok && len(ring) > 0 {
						if coords, ok := ring[0].([]interface{}); ok && len(coords) == 2 {
							lon, _ = coords[0].(float64)
							lat, _ = coords[1].(float64)
						}
					}
				}
			}
		}
	}

	if lat == 0 && lon == 0 {
		if viewport, ok := f.Properties["viewportHint"].(map[string]interface{}); ok {
			if center, ok := viewport["center"].([]interface{}); ok && len(center) == 2 {
				lon, _ = center[0].(float64)
				lat, _ = center[1].(float64)
			}
		}
	}

	country := "Unknown"
	if places, ok := f.Properties["places"].([]interface{}); ok && len(places) > 0 {
		if firstPlace, ok := places[0].(map[string]interface{}); ok {
			if countryCode, ok := firstPlace["iso3166_1Alpha2"].(string); ok && countryCode != "" {
				country = countryCode
			}

			if localized, ok := firstPlace["localized"].(map[string]interface{}); ok {
				if en, ok := localized["en"].(map[string]interface{}); ok {
					if countryName, ok := en["country"].(string); ok && countryName != "" {
						country = countryName
					}
				}
			}
		}
	}

	website := ""
	if websites, ok := f.Properties["websites"].([]interface{}); ok && len(websites) > 0 {
		if firstWeb, ok := websites[0].(string); ok {
			website = firstWeb
		}
	}

	return &models.SkiResort{
		ID:        id,
		Name:      name,
		Country:   country,
		Latitude:  lat,
		Longitude: lon,
		Website:   website,
		Tags:      f.Properties,
	}, true
}

func parsePisteFeature(f GeoJSONFeature) (*models.SkiPiste, bool) {
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

	name, _ := f.Properties["name"].(string)

	pType, _ := f.Properties["type"].(string)
	if pType == "" {
		pType, _ = f.Properties["piste:type"].(string)
	}

	if pType == "run" {
		if uses, ok := f.Properties["uses"].([]interface{}); ok && len(uses) > 0 {
			if firstUse, ok := uses[0].(string); ok {
				pType = firstUse
			}
		}
	}

	difficulty, _ := f.Properties["difficulty"].(string)
	if difficulty == "" {
		difficulty, _ = f.Properties["piste:difficulty"].(string)
	}

	var lit bool
	if litVal := f.Properties["lit"]; litVal != nil {
		if litBool, ok := litVal.(bool); ok {
			lit = litBool
		} else if litStr, ok := litVal.(string); ok {
			lit = (litStr == "yes" || litStr == "true")
		}
	} else if pisteLitVal := f.Properties["piste:lit"]; pisteLitVal != nil {
		if litBool, ok := pisteLitVal.(bool); ok {
			lit = litBool
		} else if litStr, ok := pisteLitVal.(string); ok {
			lit = (litStr == "yes" || litStr == "true")
		}
	}

	var resortID *string
	if skiAreas, ok := f.Properties["skiAreas"].([]interface{}); ok && len(skiAreas) > 0 {
		if firstArea, ok := skiAreas[0].(map[string]interface{}); ok {
			if properties, ok := firstArea["properties"].(map[string]interface{}); ok {
				if skiAreaID, ok := properties["id"].(string); ok && skiAreaID != "" {
					resortID = &skiAreaID
				}
			}
		}
	}

	return &models.SkiPiste{
		ID:              id,
		ResortID:        resortID,
		Name:            name,
		PisteType:       pType,
		Difficulty:      difficulty,
		Lit:             lit,
		GeometryGeoJSON: f.Geometry,
		Tags:            f.Properties,
	}, true
}

func parseLiftFeature(f GeoJSONFeature) (*models.SkiLift, bool) {
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

	name, _ := f.Properties["name"].(string)

	lType, _ := f.Properties["liftType"].(string)
	if lType == "" {
		lType, _ = f.Properties["type"].(string)
	}
	if lType == "" {
		lType, _ = f.Properties["aerialway"].(string)
	}

	capacity := 1
	if capVal := f.Properties["capacity"]; capVal != nil {
		if capFloat, ok := capVal.(float64); ok {
			capacity = int(capFloat)
		} else if capStr, ok := capVal.(string); ok {
			if parsedCap, err := strconv.Atoi(capStr); err == nil {
				capacity = parsedCap
			}
		}
	}

	occupancy := 1
	if occVal := f.Properties["occupancy"]; occVal != nil {
		if occFloat, ok := occVal.(float64); ok {
			occupancy = int(occFloat)
		} else if occStr, ok := occVal.(string); ok {
			if parsedOcc, err := strconv.Atoi(occStr); err == nil {
				occupancy = parsedOcc
			}
		}
	}

	var resortID *string
	if skiAreas, ok := f.Properties["skiAreas"].([]interface{}); ok && len(skiAreas) > 0 {
		if firstArea, ok := skiAreas[0].(map[string]interface{}); ok {
			if properties, ok := firstArea["properties"].(map[string]interface{}); ok {
				if skiAreaID, ok := properties["id"].(string); ok && skiAreaID != "" {
					resortID = &skiAreaID
				}
			}
		}
	}

	if resortID == nil {
		if saID, ok := f.Properties["ski_area_id"].(string); ok && saID != "" {
			resortID = &saID
		} else if saFloat, ok := f.Properties["ski_area_id"].(float64); ok {
			strID := fmt.Sprintf("%.0f", saFloat)
			resortID = &strID
		}
	}

	return &models.SkiLift{
		ID:              id,
		ResortID:        resortID,
		Name:            name,
		LiftType:        lType,
		Capacity:        occupancy,
		CapacityHourly:  capacity,
		GeometryGeoJSON: f.Geometry,
		Tags:            f.Properties,
	}, true
}

// --- DATABASE BATCH INSERTS ---

func saveResortsBatch(ctx context.Context, db *bun.DB, batch []models.SkiResort) error {
	if len(batch) == 0 {
		return nil
	}

	_, err := db.NewInsert().
		Model(&batch).
		On("CONFLICT (id) DO UPDATE").
		Set("name = EXCLUDED.name").
		Set("country = EXCLUDED.country").
		Set("website = EXCLUDED.website").
		Set("latitude = EXCLUDED.latitude").
		Set("longitude = EXCLUDED.longitude").
		Set("tags = EXCLUDED.tags").
		Exec(ctx)

	return err
}

func savePistesBatch(ctx context.Context, db *bun.DB, batch []models.SkiPiste) error {
	if len(batch) == 0 {
		return nil
	}

	_, err := db.NewInsert().
		Model(&batch).
		On("CONFLICT (id) DO UPDATE").
		Set("resort_id = EXCLUDED.resort_id").
		Set("name = EXCLUDED.name").
		Set("piste_type = EXCLUDED.piste_type").
		Set("difficulty = EXCLUDED.difficulty").
		Set("lit = EXCLUDED.lit").
		Set("geometry_geojson = EXCLUDED.geometry_geojson").
		Set("tags = EXCLUDED.tags").
		Exec(ctx)

	return err
}

func saveLiftsBatch(ctx context.Context, db *bun.DB, batch []models.SkiLift) error {
	if len(batch) == 0 {
		return nil
	}

	_, err := db.NewInsert().
		Model(&batch).
		On("CONFLICT (id) DO UPDATE").
		Set("resort_id = EXCLUDED.resort_id").
		Set("name = EXCLUDED.name").
		Set("lift_type = EXCLUDED.lift_type").
		Set("capacity = EXCLUDED.capacity").
		Set("geometry_geojson = EXCLUDED.geometry_geojson").
		Set("tags = EXCLUDED.tags").
		Exec(ctx)

	return err
}
