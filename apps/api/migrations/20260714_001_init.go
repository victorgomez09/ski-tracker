package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] initializing ski-tracker database schema...")

		queries := []string{
			// ────────────────────────────────────────────────────────
			// Core tables
			// ────────────────────────────────────────────────────────
			`
				CREATE TABLE ski_resorts (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL,
					country VARCHAR(100),
					website TEXT,
					latitude DOUBLE PRECISION NOT NULL,
					longitude DOUBLE PRECISION NOT NULL,
					tags JSONB,
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
				);

				CREATE TABLE ski_pistes (
					id TEXT PRIMARY KEY,
					resort_id TEXT REFERENCES ski_resorts(id) ON DELETE SET NULL,
					name TEXT,
					piste_type VARCHAR(50) NOT NULL,
					difficulty VARCHAR(50),
					lit BOOLEAN DEFAULT FALSE,
					geometry_geojson JSONB NOT NULL,
					tags JSONB,
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
				);

				CREATE TABLE ski_lifts (
					id TEXT PRIMARY KEY,
					resort_id TEXT REFERENCES ski_resorts(id) ON DELETE SET NULL,
					name TEXT,
					lift_type VARCHAR(50) NOT NULL,
					capacity INTEGER,
					capacity_hourly INTEGER,
					geometry_geojson JSONB NOT NULL,
					tags JSONB,
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
				);`,
		}

		for _, q := range queries {
			if _, err := db.ExecContext(ctx, q); err != nil {
				return fmt.Errorf("migration failed: %w\nquery: %s", err, q)
			}
		}

		return nil
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] dropping all ski-tracker tables...")

		// Tables in reverse dependency order
		tables := []string{
			"ski_lifts",
			"ski_pistes",
			"ski_resorts",
		}
		for _, t := range tables {
			_, _ = db.ExecContext(ctx, fmt.Sprintf("DROP TABLE IF EXISTS %s CASCADE", t))
		}

		return nil
	})
}
