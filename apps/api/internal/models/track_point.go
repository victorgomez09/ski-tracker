package models

import (
	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type TrackPoint struct {
	bun.BaseModel `bun:"table:track_point,alias:tp"`

	ID        uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	Lat       float64   `bun:"lat" json:"lat" binding:"required"`
	Lon       float64   `bun:"lon" json:"lon" binding:"required"`
	Alt       float64   `bun:"alt" json:"alt"`
	Speed     float64   `bun:"speed" json:"speed"`
	Timestamp int64     `bun:"timestamp" json:"timestamp" binding:"required"`

	UserID uuid.UUID `bun:"user_id" json:"user_id"`
}
