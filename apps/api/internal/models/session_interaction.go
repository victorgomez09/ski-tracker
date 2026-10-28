package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// SessionReaction represents a kudo/reaction on a ski session (e.g., fire, ski, snow, clap).
type SessionReaction struct {
	bun.BaseModel `bun:"table:session_reactions,alias:sr"`

	ID           uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	SessionID    uuid.UUID `bun:"session_id,notnull" json:"session_id"`
	UserID       uuid.UUID `bun:"user_id,notnull" json:"user_id"`
	ReactionType string    `bun:"reaction_type,notnull" json:"reaction_type"` // fire, ski, snow, clap
	CreatedAt    time.Time `bun:"created_at,default:current_timestamp" json:"created_at"`

	User *User `bun:"rel:belongs-to,join:user_id=id" json:"user,omitempty"`
}

// SessionComment represents a comment on a ski session.
type SessionComment struct {
	bun.BaseModel `bun:"table:session_comments,alias:sc"`

	ID        uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	SessionID uuid.UUID `bun:"session_id,notnull" json:"session_id"`
	UserID    uuid.UUID `bun:"user_id,notnull" json:"user_id"`
	Content   string    `bun:"content,notnull" json:"content"`
	CreatedAt time.Time `bun:"created_at,default:current_timestamp" json:"created_at"`
	UpdatedAt time.Time `bun:"updated_at,default:current_timestamp" json:"updated_at"`

	User *User `bun:"rel:belongs-to,join:user_id=id" json:"user,omitempty"`
}

// ReactionSummary aggregates reaction metrics for a session.
type ReactionSummary struct {
	Counts        map[string]int `json:"counts"`
	UserReactions []string       `json:"user_reactions"`
	Total         int            `json:"total"`
}
