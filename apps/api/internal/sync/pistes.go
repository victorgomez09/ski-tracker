package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type GeoJSONFeatureCollection struct {
	Type     string           `json:"type"`
	Features []GeoJSONFeature `json:"features"`
}

type GeoJSONFeature struct {
	Type       string                 `json:"type"`
	ID         interface{}            `json:"id"`
	Geometry   map[string]interface{} `json:"geometry"`
	Properties map[string]interface{} `json:"properties"`
}

// HasPistesData checks if the database already contains resorts/pistes data.
func HasPistesData(ctx context.Context, db *bun.DB) (bool, error) {
	count, err := db.NewSelect().Model((*models.SkiResort)(nil)).Count(ctx)
	if err != nil {
		return false, err
	}
	return count > 0, nil
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

// SyncPistesData downloads global resort, piste, and lift data and updates the database
func SyncPistesData(ctx context.Context, db *bun.DB, logger *slog.Logger) error {
	logger.Info("starting global pistes data synchronization")

	pistesURL := "https://tiles.openskimap.org/geojson/runs.geojson"
	liftsURL := "https://tiles.openskimap.org/geojson/lifts.geojson"
	resortsURL := "https://tiles.openskimap.org/geojson/ski_areas.geojson"

	// Process Resorts
	logger.Info("downloading resorts data...")
	resorts, err := downloadAndParseResorts(resortsURL)
	if err != nil {
		return fmt.Errorf("failed to download and parse resorts: %w", err)
	}
	if err := saveResorts(ctx, db, resorts, logger); err != nil {
		return fmt.Errorf("failed to save resorts: %w", err)
	}

	// Process Pistes
	logger.Info("downloading pistes data...")
	pistes, err := downloadAndParsePistes(pistesURL)
	if err != nil {
		return fmt.Errorf("failed to download and parse pistes: %w", err)
	}
	if err := savePistes(ctx, db, pistes, logger); err != nil {
		return fmt.Errorf("failed to save pistes: %w", err)
	}

	// Process Lifts
	logger.Info("downloading lifts data...")
	lifts, err := downloadAndParseLifts(liftsURL)
	if err != nil {
		return fmt.Errorf("failed to download and parse lifts: %w", err)
	}
	if err := saveLifts(ctx, db, lifts, logger); err != nil {
		return fmt.Errorf("failed to save lifts: %w", err)
	}

	logger.Info("global synchronization completed successfully")
	return nil
}

// --- PROCESSORS AND DOWNLOADERS ---
func downloadAndParseResorts(url string) ([]models.SkiResort, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var fc GeoJSONFeatureCollection
	if err := json.Unmarshal(body, &fc); err != nil {
		return nil, err
	}

	var resorts []models.SkiResort
	for _, f := range fc.Features {
		id, _ := f.Properties["id"].(string)
		if id == "" {
			if idFloat, ok := f.Properties["id"].(float64); ok {
				id = fmt.Sprintf("%.0f", idFloat)
			} else {
				continue
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

		resorts = append(resorts, models.SkiResort{
			ID:        id,
			Name:      name,
			Country:   country,
			Latitude:  lat,
			Longitude: lon,
			Website:   website,
			Tags:      f.Properties,
		})
	}
	return resorts, nil
}

func downloadAndParsePistes(url string) ([]models.SkiPiste, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var fc GeoJSONFeatureCollection
	if err := json.Unmarshal(body, &fc); err != nil {
		return nil, err
	}

	var pistes []models.SkiPiste
	for _, f := range fc.Features {
		id, _ := f.Properties["id"].(string)
		if id == "" {
			if idFloat, ok := f.Properties["id"].(float64); ok {
				id = fmt.Sprintf("%.0f", idFloat)
			} else {
				continue
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

		pistes = append(pistes, models.SkiPiste{
			ID:              id,
			ResortID:        resortID,
			Name:            name,
			PisteType:       pType,
			Difficulty:      difficulty,
			Lit:             lit,
			GeometryGeoJSON: f.Geometry,
			Tags:            f.Properties,
		})
	}
	return pistes, nil
}

func downloadAndParseLifts(url string) ([]models.SkiLift, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var fc GeoJSONFeatureCollection
	if err := json.Unmarshal(body, &fc); err != nil {
		return nil, err
	}

	var lifts []models.SkiLift
	for _, f := range fc.Features {
		id, _ := f.Properties["id"].(string)
		if id == "" {
			if idFloat, ok := f.Properties["id"].(float64); ok {
				id = fmt.Sprintf("%.0f", idFloat)
			} else {
				continue
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

		lifts = append(lifts, models.SkiLift{
			ID:              id,
			ResortID:        resortID,
			Name:            name,
			LiftType:        lType,
			Capacity:        occupancy,
			CapacityHourly:  capacity,
			GeometryGeoJSON: f.Geometry,
			Tags:            f.Properties,
		})
	}
	return lifts, nil
}

// --- DATABASE OPERATIONS ---
func saveResorts(ctx context.Context, db *bun.DB, resorts []models.SkiResort, logger *slog.Logger) error {
	if len(resorts) == 0 {
		logger.Warn("no ski resorts to save")
		return nil
	}
	logger.Info(fmt.Sprintf("saving/updating %d ski resorts...", len(resorts)))

	batchSize := 1000
	for i := 0; i < len(resorts); i += batchSize {
		end := i + batchSize
		if end > len(resorts) {
			end = len(resorts)
		}
		batch := resorts[i:end]

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

		if err != nil {
			return err
		}
	}

	logger.Info("ski resorts saved/updated successfully")
	return nil
}

func savePistes(ctx context.Context, db *bun.DB, pistes []models.SkiPiste, logger *slog.Logger) error {
	if len(pistes) == 0 {
		logger.Warn("no pistes to save")
		return nil
	}
	logger.Info(fmt.Sprintf("saving/updating %d pistes...", len(pistes)))

	batchSize := 1000
	for i := 0; i < len(pistes); i += batchSize {
		end := i + batchSize
		if end > len(pistes) {
			end = len(pistes)
		}
		batch := pistes[i:end]

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

		if err != nil {
			return err
		}
	}
	logger.Info("pistes saved/updated successfully")
	return nil
}

func saveLifts(ctx context.Context, db *bun.DB, lifts []models.SkiLift, logger *slog.Logger) error {
	if len(lifts) == 0 {
		logger.Warn("no lifts to save")
		return nil
	}
	logger.Info(fmt.Sprintf("saving/updating %d lifts...", len(lifts)))

	batchSize := 1000
	for i := 0; i < len(lifts); i += batchSize {
		end := i + batchSize
		if end > len(lifts) {
			end = len(lifts)
		}
		batch := lifts[i:end]

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

		if err != nil {
			return err
		}
	}
	logger.Info("lifts saved/updated successfully")
	return nil
}
