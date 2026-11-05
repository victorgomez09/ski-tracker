package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
)

// GeoJSONFeature represents a single feature in a GeoJSON FeatureCollection.
type GeoJSONFeature struct {
	Type       string                 `json:"type"`
	ID         interface{}            `json:"id"`
	Geometry   map[string]interface{} `json:"geometry"`
	Properties map[string]interface{} `json:"properties"`
}

// SyncOptions provides configuration options for data synchronization.
type SyncOptions struct {
	SkipResorts bool
	SkipPistes  bool
	SkipLifts   bool
	SkipPOIs    bool
	POIOptions  SyncPOIOptions
}

// SyncPOIOptions provides filtering and performance options for POI synchronization.
type SyncPOIOptions struct {
	Country      string // Filter by ISO 3166-1 alpha-2 country code (e.g. "ES")
	ResortName   string // Filter by resort name substring
	ResortID     string // Filter by exact resort ID
	Force        bool   // If true, re-fetch POIs even if already stored in database
	Limit        int    // Max number of resorts to process (0 = all matching)
	Workers      int    // Number of concurrent worker routines (default: 3)
	UseOSMMapAPI bool   // If true, use live OSM map bbox endpoint instead of bulk spots.geojson
	SpotsURL     string // Optional override for spots.geojson URL
}

// Batch size for database bulk operations.
const defaultBatchSize = 1000

// HaversineDistance calculates the great-circle distance in kilometers between two points.
func HaversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusKM = 6371.0
	rad := math.Pi / 180.0
	dLat := (lat2 - lat1) * rad
	dLon := (lon2 - lon1) * rad

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*rad)*math.Cos(lat2*rad)*
			math.Sin(dLon/2)*math.Sin(dLon/2)

	c := 2.0 * math.Atan2(math.Sqrt(a), math.Sqrt(1.0-a))
	return earthRadiusKM * c
}

// ExtractCoordinates extracts longitude and latitude from a GeoJSON geometry map.
func ExtractCoordinates(geometry map[string]interface{}) (float64, float64, bool) {
	if geometry == nil {
		return 0, 0, false
	}

	geomType, _ := geometry["type"].(string)
	switch geomType {
	case "Point":
		if coords, ok := geometry["coordinates"].([]interface{}); ok && len(coords) >= 2 {
			lon, ok1 := coords[0].(float64)
			lat, ok2 := coords[1].(float64)
			if ok1 && ok2 {
				return lon, lat, true
			}
		}
	case "Polygon":
		if rings, ok := geometry["coordinates"].([]interface{}); ok && len(rings) > 0 {
			if ring, ok := rings[0].([]interface{}); ok && len(ring) > 0 {
				if coords, ok := ring[0].([]interface{}); ok && len(coords) >= 2 {
					lon, ok1 := coords[0].(float64)
					lat, ok2 := coords[1].(float64)
					if ok1 && ok2 {
						return lon, lat, true
					}
				}
			}
		}
	case "MultiPolygon":
		if polys, ok := geometry["coordinates"].([]interface{}); ok && len(polys) > 0 {
			if rings, ok := polys[0].([]interface{}); ok && len(rings) > 0 {
				if ring, ok := rings[0].([]interface{}); ok && len(ring) > 0 {
					if coords, ok := ring[0].([]interface{}); ok && len(coords) >= 2 {
						lon, ok1 := coords[0].(float64)
						lat, ok2 := coords[1].(float64)
						if ok1 && ok2 {
							return lon, lat, true
						}
					}
				}
			}
		}
	}

	return 0, 0, false
}

// GetFeatureRunsAndLiftsCount extracts total runs and lifts count from a feature's statistics.
func GetFeatureRunsAndLiftsCount(properties map[string]interface{}) (int, int) {
	if properties == nil {
		return 0, 0
	}

	stats, ok := properties["statistics"].(map[string]interface{})
	if !ok {
		return 0, 0
	}

	totalRuns := 0
	if runs, ok := stats["runs"].(map[string]interface{}); ok {
		if byActivity, ok := runs["byActivity"].(map[string]interface{}); ok {
			for _, act := range byActivity {
				if actMap, ok := act.(map[string]interface{}); ok {
					if byDiff, ok := actMap["byDifficulty"].(map[string]interface{}); ok {
						for _, diff := range byDiff {
							if diffMap, ok := diff.(map[string]interface{}); ok {
								if count, ok := diffMap["count"].(float64); ok {
									totalRuns += int(count)
								}
							}
						}
					}
				}
			}
		}
	}

	totalLifts := 0
	if lifts, ok := stats["lifts"].(map[string]interface{}); ok {
		if byType, ok := lifts["byType"].(map[string]interface{}); ok {
			for _, lt := range byType {
				if ltMap, ok := lt.(map[string]interface{}); ok {
					if count, ok := ltMap["count"].(float64); ok {
						totalLifts += int(count)
					}
				}
			}
		}
	}

	return totalRuns, totalLifts
}

func downloadToTempFile(ctx context.Context, url string, prefix string) (*os.File, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "SkiTrackerApp/1.0 (contact@skitracker.com)")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected HTTP status downloading %s: %d", url, resp.StatusCode)
	}

	tmpFile, err := os.CreateTemp("", prefix)
	if err != nil {
		return nil, fmt.Errorf("failed to create temp file: %w", err)
	}

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpFile.Name())
		return nil, fmt.Errorf("failed to download %s: %w", url, err)
	}

	if _, err := tmpFile.Seek(0, io.SeekStart); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpFile.Name())
		return nil, fmt.Errorf("failed to seek temp file: %w", err)
	}

	return tmpFile, nil
}

func streamGeoJSONFeatures(r io.Reader, handleFeature func(f GeoJSONFeature) error) error {
	dec := json.NewDecoder(r)

	tok, err := dec.Token()
	if err != nil {
		return fmt.Errorf("failed to read JSON start: %w", err)
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '{' {
		return fmt.Errorf("expected '{' at beginning of GeoJSON, got %v", tok)
	}

	foundFeatures := false
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return fmt.Errorf("error reading JSON key: %w", err)
		}
		key, ok := tok.(string)
		if !ok {
			continue
		}
		if key == "features" {
			foundFeatures = true
			break
		}
		var dummy json.RawMessage
		if err := dec.Decode(&dummy); err != nil {
			return fmt.Errorf("error skipping property %s: %w", key, err)
		}
	}

	if !foundFeatures {
		return fmt.Errorf("could not find 'features' array in GeoJSON")
	}

	tok, err = dec.Token()
	if err != nil {
		return fmt.Errorf("failed to read features array start: %w", err)
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '[' {
		return fmt.Errorf("expected '[' for features array, got %v", tok)
	}

	for dec.More() {
		var f GeoJSONFeature
		if err := dec.Decode(&f); err != nil {
			return fmt.Errorf("failed to decode GeoJSON feature: %w", err)
		}
		if err := handleFeature(f); err != nil {
			return err
		}
	}

	return nil
}
