package sync

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"

	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

func syncLiftsStream(ctx context.Context, db *bun.DB, url string, dedupMap map[string]string, logger *slog.Logger) error {
	tmpFile, err := downloadToTempFile(ctx, url, "lifts_*.geojson")
	if err != nil {
		return fmt.Errorf("failed to download lifts geojson: %w", err)
	}
	defer func() {
		_ = tmpFile.Close()
		_ = os.Remove(tmpFile.Name())
	}()

	batch := make([]models.SkiLift, 0, defaultBatchSize)
	total := 0

	err = streamGeoJSONFeatures(tmpFile, func(f GeoJSONFeature) error {
		lift, ok := parseLiftFeature(f, dedupMap)
		if !ok {
			return nil
		}
		batch = append(batch, *lift)
		total++

		if len(batch) >= defaultBatchSize {
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

func parseLiftFeature(f GeoJSONFeature, dedupMap map[string]string) (*models.SkiLift, bool) {
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

	// Remap resortID if it points to a deduplicated resort
	if resortID != nil && len(dedupMap) > 0 {
		if canonicalID, ok := dedupMap[*resortID]; ok {
			resortID = &canonicalID
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
