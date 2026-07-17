package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] creating users table...")

		queries := []string{
			`
				CREATE TABLE users (
					id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
					email TEXT NOT NULL UNIQUE,
					password_hash BYTEA NOT NULL,
					display_name TEXT NOT NULL,
					first_name TEXT DEFAULT '',
					last_name TEXT DEFAULT '',
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
		fmt.Println("[down] dropping users table...")

		_, _ = db.ExecContext(ctx, "DROP TABLE IF EXISTS users CASCADE")

		return nil
	})
}
