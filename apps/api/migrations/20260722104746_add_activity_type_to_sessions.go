package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] adding activity_type column to ski_sessions...")
		_, err := db.ExecContext(ctx, "ALTER TABLE ski_sessions ADD COLUMN activity_type TEXT DEFAULT 'ski';")
		return err
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] removing activity_type column from ski_sessions...")
		_, err := db.ExecContext(ctx, "ALTER TABLE ski_sessions DROP COLUMN IF EXISTS activity_type;")
		return err
	})
}
