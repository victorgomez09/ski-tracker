package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/uptrace/bun/migrate"
	"github.com/victorgomez09/ski-tracker/internal/config"
	"github.com/victorgomez09/ski-tracker/internal/store/pg"
	"github.com/victorgomez09/ski-tracker/internal/sync"
	"github.com/victorgomez09/ski-tracker/migrations"
)

func main() {
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

	if err := sync.SyncPistesData(ctx, store.DB(), logger); err != nil {
		logger.Error("failed to sync pistes data", slog.Any("error", err))
		os.Exit(1)
	}

	logger.Info("Global synchronization completed successfully.")
}
