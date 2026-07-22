package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type SessionPoint struct {
	bun.BaseModel `bun:"table:session_points,alias:sp"`

	ID        uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	SessionID uuid.UUID `bun:"session_id,notnull" json:"session_id"`
	// We use a string for the WKT (Well-Known Text) of PostGIS, e.g., "POINT(lon lat)"
	Geom      string    `bun:"geom,type:geometry(Point,4326),notnull" json:"geom"`
	Altitude  float64   `bun:"altitude" json:"altitude"`
	Speed     float64   `bun:"speed" json:"speed"`
	Timestamp time.Time `bun:"timestamp,notnull" json:"timestamp"`
}
