package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type UserFavoriteResort struct {
	bun.BaseModel `bun:"table:user_favorite_resorts,alias:ufr"`

	ID        uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `bun:"user_id,notnull" json:"user_id"`
	ResortID  string    `bun:"resort_id,notnull" json:"resort_id"`
	CreatedAt time.Time `bun:"created_at,default:current_timestamp" json:"created_at"`

	Resort *SkiResort `bun:"rel:belongs-to,join:resort_id=id" json:"resort,omitempty"`
	User   *User      `bun:"rel:belongs-to,join:user_id=id" json:"user,omitempty"`
}
