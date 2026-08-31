package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] adding friendships and user privacy columns...")

		queries := []string{
			`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_sessions VARCHAR(20) DEFAULT 'FRIENDS';`,
			`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_live_location VARCHAR(20) DEFAULT 'WHILE_RECORDING';`,
			`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_requests VARCHAR(20) DEFAULT 'EVERYONE';`,
			`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_latitude DOUBLE PRECISION;`,
			`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_longitude DOUBLE PRECISION;`,
			`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_resort_id TEXT;`,
			`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_location_time TIMESTAMP WITH TIME ZONE;`,
			`
				CREATE TABLE IF NOT EXISTS friendships (
					id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
					requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
					addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
					status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
					created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
					updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
					CONSTRAINT unique_friendship_pair UNIQUE (requester_id, addressee_id)
				);
			`,
			`CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);`,
			`CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);`,
		}

		for _, q := range queries {
			if _, err := db.ExecContext(ctx, q); err != nil {
				return fmt.Errorf("migration failed: %w\nquery: %s", err, q)
			}
		}

		return nil
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] dropping friendships and user privacy columns...")

		queries := []string{
			`DROP TABLE IF EXISTS friendships CASCADE;`,
			`ALTER TABLE users DROP COLUMN IF EXISTS privacy_sessions;`,
			`ALTER TABLE users DROP COLUMN IF EXISTS privacy_live_location;`,
			`ALTER TABLE users DROP COLUMN IF EXISTS privacy_requests;`,
			`ALTER TABLE users DROP COLUMN IF EXISTS last_latitude;`,
			`ALTER TABLE users DROP COLUMN IF EXISTS last_longitude;`,
			`ALTER TABLE users DROP COLUMN IF EXISTS last_resort_id;`,
			`ALTER TABLE users DROP COLUMN IF EXISTS last_location_time;`,
		}

		for _, q := range queries {
			_, _ = db.ExecContext(ctx, q)
		}

		return nil
	})
}
