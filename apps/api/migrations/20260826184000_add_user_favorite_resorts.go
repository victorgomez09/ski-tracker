package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] creating user_favorite_resorts table...")

		queries := []string{
			`
				CREATE TABLE IF NOT EXISTS user_favorite_resorts (
					id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
					user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
					resort_id TEXT NOT NULL REFERENCES ski_resorts(id) ON DELETE CASCADE,
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
					CONSTRAINT uq_user_favorite_resort UNIQUE (user_id, resort_id)
				);
				CREATE INDEX IF NOT EXISTS idx_user_favorite_resorts_user_id ON user_favorite_resorts(user_id);
			`,
		}

		for _, q := range queries {
			if _, err := db.ExecContext(ctx, q); err != nil {
				return fmt.Errorf("migration failed: %w\nquery: %s", err, q)
			}
		}

		return nil
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] dropping user_favorite_resorts table...")

		_, _ = db.ExecContext(ctx, "DROP TABLE IF EXISTS user_favorite_resorts CASCADE")

		return nil
	})
}
