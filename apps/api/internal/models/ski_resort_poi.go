package models

import (
	"time"

	"github.com/uptrace/bun"
)

type SkiResortPOI struct {
	bun.BaseModel `bun:"table:ski_resort_pois,alias:srp"`

	ID        string                 `bun:"id,pk" json:"id"`
	ResortID  string                 `bun:"resort_id,notnull" json:"resort_id"`
	Name      string                 `bun:"name,notnull" json:"name"`
	Category  string                 `bun:"category,notnull" json:"category"`
	Latitude  float64                `bun:"latitude,notnull" json:"latitude"`
	Longitude float64                `bun:"longitude,notnull" json:"longitude"`
	Tags      map[string]interface{} `bun:"tags,type:jsonb" json:"tags"`
	CreatedAt time.Time              `bun:"created_at,default:current_timestamp" json:"created_at"`
}
