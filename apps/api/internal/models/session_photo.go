package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type SessionPhoto struct {
	bun.BaseModel `bun:"table:session_photos,alias:sp"`

	ID        uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	SessionID uuid.UUID `bun:"session_id,notnull" json:"session_id"`
	PhotoURL  string    `bun:"photo_url,notnull" json:"photo_url"`
	CreatedAt time.Time `bun:"created_at,default:current_timestamp" json:"created_at"`
}
