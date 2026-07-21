package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/uptrace/bun/migrate"
	"github.com/victorgomez09/ski-tracker/internal/api/auth"
	"github.com/victorgomez09/ski-tracker/internal/config"
	"github.com/victorgomez09/ski-tracker/internal/server"
	"github.com/victorgomez09/ski-tracker/internal/service"
	"github.com/victorgomez09/ski-tracker/internal/store/pg"
	"github.com/victorgomez09/ski-tracker/migrations"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", slog.Any("error", err))
		os.Exit(1)
	}

	// Database
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
	ctx := context.Background()

	// Acquire advisory lock to prevent concurrent migrations
	if _, err := store.DB().ExecContext(ctx, "SELECT pg_advisory_lock(1)"); err != nil {
		logger.Error("failed to acquire migration lock", slog.Any("error", err))
		os.Exit(1)
	}

	_, err = store.DB().NewRaw("CREATE EXTENSION IF NOT EXISTS postgis;").Exec(ctx)
	if err != nil {
		logger.Error("failed to enable PostGIS", slog.Any("error", err))
		store.DB().ExecContext(ctx, "SELECT pg_advisory_unlock(1)")
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

	// JWT
	jwtManager := auth.NewJWTManager(cfg.Auth.JWTSecret, cfg.Auth.TokenExpiry, cfg.Auth.RefreshExpiry)

	// // Services
	services := service.NewContainer(store, jwtManager, logger, cfg.Database.URL, cfg.Auth.SetupSecret)

	// Router
	router := server.NewRouter(&server.RouterDeps{
		Services:    services,
		JWTManager:  jwtManager,
		Store:       store,
		AppURL:      cfg.Server.AppURL,
		SetupSecret: cfg.Auth.SetupSecret,
		Logger:      logger,
	})

	// HTTP server
	srv := &http.Server{
		Addr:    cfg.ListenAddr(),
		Handler: router,
	}

	go func() {
		logger.Info("starting vipas api server", slog.String("addr", cfg.ListenAddr()))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server error", slog.Any("error", err))
			os.Exit(1)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), cfg.Server.ShutdownTimeout)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("server forced shutdown", slog.Any("error", err))
		os.Exit(1)
	}

	logger.Info("server exited gracefully")
}
