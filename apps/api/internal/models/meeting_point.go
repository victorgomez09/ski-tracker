package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// MeetingPoint represents a temporary geographic rendezvous point in a ski resort (2.3).
type MeetingPoint struct {
	bun.BaseModel `bun:"table:meeting_points,alias:mp"`

	ID          uuid.UUID  `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	CreatedBy   uuid.UUID  `bun:"created_by,notnull" json:"created_by"`
	CrewID      *uuid.UUID `bun:"crew_id" json:"crew_id,omitempty"`
	ResortID    string     `bun:"resort_id,notnull" json:"resort_id"`
	Title       string     `bun:"title,notnull" json:"title"`
	Description string     `bun:"description,default:''" json:"description"`
	Latitude    float64    `bun:"latitude,notnull" json:"latitude"`
	Longitude   float64    `bun:"longitude,notnull" json:"longitude"`
	MeetTime    string     `bun:"meet_time,default:''" json:"meet_time"`
	IsActive    bool       `bun:"is_active,notnull,default:true" json:"is_active"`
	CreatedAt   time.Time  `bun:"created_at,default:current_timestamp" json:"created_at"`
	UpdatedAt   time.Time  `bun:"updated_at,default:current_timestamp" json:"updated_at"`

	Creator   *User `bun:"rel:belongs-to,join:created_by=id" json:"creator,omitempty"`
	Crew      *Crew `bun:"rel:belongs-to,join:crew_id=id" json:"crew,omitempty"`
	CanDelete bool  `bun:"-" json:"can_delete,omitempty"`
}
