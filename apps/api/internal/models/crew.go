package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// Crew represents a ski group/crew for trips, weekends or friends.
type Crew struct {
	bun.BaseModel `bun:"table:crews,alias:c"`

	ID            uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	Name          string    `bun:"name,notnull" json:"name"`
	Description   string    `bun:"description,default:''" json:"description"`
	ResortID      string    `bun:"resort_id,default:''" json:"resort_id"`
	CreatedBy     uuid.UUID `bun:"created_by,notnull" json:"created_by"`
	CoverImageURL string    `bun:"cover_image_url,default:''" json:"cover_image_url"`
	CreatedAt     time.Time `bun:"created_at,default:current_timestamp" json:"created_at"`
	UpdatedAt     time.Time `bun:"updated_at,default:current_timestamp" json:"updated_at"`

	Creator     *User        `bun:"rel:belongs-to,join:created_by=id" json:"creator,omitempty"`
	Members     []CrewMember `bun:"rel:has-many,join:id=crew_id" json:"members,omitempty"`
	Photos      []CrewPhoto  `bun:"rel:has-many,join:id=crew_id" json:"photos,omitempty"`
	MemberCount int          `bun:"-" json:"member_count,omitempty"`
	Resort      *SkiResort   `bun:"rel:belongs-to,join:resort_id=id" json:"resort,omitempty"`
}

// CrewMember represents a member of a Crew.
type CrewMember struct {
	bun.BaseModel `bun:"table:crew_members,alias:cm"`

	ID       uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	CrewID   uuid.UUID `bun:"crew_id,notnull" json:"crew_id"`
	UserID   uuid.UUID `bun:"user_id,notnull" json:"user_id"`
	Role     string    `bun:"role,notnull,default:'member'" json:"role"` // 'admin', 'member'
	JoinedAt time.Time `bun:"joined_at,default:current_timestamp" json:"joined_at"`

	User *User `bun:"rel:belongs-to,join:user_id=id" json:"user,omitempty"`
}

// CrewPhoto represents a collaborative photo uploaded to a Crew.
type CrewPhoto struct {
	bun.BaseModel `bun:"table:crew_photos,alias:cp"`

	ID        uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	CrewID    uuid.UUID `bun:"crew_id,notnull" json:"crew_id"`
	UserID    uuid.UUID `bun:"user_id,notnull" json:"user_id"`
	PhotoURL  string    `bun:"photo_url,notnull" json:"photo_url"`
	Caption   string    `bun:"caption,default:''" json:"caption"`
	CreatedAt time.Time `bun:"created_at,default:current_timestamp" json:"created_at"`

	User *User `bun:"rel:belongs-to,join:user_id=id" json:"user,omitempty"`
}
