package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// Friendship represents a relationship between two users.
type Friendship struct {
	bun.BaseModel `bun:"table:friendships,alias:f"`

	ID          uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	RequesterID uuid.UUID `bun:"requester_id,notnull" json:"requester_id"`
	AddresseeID uuid.UUID `bun:"addressee_id,notnull" json:"addressee_id"`
	Status      string    `bun:"status,notnull,default:'PENDING'" json:"status"` // PENDING, ACCEPTED, REJECTED, BLOCKED
	CreatedAt   time.Time `bun:"created_at,default:current_timestamp" json:"created_at"`
	UpdatedAt   time.Time `bun:"updated_at,default:current_timestamp" json:"updated_at"`

	// Relationships
	Requester *User `bun:"rel:belongs-to,join:requester_id=id" json:"requester,omitempty"`
	Addressee *User `bun:"rel:belongs-to,join:addressee_id=id" json:"addressee,omitempty"`
}

type LeaderboardEntry struct {
	UserID      uuid.UUID `json:"user_id"`
	DisplayName string    `json:"display_name"`
	AvatarURL   string    `json:"avatar_url"`
	FirstName   string    `json:"first_name"`
	LastName    string    `json:"last_name"`
	Value       float64   `json:"value"`
}
