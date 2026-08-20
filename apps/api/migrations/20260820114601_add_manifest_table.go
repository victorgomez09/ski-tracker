package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] creating version_manifest table...")
		_, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS version_manifest (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			platform TEXT NOT NULL,
			version TEXT NOT NULL,
			build_number INT NOT NULL,
			min_version TEXT NOT NULL,
			changelog JSONB NOT NULL,
			force_update BOOLEAN DEFAULT FALSE,
			ota_available BOOLEAN DEFAULT TRUE,
			store_url TEXT NOT NULL,
			is_active BOOLEAN DEFAULT TRUE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		`)
		return err
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] dropping version_manifest table...")
		_, err := db.ExecContext(ctx, "DROP TABLE IF EXISTS version_manifest;")
		return err
	})
}
