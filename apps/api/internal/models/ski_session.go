package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type SkiSession struct {
	bun.BaseModel `bun:"table:ski_sessions,alias:ss"`

	ID            uuid.UUID  `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	UserID        uuid.UUID  `bun:"user_id,notnull" json:"user_id"`
	ResortID      string     `bun:"resort_id,notnull" json:"resort_id"`
	StartTime     time.Time  `bun:"start_time,default:current_timestamp" json:"start_time"`
	EndTime       *time.Time `bun:"end_time" json:"end_time"`
	TotalDistance float64    `bun:"total_distance,default:0" json:"total_distance"`
	MaxSpeed      float64    `bun:"max_speed,default:0" json:"max_speed"`
	VerticalDrop  float64    `bun:"vertical_drop,default:0" json:"vertical_drop"`
	ActivityType  string     `bun:"activity_type,default:'ski'" json:"activity_type"`
	CreatedAt     time.Time  `bun:"created_at,default:current_timestamp" json:"created_at"`

	Points []SessionPoint `bun:"rel:has-many,join:id=session_id" json:"points,omitempty"`
	Runs   []SkiRun       `bun:"rel:has-many,join:id=session_id" json:"runs,omitempty"`
}
