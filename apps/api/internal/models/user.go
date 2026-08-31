package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// User represents a user in the system.
type User struct {
	bun.BaseModel `bun:"table:users,alias:u"`

	ID           uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	Email        string    `bun:"email,notnull,unique" json:"email"`
	PasswordHash []byte    `bun:"password_hash,notnull" json:"-"`
	DisplayName  string    `bun:"display_name" json:"display_name"`
	AvatarURL    string    `bun:"avatar_url" json:"avatar_url"`
	FirstName    string    `bun:"first_name,default:''" json:"first_name"`
	LastName     string    `bun:"last_name,default:''" json:"last_name"`
	ActivityType string    `bun:"activity_type" json:"activity_type"`
	TimeTracking int64     `bun:"time_tracking,default:5000" json:"time_tracking"`
	PrivacySessions     string    `bun:"privacy_sessions,default:'FRIENDS'" json:"privacy_sessions"`
	PrivacyLiveLocation string    `bun:"privacy_live_location,default:'WHILE_RECORDING'" json:"privacy_live_location"`
	PrivacyRequests     string    `bun:"privacy_requests,default:'EVERYONE'" json:"privacy_requests"`
	LastLatitude        *float64  `bun:"last_latitude" json:"last_latitude,omitempty"`
	LastLongitude       *float64  `bun:"last_longitude" json:"last_longitude,omitempty"`
	LastResortID        string    `bun:"last_resort_id" json:"last_resort_id,omitempty"`
	LastLocationTime    time.Time `bun:"last_location_time" json:"last_location_time,omitempty"`
}
