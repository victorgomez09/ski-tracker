package main

import (
	"context"
	"flag"
	"log/slog"
	"os"

	"github.com/uptrace/bun/migrate"
	"github.com/victorgomez09/ski-tracker/internal/config"
	"github.com/victorgomez09/ski-tracker/internal/store/pg"
	"github.com/victorgomez09/ski-tracker/internal/sync"
	"github.com/victorgomez09/ski-tracker/migrations"
)

func main() {
	var (
		countryCode = flag.String("country", "", "Filter POI sync by country code (e.g. ES)")
		resortName  = flag.String("resort", "", "Filter POI sync by resort name substring (e.g. Valdelinares)")
		resortID    = flag.String("resort-id", "", "Filter POI sync by exact resort ID")
		skipResorts = flag.Bool("skip-resorts", false, "Skip downloading and syncing ski resorts")
		skipPistes  = flag.Bool("skip-pistes", false, "Skip downloading and syncing ski pistes")
		skipLifts   = flag.Bool("skip-lifts", false, "Skip downloading and syncing ski lifts")
		skipPOIs    = flag.Bool("skip-pois", false, "Skip downloading and syncing POIs from OpenStreetMap")
		forcePOIs   = flag.Bool("force-pois", false, "Force re-syncing POIs even if already present in database")
		poiLimit    = flag.Int("poi-limit", 0, "Limit number of resorts to sync POIs for (0 for all)")
		workers     = flag.Int("workers", 3, "Number of concurrent workers for POI synchronization")
		liveOSM     = flag.Bool("live-osm", false, "Use live OpenStreetMap map API for POIs (recommended only with -resort or -country)")
	)
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	ctx := context.Background()

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", slog.Any("error", err))
		os.Exit(1)
	}

	store, err := pg.New(cfg.Database.URL, pg.PoolConfig{
		MaxOpenConns:    cfg.Database.MaxOpenConns,
		MaxIdleConns:    cfg.Database.MaxIdleConns,
		ConnMaxLifetime: cfg.Database.ConnMaxLifetime,
	})
	if err != nil {
		logger.Error("failed to connect to database", slog.Any("error", err))
		os.Exit(1)
	}
	defer func() { _ = store.Close() }()
	logger.Info("connected to database")

	// Auto-migrate database
	logger.Info("running database migrations...")

	// Acquire advisory lock to prevent concurrent migrations
	if _, err := store.DB().ExecContext(ctx, "SELECT pg_advisory_lock(1)"); err != nil {
		logger.Error("failed to acquire migration lock", slog.Any("error", err))
		os.Exit(1)
	}

	migrator := migrate.NewMigrator(store.DB(), migrations.Migrations)
	if err := migrator.Init(ctx); err != nil {
		logger.Error("failed to init migrations", slog.Any("error", err))
		store.DB().ExecContext(ctx, "SELECT pg_advisory_unlock(1)")
		os.Exit(1)
	}
	group, err := migrator.Migrate(ctx)
	if err != nil {
		logger.Error("failed to run migrations", slog.Any("error", err))
		store.DB().ExecContext(ctx, "SELECT pg_advisory_unlock(1)")
		os.Exit(1)
	}
	// Release migration lock after successful migration
	store.DB().ExecContext(ctx, "SELECT pg_advisory_unlock(1)")

	if group.IsZero() {
		logger.Info("no new migrations to run")
	} else {
		logger.Info("migrations applied", slog.String("group", group.String()))
	}

	syncOpts := sync.SyncOptions{
		SkipResorts: *skipResorts,
		SkipPistes:  *skipPistes,
		SkipLifts:   *skipLifts,
		SkipPOIs:    *skipPOIs,
		POIOptions: sync.SyncPOIOptions{
			Country:    *countryCode,
			ResortName: *resortName,
			ResortID:   *resortID,
			Force:      *forcePOIs,
			Limit:        *poiLimit,
			Workers:      *workers,
			UseOSMMapAPI: *liveOSM,
		},
	}

	if err := sync.SyncWithOptions(ctx, store.DB(), logger, syncOpts); err != nil {
		logger.Error("failed to sync ski data", slog.Any("error", err))
		os.Exit(1)
	}

	logger.Info("Global synchronization completed successfully.")
}
