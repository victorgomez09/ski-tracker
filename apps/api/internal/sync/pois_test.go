package sync

import (
	"encoding/xml"
	"testing"
)

func TestClassifyPOICategory(t *testing.T) {
	tests := []struct {
		name         string
		tags         map[string]string
		wantCategory string
		wantName     string
	}{
		{
			name:         "Toilets custom name",
			tags:         map[string]string{"amenity": "toilets", "name": "Baños Centrales"},
			wantCategory: "toilets",
			wantName:     "Baños Centrales",
		},
		{
			name:         "Toilets default name",
			tags:         map[string]string{"amenity": "toilets"},
			wantCategory: "toilets",
			wantName:     "Aseos",
		},
		{
			name:         "Restaurant",
			tags:         map[string]string{"amenity": "restaurant", "name": "La Cabaña"},
			wantCategory: "restaurant",
			wantName:     "La Cabaña",
		},
		{
			name:         "First aid",
			tags:         map[string]string{"emergency": "first_aid"},
			wantCategory: "first_aid",
			wantName:     "Primeros Auxilios",
		},
		{
			name:         "Ski rental",
			tags:         map[string]string{"ski": "rental"},
			wantCategory: "rental",
			wantName:     "Alquiler de Esquí",
		},
		{
			name:         "Viewpoint",
			tags:         map[string]string{"tourism": "viewpoint", "name": "Mirador de la Luna"},
			wantCategory: "viewpoint",
			wantName:     "Mirador de la Luna",
		},
		{
			name:         "Ignore parking_space",
			tags:         map[string]string{"amenity": "parking_space", "name": "P-10"},
			wantCategory: "",
			wantName:     "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cat, name := ClassifyPOICategory(tt.tags)
			if cat != tt.wantCategory {
				t.Errorf("got category %q, want %q", cat, tt.wantCategory)
			}
			if name != tt.wantName {
				t.Errorf("got name %q, want %q", name, tt.wantName)
			}
		})
	}
}

func TestOsmXMLDocParsing(t *testing.T) {
	xmlData := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="101" lat="40.380" lon="-0.630">
    <tag k="amenity" v="restaurant"/>
    <tag k="name" v="El Refugio"/>
  </node>
  <node id="102" lat="40.381" lon="-0.631"/>
  <node id="103" lat="40.382" lon="-0.632"/>
  <way id="201">
    <nd ref="102"/>
    <nd ref="103"/>
    <tag k="amenity" v="parking"/>
  </way>
</osm>`)

	var doc OsmXMLDoc
	if err := xml.Unmarshal(xmlData, &doc); err != nil {
		t.Fatalf("failed to unmarshal xml: %v", err)
	}

	if len(doc.Nodes) != 3 {
		t.Errorf("expected 3 nodes, got %d", len(doc.Nodes))
	}
	if len(doc.Ways) != 1 {
		t.Errorf("expected 1 way, got %d", len(doc.Ways))
	}
}

func TestParseSpotFeature(t *testing.T) {
	resorts := []resortCoord{
		{
			ID:        "resort-valdelinares",
			Name:      "Valdelinares",
			Latitude:  40.3831,
			Longitude: -0.6317,
		},
	}
	grid := newResortSpatialIndex(resorts)
	dedupMap := map[string]string{
		"old-valdelinares-id": "resort-valdelinares",
	}

	// 1. Direct skiAreas matching with remapping
	f1 := GeoJSONFeature{
		Geometry: map[string]interface{}{
			"type":        "Point",
			"coordinates": []interface{}{-0.6324, 40.3840, 1897.0},
		},
		Properties: map[string]interface{}{
			"id":       "spot-1",
			"spotType": "lift_station",
			"position": "top",
			"skiAreas": []interface{}{
				map[string]interface{}{
					"properties": map[string]interface{}{
						"id": "old-valdelinares-id",
					},
				},
			},
		},
	}

	poi1, ok1 := parseSpotFeature(f1, dedupMap, grid)
	if !ok1 || poi1 == nil {
		t.Fatalf("expected spot1 to be parsed, got ok=false")
	}
	if poi1.ResortID != "resort-valdelinares" {
		t.Errorf("expected remapped resort ID 'resort-valdelinares', got %q", poi1.ResortID)
	}
	if poi1.Name != "Estación Superior" {
		t.Errorf("expected default name 'Estación Superior', got %q", poi1.Name)
	}
	if poi1.Category != "lift_station" {
		t.Errorf("expected category 'lift_station', got %q", poi1.Category)
	}

	// 2. Spatial matching within 5km when skiAreas is empty
	f2 := GeoJSONFeature{
		Geometry: map[string]interface{}{
			"type":        "Point",
			"coordinates": []interface{}{-0.6330, 40.3850, 1920.0},
		},
		Properties: map[string]interface{}{
			"id":       "spot-2",
			"spotType": "halfpipe",
			"skiAreas": []interface{}{},
		},
	}

	poi2, ok2 := parseSpotFeature(f2, dedupMap, grid)
	if !ok2 || poi2 == nil {
		t.Fatalf("expected spot2 to be parsed spatially, got ok=false")
	}
	if poi2.ResortID != "resort-valdelinares" {
		t.Errorf("expected spatially matched resort ID 'resort-valdelinares', got %q", poi2.ResortID)
	}
	if poi2.Category != "snowpark" {
		t.Errorf("expected category 'snowpark', got %q", poi2.Category)
	}

	// 3. Filtering out spot that is far away from all resorts (> 5km)
	f3 := GeoJSONFeature{
		Geometry: map[string]interface{}{
			"type":        "Point",
			"coordinates": []interface{}{-3.7038, 40.4168}, // Madrid city center, > 250 km from Valdelinares
		},
		Properties: map[string]interface{}{
			"id":       "spot-3",
			"spotType": "lift_station",
			"skiAreas": []interface{}{},
		},
	}

	_, ok3 := parseSpotFeature(f3, dedupMap, grid)
	if ok3 {
		t.Errorf("expected spot3 to be filtered out (distance > 5km), but got ok=true")
	}
}
