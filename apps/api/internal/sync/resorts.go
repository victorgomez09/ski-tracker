package sync

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

func syncResortsStream(ctx context.Context, db *bun.DB, url string, logger *slog.Logger) (map[string]string, error) {
	tmpFile, err := downloadToTempFile(ctx, url, "resorts_*.geojson")
	if err != nil {
		return nil, fmt.Errorf("failed to download resorts geojson: %w", err)
	}
	defer func() {
		_ = tmpFile.Close()
		_ = os.Remove(tmpFile.Name())
	}()

	var candidates []ResortCandidate

	err = streamGeoJSONFeatures(tmpFile, func(f GeoJSONFeature) error {
		cand, ok := parseResortCandidate(f)
		if !ok {
			return nil
		}
		candidates = append(candidates, cand)
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to stream resort features: %w", err)
	}

	logger.Info("deduplicating ski resorts...", slog.Int("raw_count", len(candidates)))
	canonicalResorts, dedupMap := DeduplicateResorts(candidates)

	logger.Info("deduplication completed",
		slog.Int("raw_count", len(candidates)),
		slog.Int("canonical_count", len(canonicalResorts)),
		slog.Int("duplicates_merged", len(dedupMap)),
	)

	// Save canonical resorts in batches
	batch := make([]models.SkiResort, 0, defaultBatchSize)
	for i, resort := range canonicalResorts {
		batch = append(batch, resort)
		if len(batch) >= defaultBatchSize {
			if err := saveResortsBatch(ctx, db, batch); err != nil {
				return nil, fmt.Errorf("failed to save resorts batch at %d: %w", i, err)
			}
			batch = batch[:0]
		}
	}
	if len(batch) > 0 {
		if err := saveResortsBatch(ctx, db, batch); err != nil {
			return nil, fmt.Errorf("failed to save final resorts batch: %w", err)
		}
	}

	logger.Info("canonical ski resorts saved to database successfully", slog.Int("total", len(canonicalResorts)))
	return dedupMap, nil
}

func parseResortCandidate(f GeoJSONFeature) (ResortCandidate, bool) {
	if f.Properties == nil {
		return ResortCandidate{}, false
	}

	id, _ := f.Properties["id"].(string)
	if id == "" {
		if idFloat, ok := f.Properties["id"].(float64); ok {
			id = fmt.Sprintf("%.0f", idFloat)
		} else {
			return ResortCandidate{}, false
		}
	}

	name, _ := f.Properties["name"].(string)
	if name == "" {
		name = "No name"
	}

	lon, lat, _ := ExtractCoordinates(f.Geometry)

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

	status, _ := f.Properties["status"].(string)

	var sources []string
	if srcList, ok := f.Properties["sources"].([]interface{}); ok {
		for _, s := range srcList {
			if sm, ok := s.(map[string]interface{}); ok {
				if t, ok := sm["type"].(string); ok && t != "" {
					sources = append(sources, t)
				}
			}
		}
	}

	geomType, _ := f.Geometry["type"].(string)
	runsCount, liftsCount := GetFeatureRunsAndLiftsCount(f.Properties)

	resort := models.SkiResort{
		ID:        id,
		Name:      name,
		Country:   country,
		Latitude:  lat,
		Longitude: lon,
		Website:   website,
		Tags:      f.Properties,
	}

	return ResortCandidate{
		Resort:     resort,
		RawFeature: f,
		TotalRuns:  runsCount,
		TotalLifts: liftsCount,
		GeomType:   geomType,
		Status:     status,
		Sources:    sources,
	}, true
}

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

func cleanupDuplicateResortsInDB(ctx context.Context, db *bun.DB, dedupMap map[string]string, logger *slog.Logger) error {
	if len(dedupMap) == 0 {
		return nil
	}

	logger.Info("cleaning up duplicate resorts in database...", slog.Int("duplicates_to_cleanup", len(dedupMap)))

	// Check which duplicate IDs actually exist in the database
	var dupIDs []string
	for dupID := range dedupMap {
		dupIDs = append(dupIDs, dupID)
	}

	var existingDupIDs []string
	err := db.NewSelect().
		Table("ski_resorts").
		Column("id").
		Where("id IN (?)", bun.In(dupIDs)).
		Scan(ctx, &existingDupIDs)
	if err != nil {
		return fmt.Errorf("failed to query existing duplicate resorts: %w", err)
	}

	if len(existingDupIDs) == 0 {
		logger.Info("no duplicate resorts need database cleanup")
		return nil
	}

	cleanedCount := 0
	for _, dupID := range existingDupIDs {
		canonicalID, ok := dedupMap[dupID]
		if !ok || canonicalID == dupID {
			continue
		}

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("failed to start cleanup tx for %s: %w", dupID, err)
		}

		// 1. Remove user favorite conflicts
		_, _ = tx.ExecContext(ctx, `
			DELETE FROM user_favorite_resorts
			WHERE resort_id = ? AND user_id IN (
				SELECT user_id FROM user_favorite_resorts WHERE resort_id = ?
			)
		`, dupID, canonicalID)

		// 2. Remap foreign key references
		_, _ = tx.ExecContext(ctx, "UPDATE user_favorite_resorts SET resort_id = ? WHERE resort_id = ?", canonicalID, dupID)
		_, _ = tx.ExecContext(ctx, "UPDATE ski_sessions SET resort_id = ? WHERE resort_id = ?", canonicalID, dupID)
		_, _ = tx.ExecContext(ctx, "UPDATE users SET last_resort_id = ? WHERE last_resort_id = ?", canonicalID, dupID)
		_, _ = tx.ExecContext(ctx, "UPDATE ski_pistes SET resort_id = ? WHERE resort_id = ?", canonicalID, dupID)
		_, _ = tx.ExecContext(ctx, "UPDATE ski_lifts SET resort_id = ? WHERE resort_id = ?", canonicalID, dupID)
		_, _ = tx.ExecContext(ctx, "UPDATE meeting_points SET resort_id = ? WHERE resort_id = ?", canonicalID, dupID)
		_, _ = tx.ExecContext(ctx, "UPDATE crews SET resort_id = ? WHERE resort_id = ?", canonicalID, dupID)

		// 3. Remove POI conflicts and remap
		_, _ = tx.ExecContext(ctx, `
			DELETE FROM ski_resort_pois
			WHERE resort_id = ? AND id IN (
				SELECT id FROM ski_resort_pois WHERE resort_id = ?
			)
		`, dupID, canonicalID)
		_, _ = tx.ExecContext(ctx, "UPDATE ski_resort_pois SET resort_id = ? WHERE resort_id = ?", canonicalID, dupID)

		// 4. Delete the duplicate resort row
		res, err := tx.ExecContext(ctx, "DELETE FROM ski_resorts WHERE id = ?", dupID)
		if err != nil {
			_ = tx.Rollback()
			logger.Warn("failed to delete duplicate resort", slog.String("dup_id", dupID), slog.Any("error", err))
			continue
		}

		if err := tx.Commit(); err != nil {
			logger.Warn("failed to commit cleanup for duplicate resort", slog.String("dup_id", dupID), slog.Any("error", err))
			continue
		}

		if rows, _ := res.RowsAffected(); rows > 0 {
			cleanedCount++
		}
	}

	logger.Info("database duplicate cleanup completed", slog.Int("cleaned_records", cleanedCount))
	return nil
}
