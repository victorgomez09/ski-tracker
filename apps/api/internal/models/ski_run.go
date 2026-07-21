package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type SkiRun struct {
	bun.BaseModel `bun:"table:ski_runs,alias:sr"`

	ID        uuid.UUID `bun:"id,pk,default:gen_random_uuid()" json:"id"`
	SessionID uuid.UUID `bun:"session_id,notnull" json:"session_id"`

	// Physical metrics
	VerticalDrop  float64 `bun:"vertical_drop" json:"vertical_drop"`
	MaxSpeed      float64 `bun:"max_speed" json:"max_speed"`
	AvgSpeed      float64 `bun:"avg_speed" json:"avg_speed"`
	TotalDistance float64 `bun:"total_distance" json:"total_distance"`
	ElevationGain float64 `bun:"elevation_gain" json:"elevation_gain"`
	ElevationLoss float64 `bun:"elevation_loss" json:"elevation_loss"`
	TotalPoints   int     `bun:"total_points" json:"total_points"`

	// Map Matching enrichment
	MatchedPisteID  *string `bun:"matched_piste_id" json:"matched_piste_id"`
	PredominantDiff string  `bun:"predominant_diff" json:"predominant_diff"`

	CreatedAt time.Time `bun:"created_at,default:current_timestamp" json:"created_at"`

	Session      *SkiSession `bun:"rel:belongs-to,join:session_id=id"`
	MatchedPiste *SkiPiste   `bun:"rel:belongs-to,join:matched_piste_id=id"`
}
