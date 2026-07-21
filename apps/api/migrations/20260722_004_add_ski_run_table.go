package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] creating ski runs table...")

		queries := []string{
			`
			CREATE TABLE ski_runs (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				session_id UUID NOT NULL REFERENCES ski_sessions(id) ON DELETE CASCADE,
				vertical_drop FLOAT DEFAULT 0,
				max_speed FLOAT DEFAULT 0,
				avg_speed FLOAT DEFAULT 0,
				total_distance FLOAT DEFAULT 0,
				elevation_gain FLOAT DEFAULT 0,
				elevation_loss FLOAT DEFAULT 0,
				total_points INT DEFAULT 0,
				matched_piste_id TEXT REFERENCES ski_pistes(id) ON DELETE SET NULL,
				predominant_diff TEXT,
				created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			);
			`,
		}

		for _, q := range queries {
			if _, err := db.ExecContext(ctx, q); err != nil {
				return fmt.Errorf("migration failed: %w\nquery: %s", err, q)
			}
		}

		return nil
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] dropping ski runs table...")

		_, _ = db.ExecContext(ctx, "DROP TABLE IF EXISTS ski_runs CASCADE")

		return nil
	})
}
