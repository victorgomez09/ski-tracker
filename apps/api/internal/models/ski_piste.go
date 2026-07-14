package models

import (
	"time"

	"github.com/uptrace/bun"
)

type SkiPiste struct {
	bun.BaseModel `bun:"table:ski_pistes,alias:sp"`

	ID              string                 `bun:"id,pk"`
	ResortID        *string                `bun:"resort_id"`
	Name            string                 `bun:"name"`
	PisteType       string                 `bun:"piste_type,notnull"`                  // downhill, nordic, sled, etc.
	Difficulty      string                 `bun:"difficulty"`                          // novice, easy, intermediate, advanced
	Lit             bool                   `bun:"lit,default:false"`                   // lighted at night
	GeometryGeoJSON map[string]interface{} `bun:"geometry_geojson,type:jsonb,notnull"` // 2D LineString coordinates
	Tags            map[string]interface{} `bun:"tags,type:jsonb"`
	CreatedAt       time.Time              `bun:"created_at,default:current_timestamp"`
}
