package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] adding piste_name column to ski_runs...")
		_, err := db.ExecContext(ctx, "ALTER TABLE ski_runs ADD COLUMN IF NOT EXISTS piste_name TEXT;")
		return err
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] removing piste_name column from ski_runs...")
		_, err := db.ExecContext(ctx, "ALTER TABLE ski_runs DROP COLUMN IF EXISTS piste_name;")
		return err
	})
}
