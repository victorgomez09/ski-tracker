package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] adding outdoor and general activity metrics to ski_sessions...")
		queries := []string{
			"ALTER TABLE ski_sessions ADD COLUMN IF NOT EXISTS avg_speed FLOAT DEFAULT 0;",
			"ALTER TABLE ski_sessions ADD COLUMN IF NOT EXISTS elevation_gain FLOAT DEFAULT 0;",
			"ALTER TABLE ski_sessions ADD COLUMN IF NOT EXISTS elevation_loss FLOAT DEFAULT 0;",
			"ALTER TABLE ski_sessions ADD COLUMN IF NOT EXISTS moving_time BIGINT DEFAULT 0;",
			"ALTER TABLE ski_sessions ADD COLUMN IF NOT EXISTS duration BIGINT DEFAULT 0;",
			"ALTER TABLE ski_sessions ADD COLUMN IF NOT EXISTS pace FLOAT DEFAULT 0;",
		}
		for _, q := range queries {
			if _, err := db.ExecContext(ctx, q); err != nil {
				return fmt.Errorf("failed to add outdoor metrics: %w\nquery: %s", err, q)
			}
		}
		return nil
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] removing outdoor metrics from ski_sessions...")
		queries := []string{
			"ALTER TABLE ski_sessions DROP COLUMN IF EXISTS avg_speed;",
			"ALTER TABLE ski_sessions DROP COLUMN IF EXISTS elevation_gain;",
			"ALTER TABLE ski_sessions DROP COLUMN IF EXISTS elevation_loss;",
			"ALTER TABLE ski_sessions DROP COLUMN IF EXISTS moving_time;",
			"ALTER TABLE ski_sessions DROP COLUMN IF EXISTS duration;",
			"ALTER TABLE ski_sessions DROP COLUMN IF EXISTS pace;",
		}
		for _, q := range queries {
			if _, err := db.ExecContext(ctx, q); err != nil {
				return fmt.Errorf("failed to drop outdoor metrics: %w\nquery: %s", err, q)
			}
		}
		return nil
	})
}
