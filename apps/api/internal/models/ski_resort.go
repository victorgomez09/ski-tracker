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

	Pistes []*SkiPiste `bun:"rel:has-many,join:id=resort_id"`
	Lifts  []*SkiLift  `bun:"rel:has-many,join:id=resort_id"`
}
