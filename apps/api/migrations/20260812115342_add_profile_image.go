package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] adding avatar_url to users...")
		_, err := db.ExecContext(ctx, "ALTER TABLE users ADD COLUMN avatar_url TEXT;")
		return err
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] removing avatar_url column from users...")
		_, err := db.ExecContext(ctx, "ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;")
		return err
	})
}
