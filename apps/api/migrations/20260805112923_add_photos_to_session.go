package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] creating session_photos table...")
		_, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS session_photos (
			id UUID PRIMARY KEY,
			session_id UUID NOT NULL REFERENCES ski_sessions(id) ON DELETE CASCADE,
			photo_url TEXT NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		`)
		return err
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] dropping session_photos table...")
		_, err := db.ExecContext(ctx, "DROP TABLE IF EXISTS session_photos;")
		return err
	})
}
