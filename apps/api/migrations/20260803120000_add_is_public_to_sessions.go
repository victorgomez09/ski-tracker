package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] adding is_public column to ski_sessions...")
		_, err := db.ExecContext(ctx, "ALTER TABLE ski_sessions ADD COLUMN is_public BOOLEAN DEFAULT TRUE;")
		return err
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] removing is_public column from ski_sessions...")
		_, err := db.ExecContext(ctx, "ALTER TABLE ski_sessions DROP COLUMN IF EXISTS is_public;")
		return err
	})
}
