package sync

import (
	"context"
	"fmt"
	"log/slog"
	"runtime"
	"runtime/debug"

	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

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

// SyncPistesData downloads global resort, piste, lift, and POI data and updates the database using streaming and deduplication.
func SyncPistesData(ctx context.Context, db *bun.DB, logger *slog.Logger) error {
	return SyncWithOptions(ctx, db, logger, SyncOptions{})
}

// SyncWithOptions downloads and synchronizes ski data according to the provided options.
func SyncWithOptions(ctx context.Context, db *bun.DB, logger *slog.Logger, opts SyncOptions) error {
	logger.Info("starting ski data synchronization")

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

	var dedupMap map[string]string

	// 1. Process Resorts (with deduplication)
	if !opts.SkipResorts {
		logger.Info("downloading and processing resorts data...")
		var err error
		dedupMap, err = syncResortsStream(ctx, db, resortsURL, logger)
		if err != nil {
			return fmt.Errorf("failed to sync resorts: %w", err)
		}
	}

	// 2. Process Pistes (Streaming with resort ID remapping)
	if !opts.SkipPistes {
		logger.Info("downloading and streaming pistes data...")
		if err := syncPistesStream(ctx, db, pistesURL, dedupMap, logger); err != nil {
			return fmt.Errorf("failed to sync pistes: %w", err)
		}
	}

	// 3. Process Lifts (Streaming with resort ID remapping)
	if !opts.SkipLifts {
		logger.Info("downloading and streaming lifts data...")
		if err := syncLiftsStream(ctx, db, liftsURL, dedupMap, logger); err != nil {
			return fmt.Errorf("failed to sync lifts: %w", err)
		}
	}

	// 4. Clean up any existing duplicate resorts and old references from database
	if len(dedupMap) > 0 {
		if err := cleanupDuplicateResortsInDB(ctx, db, dedupMap, logger); err != nil {
			logger.Warn("failed to cleanup duplicate resorts from database", slog.Any("error", err))
		}
	}

	// 5. Process Points of Interest (POIs) from OpenStreetMap
	if !opts.SkipPOIs {
		if err := SyncPOIs(ctx, db, dedupMap, logger, opts.POIOptions); err != nil {
			logger.Warn("failed to sync POIs from OpenStreetMap", slog.Any("error", err))
		}
	}

	logger.Info("ski data synchronization completed successfully")
	return nil
}
