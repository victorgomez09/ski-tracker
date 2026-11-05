package sync

import (
	"testing"

	"github.com/victorgomez09/ski-tracker/internal/models"
)

func TestDeduplicateResorts_Valdelinares(t *testing.T) {
	// Valdelinares case:
	// Entry 1: from skimap.org, 0 runs, 0 lifts, has website "http://www.valdelinares.com", Point (-0.6, 40.4)
	cand1 := ResortCandidate{
		Resort: models.SkiResort{
			ID:        "e5b46873278f4b4ab3c3ff7a4b3206b96ccd479c",
			Name:      "Valdelinares",
			Country:   "ES",
			Latitude:  40.4,
			Longitude: -0.6,
			Website:   "http://www.valdelinares.com",
		},
		TotalRuns:  0,
		TotalLifts: 0,
		GeomType:   "Point",
		Status:     "operating",
		Sources:    []string{"skimap.org"},
	}

	// Entry 2: from openstreetmap, 27 runs, 12 lifts, empty website, Point (-0.6317, 40.3831)
	cand2 := ResortCandidate{
		Resort: models.SkiResort{
			ID:        "f6faf99488990e64ba15017512e03b1b8634abf8",
			Name:      "Valdelinares",
			Country:   "ES",
			Latitude:  40.383179,
			Longitude: -0.631749,
			Website:   "",
		},
		TotalRuns:  27,
		TotalLifts: 12,
		GeomType:   "Point",
		Status:     "operating",
		Sources:    []string{"openstreetmap"},
	}

	canonicalResorts, dedupMap := DeduplicateResorts([]ResortCandidate{cand1, cand2})

	if len(canonicalResorts) != 1 {
		t.Fatalf("expected 1 canonical resort, got %d", len(canonicalResorts))
	}

	resort := canonicalResorts[0]
	if resort.ID != cand2.Resort.ID {
		t.Errorf("expected canonical ID %q, got %q", cand2.Resort.ID, resort.ID)
	}

	if resort.Website != "http://www.valdelinares.com" {
		t.Errorf("expected inherited website 'http://www.valdelinares.com', got %q", resort.Website)
	}

	if dedupMap[cand1.Resort.ID] != cand2.Resort.ID {
		t.Errorf("expected dedupMap[%q] = %q, got %q", cand1.Resort.ID, cand2.Resort.ID, dedupMap[cand1.Resort.ID])
	}
}

func TestDeduplicateResorts_DistantSameName(t *testing.T) {
	// Two resorts with the same name "Silver Mountain", but far away in different states/countries
	cand1 := ResortCandidate{
		Resort: models.SkiResort{
			ID:        "silver-idaho",
			Name:      "Silver Mountain",
			Country:   "US",
			Latitude:  47.5,
			Longitude: -116.1,
		},
		TotalRuns:  10,
		TotalLifts: 5,
		GeomType:   "Polygon",
		Status:     "operating",
	}

	cand2 := ResortCandidate{
		Resort: models.SkiResort{
			ID:        "silver-maine",
			Name:      "Silver Mountain",
			Country:   "US",
			Latitude:  44.5,
			Longitude: -70.1,
		},
		TotalRuns:  5,
		TotalLifts: 2,
		GeomType:   "Point",
		Status:     "operating",
	}

	canonicalResorts, dedupMap := DeduplicateResorts([]ResortCandidate{cand1, cand2})

	if len(canonicalResorts) != 2 {
		t.Fatalf("expected 2 distinct resorts due to distance, got %d", len(canonicalResorts))
	}

	if len(dedupMap) != 0 {
		t.Errorf("expected empty dedupMap, got %v", dedupMap)
	}
}

func TestHaversineDistance(t *testing.T) {
	// Distance between Valdelinares coords: [-0.6, 40.4] and [-0.631749, 40.383179]
	d := HaversineDistance(40.4, -0.6, 40.383179, -0.631749)
	if d < 3.0 || d > 4.0 {
		t.Errorf("expected distance around ~3.3 km, got %f", d)
	}
}
