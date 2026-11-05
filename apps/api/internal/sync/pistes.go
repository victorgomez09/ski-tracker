package sync

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

func syncPistesStream(ctx context.Context, db *bun.DB, url string, dedupMap map[string]string, logger *slog.Logger) error {
	tmpFile, err := downloadToTempFile(ctx, url, "pistes_*.geojson")
	if err != nil {
		return fmt.Errorf("failed to download pistes geojson: %w", err)
	}
	defer func() {
		_ = tmpFile.Close()
		_ = os.Remove(tmpFile.Name())
	}()

	batch := make([]models.SkiPiste, 0, defaultBatchSize)
	total := 0

	err = streamGeoJSONFeatures(tmpFile, func(f GeoJSONFeature) error {
		piste, ok := parsePisteFeature(f, dedupMap)
		if !ok {
			return nil
		}
		batch = append(batch, *piste)
		total++

		if len(batch) >= defaultBatchSize {
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

func parsePisteFeature(f GeoJSONFeature, dedupMap map[string]string) (*models.SkiPiste, bool) {
	if f.Properties == nil {
		return nil, false
	}

	id, _ := f.Properties["id"].(string)
	if id == "" {
		if idFloat, ok := f.Properties["id"].(float64); ok {
			id = fmt.Sprintf("%.0f", idFloat)
		} else if f.ID != nil {
			if idStr, ok := f.ID.(string); ok {
				id = idStr
			} else if idFloat, ok := f.ID.(float64); ok {
				id = fmt.Sprintf("%.0f", idFloat)
			}
		}
		if id == "" {
			return nil, false
		}
	}

	name, _ := f.Properties["name"].(string)
	if name == "" {
		name, _ = f.Properties["piste:name"].(string)
	}
	if name == "" {
		name, _ = f.Properties["name:es"].(string)
	}
	if name == "" {
		name, _ = f.Properties["piste:ref"].(string)
	}
	if name == "" {
		name, _ = f.Properties["ref"].(string)
	}
	if name == "" {
		if tags, ok := f.Properties["tags"].(map[string]interface{}); ok && tags != nil {
			for _, k := range []string{"name", "piste:name", "name:es", "piste:ref", "ref"} {
				if v, ok := tags[k].(string); ok && v != "" {
					name = v
					break
				}
			}
		}
	}

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

	// Remap resortID if it points to a deduplicated resort
	if resortID != nil && len(dedupMap) > 0 {
		if canonicalID, ok := dedupMap[*resortID]; ok {
			resortID = &canonicalID
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
