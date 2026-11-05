package sync

import (
	"sort"
	"strings"

	"github.com/victorgomez09/ski-tracker/internal/models"
)

// ResortCandidate encapsulates a parsed ski resort with metadata used for deduplication.
type ResortCandidate struct {
	Resort     models.SkiResort
	RawFeature GeoJSONFeature
	TotalRuns  int
	TotalLifts int
	GeomType   string
	Status     string
	Sources    []string
}

// DeduplicateResorts groups resorts by normalized name and geographical proximity (<= 25 km),
// selects the canonical resort for each cluster, enriches missing metadata from duplicates,
// and produces a mapping of duplicate IDs -> canonical ID.
func DeduplicateResorts(candidates []ResortCandidate) ([]models.SkiResort, map[string]string) {
	dedupMap := make(map[string]string)
	if len(candidates) == 0 {
		return nil, dedupMap
	}

	// 1. Group candidates by normalized name
	byNormalizedName := make(map[string][]ResortCandidate)
	var unnamedCandidates []ResortCandidate

	for _, c := range candidates {
		normName := normalizeResortName(c.Resort.Name)
		if normName == "" || normName == "no name" {
			unnamedCandidates = append(unnamedCandidates, c)
			continue
		}
		byNormalizedName[normName] = append(byNormalizedName[normName], c)
	}

	var canonicalResorts []models.SkiResort

	// Add unnamed candidates directly without merging
	for _, c := range unnamedCandidates {
		canonicalResorts = append(canonicalResorts, c.Resort)
	}

	const maxClusterDistanceKM = 25.0

	// 2. For each name group, cluster by geographic proximity
	for _, group := range byNormalizedName {
		if len(group) == 1 {
			canonicalResorts = append(canonicalResorts, group[0].Resort)
			continue
		}

		visited := make([]bool, len(group))

		for i := 0; i < len(group); i++ {
			if visited[i] {
				continue
			}

			cluster := []ResortCandidate{group[i]}
			visited[i] = true

			for j := i + 1; j < len(group); j++ {
				if visited[j] {
					continue
				}

				// If both coordinates are valid, check distance
				dist := HaversineDistance(group[i].Resort.Latitude, group[i].Resort.Longitude,
					group[j].Resort.Latitude, group[j].Resort.Longitude)

				// Also consider matching if both coordinates are exactly 0,0 and same country
				isBothZeroCoords := group[i].Resort.Latitude == 0 && group[i].Resort.Longitude == 0 &&
					group[j].Resort.Latitude == 0 && group[j].Resort.Longitude == 0 &&
					group[i].Resort.Country == group[j].Resort.Country

				if dist <= maxClusterDistanceKM || isBothZeroCoords {
					cluster = append(cluster, group[j])
					visited[j] = true
				}
			}

			if len(cluster) == 1 {
				canonicalResorts = append(canonicalResorts, cluster[0].Resort)
				continue
			}

			// Sort cluster to determine canonical candidate
			sort.SliceStable(cluster, func(a, b int) bool {
				scoreA := scoreCandidate(cluster[a])
				scoreB := scoreCandidate(cluster[b])
				if scoreA != scoreB {
					return scoreA > scoreB
				}
				// Deterministic tie-breaker
				return cluster[a].Resort.ID < cluster[b].Resort.ID
			})

			canonical := cluster[0].Resort

			// Enrich canonical with missing information from duplicate entries
			for k := 1; k < len(cluster); k++ {
				dup := cluster[k]
				dedupMap[dup.Resort.ID] = canonical.ID

				// Website backfill
				if canonical.Website == "" && dup.Resort.Website != "" {
					canonical.Website = dup.Resort.Website
				}

				// Country backfill
				if (canonical.Country == "" || canonical.Country == "Unknown") &&
					(dup.Resort.Country != "" && dup.Resort.Country != "Unknown") {
					canonical.Country = dup.Resort.Country
				}

				// Coordinates backfill if canonical was (0,0)
				if canonical.Latitude == 0 && canonical.Longitude == 0 &&
					(dup.Resort.Latitude != 0 || dup.Resort.Longitude != 0) {
					canonical.Latitude = dup.Resort.Latitude
					canonical.Longitude = dup.Resort.Longitude
				}
			}

			canonicalResorts = append(canonicalResorts, canonical)
		}
	}

	return canonicalResorts, dedupMap
}

func scoreCandidate(c ResortCandidate) int {
	score := 0

	// 1. Total statistics: runs + lifts (weighted highest)
	// Empty resorts like the skimap.org duplicate of Valdelinares have 0 runs and 0 lifts.
	score += (c.TotalRuns + c.TotalLifts) * 100

	// 2. Geometry preference: Polygons are richer and more precise than points
	if c.GeomType == "Polygon" || c.GeomType == "MultiPolygon" {
		score += 50
	}

	// 3. Operating status preference
	if c.Status == "operating" {
		score += 20
	}

	// 4. Source preference: openstreetmap usually has active community mapping
	for _, src := range c.Sources {
		if src == "openstreetmap" {
			score += 10
			break
		}
	}

	// 5. Website presence
	if c.Resort.Website != "" {
		score += 5
	}

	return score
}

func normalizeResortName(name string) string {
	s := strings.TrimSpace(name)
	return strings.ToLower(s)
}
