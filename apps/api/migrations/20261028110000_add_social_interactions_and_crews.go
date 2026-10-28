package migrations

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"
)

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[up] adding social interactions (reactions, comments) and ski crews...")

		queries := []string{
			// 1. Session Reactions (Kudos)
			`CREATE TABLE IF NOT EXISTS session_reactions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				session_id UUID NOT NULL REFERENCES ski_sessions(id) ON DELETE CASCADE,
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				reaction_type VARCHAR(20) NOT NULL,
				created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
				CONSTRAINT unique_session_user_reaction UNIQUE (session_id, user_id, reaction_type)
			);`,
			`CREATE INDEX IF NOT EXISTS idx_session_reactions_session ON session_reactions(session_id);`,
			`CREATE INDEX IF NOT EXISTS idx_session_reactions_user ON session_reactions(user_id);`,

			// 2. Session Comments
			`CREATE TABLE IF NOT EXISTS session_comments (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				session_id UUID NOT NULL REFERENCES ski_sessions(id) ON DELETE CASCADE,
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				content TEXT NOT NULL,
				created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			);`,
			`CREATE INDEX IF NOT EXISTS idx_session_comments_session ON session_comments(session_id, created_at ASC);`,

			// 3. Crews (Ski Groups)
			`CREATE TABLE IF NOT EXISTS crews (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name VARCHAR(100) NOT NULL,
				description TEXT DEFAULT '',
				resort_id TEXT DEFAULT '',
				created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				cover_image_url TEXT DEFAULT '',
				created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			);`,
			`CREATE INDEX IF NOT EXISTS idx_crews_created_by ON crews(created_by);`,

			`CREATE TABLE IF NOT EXISTS crew_members (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				role VARCHAR(20) NOT NULL DEFAULT 'member',
				joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
				CONSTRAINT unique_crew_member UNIQUE (crew_id, user_id)
			);`,
			`CREATE INDEX IF NOT EXISTS idx_crew_members_user ON crew_members(user_id);`,
			`CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON crew_members(crew_id);`,

			`CREATE TABLE IF NOT EXISTS crew_photos (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				photo_url TEXT NOT NULL,
				caption TEXT DEFAULT '',
				created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			);`,
			`CREATE INDEX IF NOT EXISTS idx_crew_photos_crew ON crew_photos(crew_id, created_at DESC);`,

			// 4. Ghost Mode in users table
			`ALTER TABLE users ADD COLUMN IF NOT EXISTS ghost_mode BOOLEAN DEFAULT FALSE;`,
		}

		for _, q := range queries {
			if _, err := db.ExecContext(ctx, q); err != nil {
				return fmt.Errorf("migration failed: %w\nquery: %s", err, q)
			}
		}

		return nil
	}, func(ctx context.Context, db *bun.DB) error {
		fmt.Println("[down] dropping social interactions and ski crews...")

		queries := []string{
			`DROP TABLE IF EXISTS crew_photos CASCADE;`,
			`DROP TABLE IF EXISTS crew_members CASCADE;`,
			`DROP TABLE IF EXISTS crews CASCADE;`,
			`DROP TABLE IF EXISTS session_comments CASCADE;`,
			`DROP TABLE IF EXISTS session_reactions CASCADE;`,
			`ALTER TABLE users DROP COLUMN IF EXISTS ghost_mode;`,
		}

		for _, q := range queries {
			_, _ = db.ExecContext(ctx, q)
		}

		return nil
	})
}
