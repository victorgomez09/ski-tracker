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
				CREATE TABLE track_points (
					id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
					lat DOUBLE PRECISION NOT NULL,
					lon DOUBLE PRECISION NOT NULL,
					alt DOUBLE PRECISION,
					speed DOUBLE PRECISION,
					timestamp BIGINT NOT NULL,
					user_id UUID REFERENCES users(id) ON DELETE CASCADE,
					resort_id TEXT REFERENCES ski_resorts(id) ON DELETE SET NULL
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
		fmt.Println("[down] dropping tracking table...")

		_, _ = db.ExecContext(ctx, "DROP TABLE IF EXISTS track_points CASCADE")

		return nil
	})
}
