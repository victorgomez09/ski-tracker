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
	ResortID      *string    `bun:"resort_id" json:"resort_id"`
	StartTime     time.Time  `bun:"start_time,default:current_timestamp" json:"start_time"`
	EndTime       *time.Time `bun:"end_time" json:"end_time"`
	TotalDistance float64    `bun:"total_distance,default:0" json:"total_distance"`
	MaxSpeed      float64    `bun:"max_speed,default:0" json:"max_speed"`
	VerticalDrop  float64    `bun:"vertical_drop,default:0" json:"vertical_drop"`
	AvgSpeed      float64    `bun:"avg_speed,default:0" json:"avg_speed"`
	ElevationGain float64    `bun:"elevation_gain,default:0" json:"elevation_gain"`
	ElevationLoss float64    `bun:"elevation_loss,default:0" json:"elevation_loss"`
	MovingTime    int64      `bun:"moving_time,default:0" json:"moving_time"`
	Duration      int64      `bun:"duration,default:0" json:"duration"`
	Pace          float64    `bun:"pace,default:0" json:"pace"`
	ActivityType  string     `bun:"activity_type,default:'ski'" json:"activity_type"`
	IsPublic      bool       `bun:"is_public,default:true" json:"is_public"`
	CreatedAt     time.Time  `bun:"created_at,default:current_timestamp" json:"created_at"`

	User   *User          `bun:"rel:belongs-to,join:user_id=id" json:"user,omitempty"`
	Points []SessionPoint `bun:"rel:has-many,join:id=session_id" json:"points,omitempty"`
	Runs   []SkiRun       `bun:"rel:has-many,join:id=session_id" json:"runs,omitempty"`
	Resort *SkiResort     `bun:"rel:belongs-to,join:resort_id=id" json:"resort,omitempty"`
	Photos []SessionPhoto `bun:"rel:has-many,join:id=session_id" json:"photos,omitempty"`
}

type SessionMetrics struct {
	TotalDistance float64 `json:"total_distance"`
	MaxSpeed      float64 `json:"max_speed"`
	VerticalDrop  float64 `json:"vertical_drop"`
	AvgSpeed      float64 `json:"avg_speed"`
	ElevationGain float64 `json:"elevation_gain"`
	ElevationLoss float64 `json:"elevation_loss"`
	MovingTime    int64   `json:"moving_time"`
	Duration      int64   `json:"duration"`
	Pace          float64 `json:"pace"`
}
