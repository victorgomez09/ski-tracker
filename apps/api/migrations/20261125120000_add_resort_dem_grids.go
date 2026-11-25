package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] creating ski_resort_dems table...")
		_, err := db.ExecContext(ctx, `
			CREATE TABLE IF NOT EXISTS ski_resort_dems (
				resort_id TEXT PRIMARY KEY REFERENCES ski_resorts(id) ON DELETE CASCADE,
				min_lon DOUBLE PRECISION NOT NULL,
				min_lat DOUBLE PRECISION NOT NULL,
				max_lon DOUBLE PRECISION NOT NULL,
				max_lat DOUBLE PRECISION NOT NULL,
				resolution INTEGER NOT NULL,
				elevations_b64 TEXT NOT NULL,
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
			);
		`)
		return err
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] dropping ski_resort_dems table...")
		_, err := db.ExecContext(ctx, `DROP TABLE IF EXISTS ski_resort_dems;`)
		return err
	})
}
