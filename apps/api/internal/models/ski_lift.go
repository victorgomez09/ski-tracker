package models

import (
	"time"

	"github.com/uptrace/bun"
)

type SkiLift struct {
	bun.BaseModel `bun:"table:ski_lifts,alias:sl"`

	ID              string                 `bun:"id,pk"`
	ResortID        *string                `bun:"resort_id"`
	Name            string                 `bun:"name"`
	LiftType        string                 `bun:"lift_type,notnull"` // chair_lift, t-bar, gondola...
	Capacity        int                    `bun:"capacity"`
	CapacityHourly  int                    `bun:"capacity_hourly"`
	GeometryGeoJSON map[string]interface{} `bun:"geometry_geojson,type:jsonb,notnull"` // 2D LineString coordinates
	Tags            map[string]interface{} `bun:"tags,type:jsonb"`
	CreatedAt       time.Time              `bun:"created_at,default:current_timestamp"`
}
