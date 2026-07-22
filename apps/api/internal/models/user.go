package models

import (
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
	FirstName    string    `bun:"first_name,default:''" json:"first_name"`
	LastName     string    `bun:"last_name,default:''" json:"last_name"`
	ActivityType string    `bun:"activity_type" json:"activity_type"`
}
