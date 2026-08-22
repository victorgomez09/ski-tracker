package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] adding time_tracking to users...")
		_, err := db.ExecContext(ctx, "ALTER TABLE users ADD COLUMN time_tracking BIGINT DEFAULT 5000;")
		return err
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] removing time_tracking column from users...")
		_, err := db.ExecContext(ctx, "ALTER TABLE users DROP COLUMN IF EXISTS time_tracking;")
		return err
	})
}
