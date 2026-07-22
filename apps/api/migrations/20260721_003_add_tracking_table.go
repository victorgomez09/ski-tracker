package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] creating tracking table...")

		queries := []string{
			`
			-- Enable PostGIS extension for geospatial support
			CREATE EXTENSION IF NOT EXISTS postgis;

			-- 1. Ski sessions table to track individual ski sessions
			CREATE TABLE ski_sessions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				resort_id TEXT REFERENCES ski_resorts(id) ON DELETE SET NULL,
				start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
				end_time TIMESTAMP WITH TIME ZONE,
				total_distance FLOAT DEFAULT 0,
				max_speed FLOAT DEFAULT 0,
				vertical_drop FLOAT DEFAULT 0,
				created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			);

			-- 2. Session points table with PostGIS geospatial support
			CREATE TABLE session_points (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				session_id UUID REFERENCES ski_sessions(id) ON DELETE CASCADE,
				geom GEOMETRY(Point, 4326) NOT NULL, -- Stores lat/lon spatially
				altitude FLOAT,
				speed FLOAT,
				timestamp TIMESTAMP WITH TIME ZONE NOT NULL
			);

			-- Spatial index to speed up future Map Matching queries (Phase 4)
			CREATE INDEX idx_session_points_geom ON session_points USING GIST (geom);
			CREATE INDEX idx_session_points_session_id ON session_points(session_id);
			`,
		}

		for _, q := range queries {
			if _, err := db.ExecContext(ctx, q); err != nil {
				return fmt.Errorf("migration failed: %w\nquery: %s", err, q)
			}
		}

		return nil
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] dropping tracking table...")

		_, _ = db.ExecContext(ctx, "DROP TABLE IF EXISTS track_points CASCADE")

		return nil
	})
}
