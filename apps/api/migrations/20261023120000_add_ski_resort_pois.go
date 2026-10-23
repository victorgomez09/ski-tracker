package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] creating ski_resort_pois table...")

		queries := []string{
			`
				CREATE TABLE IF NOT EXISTS ski_resort_pois (
					id TEXT PRIMARY KEY,
					resort_id TEXT NOT NULL REFERENCES ski_resorts(id) ON DELETE CASCADE,
					name TEXT NOT NULL,
					category TEXT NOT NULL,
					latitude DOUBLE PRECISION NOT NULL,
					longitude DOUBLE PRECISION NOT NULL,
					tags JSONB,
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
				);
				CREATE INDEX IF NOT EXISTS idx_ski_resort_pois_resort_id ON ski_resort_pois(resort_id);
				CREATE INDEX IF NOT EXISTS idx_ski_resort_pois_category ON ski_resort_pois(category);
			`,
		}

		for _, q := range queries {
			if _, err := db.ExecContext(ctx, q); err != nil {
				return fmt.Errorf("migration failed: %w\nquery: %s", err, q)
			}
		}

		return nil
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] dropping ski_resort_pois table...")
		_, _ = db.ExecContext(ctx, "DROP TABLE IF EXISTS ski_resort_pois CASCADE")
		return nil
	})
}
