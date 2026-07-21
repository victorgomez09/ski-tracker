package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type SkiSession struct {
	bun.BaseModel `bun:"table:ski_sessions,alias:ss"`

	ID            uuid.UUID  `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	UserID        uuid.UUID  `bun:"user_id,notnull"`
	StartTime     time.Time  `bun:"start_time,default:current_timestamp"`
	EndTime       *time.Time `bun:"end_time"`
	TotalDistance float64    `bun:"total_distance,default:0"`
	MaxSpeed      float64    `bun:"max_speed,default:0"`
	VerticalDrop  float64    `bun:"vertical_drop,default:0"`
	CreatedAt     time.Time  `bun:"created_at,default:current_timestamp"`

	Points []SessionPoint `bun:"rel:has-many,join:id=session_id"`
}
