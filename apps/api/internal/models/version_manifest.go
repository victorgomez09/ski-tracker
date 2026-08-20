package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type VersionManifest struct {
	bun.BaseModel `bun:"table:version_manifest,alias:vm"`

	ID           uuid.UUID           `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	Platform     string              `bun:"platform,notnull" json:"platform"`         // "ios" or "android"
	Version      string              `bun:"version,notnull" json:"version"`           // Ex: "1.2.0"
	BuildNumber  int                 `bun:"build_number,notnull" json:"build_number"` // Ex: 12
	MinVersion   string              `bun:"min_version,notnull" json:"min_version"`   // Ex: "1.0.0" - Minimum version required to run the app
	Changelog    map[string][]string `bun:"changelog,type:jsonb" json:"changelog"`    // Ex: {"en": ["Added new feature", "Fixed bug"], "es": ["Agregada nueva función", "Corregido error"]}
	ForceUpdate  bool                `bun:"force_update,default:false" json:"force_update"`
	OtaAvailable bool                `bun:"ota_available,default:true" json:"ota_available"`
	StoreURL     string              `bun:"store_url,notnull" json:"store_url"`      // Ex: App Store / Play Store URL
	IsActive     bool                `bun:"is_active,default:true" json:"is_active"` // Allows deactivating a version
	CreatedAt    time.Time           `bun:"created_at,nullzero,notnull,default:current_timestamp" json:"created_at"`
	UpdatedAt    time.Time           `bun:"updated_at,nullzero,notnull,default:current_timestamp" json:"updated_at"`
}
