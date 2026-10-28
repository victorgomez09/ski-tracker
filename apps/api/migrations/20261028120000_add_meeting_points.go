package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] adding meeting_points table...")

		queries := []string{
			`CREATE TABLE IF NOT EXISTS meeting_points (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				crew_id UUID REFERENCES crews(id) ON DELETE CASCADE,
				resort_id TEXT NOT NULL,
				title VARCHAR(150) NOT NULL,
				description TEXT DEFAULT '',
				latitude DOUBLE PRECISION NOT NULL,
				longitude DOUBLE PRECISION NOT NULL,
				meet_time VARCHAR(50) DEFAULT '',
				is_active BOOLEAN DEFAULT TRUE,
				created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			);`,
			`CREATE INDEX IF NOT EXISTS idx_meeting_points_resort ON meeting_points(resort_id, is_active);`,
			`CREATE INDEX IF NOT EXISTS idx_meeting_points_crew ON meeting_points(crew_id);`,
			`CREATE INDEX IF NOT EXISTS idx_meeting_points_created_by ON meeting_points(created_by);`,
		}

		for _, q := range queries {
			if _, err := db.ExecContext(ctx, q); err != nil {
				return err
			}
		}

		return nil
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] dropping meeting_points table...")
		_, err := db.ExecContext(ctx, `DROP TABLE IF EXISTS meeting_points CASCADE;`)
		return err
	})
}
