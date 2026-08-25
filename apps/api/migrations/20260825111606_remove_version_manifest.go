package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] dropping version_manifest table...")
		_, err := db.ExecContext(ctx, "DROP TABLE IF EXISTS version_manifest;")
		return err
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] creating version_manifest table...")
		_, err := db.ExecContext(ctx, `
			CREATE TABLE version_manifest (
				id SERIAL PRIMARY KEY,
				platform TEXT NOT NULL,
				version TEXT NOT NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			);
		`)
		return err
	})
}
