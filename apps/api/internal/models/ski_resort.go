package models

import (
	"time"

	"github.com/uptrace/bun"
)

type SkiResort struct {
	bun.BaseModel `bun:"table:ski_resorts,alias:sr"`

	ID        string                 `bun:"id,pk"`
	Name      string                 `bun:"name,notnull"`
	Country   string                 `bun:"country"`
	Website   string                 `bun:"website"`
	Latitude  float64                `bun:"latitude,notnull"`
	Longitude float64                `bun:"longitude,notnull"`
	Tags      map[string]interface{} `bun:"tags,type:jsonb"`
	CreatedAt time.Time              `bun:"created_at,default:current_timestamp"`

	Pistes []*SkiPiste    `bun:"rel:has-many,join:id=resort_id"`
	Lifts  []*SkiLift     `bun:"rel:has-many,join:id=resort_id"`
	POIs   []*SkiResortPOI `bun:"rel:has-many,join:id=resort_id"`
}

type SkiResortDEM struct {
	bun.BaseModel `bun:"table:ski_resort_dems,alias:srd"`

	ResortID      string    `json:"resort_id" bun:"resort_id,pk"`
	MinLon        float64   `json:"min_lon" bun:"min_lon,notnull"`
	MinLat        float64   `json:"min_lat" bun:"min_lat,notnull"`
	MaxLon        float64   `json:"max_lon" bun:"max_lon,notnull"`
	MaxLat        float64   `json:"max_lat" bun:"max_lat,notnull"`
	Resolution    int       `json:"resolution" bun:"resolution,notnull"`
	ElevationsB64 string    `json:"elevations_b64" bun:"elevations_b64,notnull"`
	UpdatedAt     time.Time `json:"updated_at" bun:"updated_at,default:current_timestamp"`
}
