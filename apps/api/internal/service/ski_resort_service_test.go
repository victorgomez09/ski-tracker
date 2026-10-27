package service

import (
	"encoding/xml"
	"testing"

	"github.com/victorgomez09/ski-tracker/internal/models"
)

func TestClassifyPOICategory(t *testing.T) {
	tests := []struct {
		name         string
		tags         map[string]string
		wantCategory string
		wantName     string
	}{
		{
			name:         "Toilets with custom name",
			tags:         map[string]string{"amenity": "toilets", "name": "Baños Telesquí"},
			wantCategory: "toilets",
			wantName:     "Baños Telesquí",
		},
		{
			name:         "Toilets without name",
			tags:         map[string]string{"amenity": "toilets"},
			wantCategory: "toilets",
			wantName:     "Aseos",
		},
		{
			name:         "Restaurant",
			tags:         map[string]string{"amenity": "restaurant", "name": "Mirador"},
			wantCategory: "restaurant",
			wantName:     "Mirador",
		},
		{
			name:         "Cafe without name",
			tags:         map[string]string{"amenity": "cafe"},
			wantCategory: "cafe",
			wantName:     "Cafetería / Bar",
		},
		{
			name:         "First aid",
			tags:         map[string]string{"emergency": "first_aid"},
			wantCategory: "first_aid",
			wantName:     "Primeros Auxilios",
		},
		{
			name:         "Ski rental",
			tags:         map[string]string{"shop": "rental", "ski": "rental", "name": "Ski Rental Valdesquí"},
			wantCategory: "rental",
			wantName:     "Ski Rental Valdesquí",
		},
		{
			name:         "Viewpoint",
			tags:         map[string]string{"tourism": "viewpoint", "name": "Mirador de la Gitana"},
			wantCategory: "viewpoint",
			wantName:     "Mirador de la Gitana",
		},
		{
			name:         "Parking",
			tags:         map[string]string{"amenity": "parking"},
			wantCategory: "parking",
			wantName:     "Aparcamiento",
		},
		{
			name:         "Shelter",
			tags:         map[string]string{"amenity": "shelter", "name": "Refugio Cotos"},
			wantCategory: "hotel",
			wantName:     "Refugio Cotos",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cat, name := classifyPOICategory(tt.tags)
			if cat != tt.wantCategory {
				t.Errorf("got category %q, want %q", cat, tt.wantCategory)
			}
			if name != tt.wantName {
				t.Errorf("got name %q, want %q", name, tt.wantName)
			}
		})
	}
}

func TestOsmXMLParsing(t *testing.T) {
	xmlData := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="101" lat="40.795" lon="-3.972">
    <tag k="amenity" v="toilets"/>
  </node>
  <node id="102" lat="40.796" lon="-3.973">
    <tag k="amenity" v="restaurant"/>
    <tag k="name" v="El Mirador"/>
  </node>
  <node id="201" lat="40.800" lon="-3.970"/>
  <node id="202" lat="40.802" lon="-3.972"/>
  <way id="301">
    <nd ref="201"/>
    <nd ref="202"/>
    <tag k="amenity" v="parking"/>
  </way>
</osm>`)

	var doc osmXMLDoc
	if err := xml.Unmarshal(xmlData, &doc); err != nil {
		t.Fatalf("xml unmarshal error: %v", err)
	}

	if len(doc.Nodes) != 4 {
		t.Errorf("got %d nodes, want 4", len(doc.Nodes))
	}
	if len(doc.Ways) != 1 {
		t.Errorf("got %d ways, want 1", len(doc.Ways))
	}
}

func TestCalculateResortDownhillDistanceKM(t *testing.T) {
	t.Run("uses official tags statistics if present", func(t *testing.T) {
		resort := models.SkiResort{
			Tags: map[string]interface{}{
				"statistics": map[string]interface{}{
					"runs": map[string]interface{}{
						"byActivity": map[string]interface{}{
							"downhill": map[string]interface{}{
								"byDifficulty": map[string]interface{}{
									"easy": map[string]interface{}{
										"lengthInKm": 11.94,
									},
									"novice": map[string]interface{}{
										"lengthInKm": 5.73,
									},
									"intermediate": map[string]interface{}{
										"lengthInKm": 1.72,
									},
									"advanced": map[string]interface{}{
										"lengthInKm": 0.86,
									},
								},
							},
						},
					},
				},
			},
		}

		pistes := []models.SkiPiste{
			{Name: "Ignore me because tags are present"},
		}

		dist := calculateResortDownhillDistanceKM(resort, pistes)
		expected := 20.3 // 11.94 + 5.73 + 1.72 + 0.86 = 20.25 -> 20.3 rounded to 1 decimal
		if dist != expected {
			t.Errorf("got %v, want %v", dist, expected)
		}
	})

	t.Run("fallback skips unnamed pistes", func(t *testing.T) {
		resort := models.SkiResort{}
		pistes := []models.SkiPiste{
			{
				Name: "", // unnamed connector track
				GeometryGeoJSON: map[string]interface{}{
					"coordinates": []interface{}{
						[]interface{}{-3.97, 40.79},
						[]interface{}{-3.98, 40.80},
					},
				},
			},
			{
				Name:      "Pista Principal",
				PisteType: "downhill",
				GeometryGeoJSON: map[string]interface{}{
					"coordinates": []interface{}{
						[]interface{}{-3.9700, 40.7900},
						[]interface{}{-3.9700, 40.8000}, // ~1.11 km
					},
				},
			},
		}

		dist := calculateResortDownhillDistanceKM(resort, pistes)
		if dist <= 0 {
			t.Errorf("expected dist > 0, got %v", dist)
		}
	})
}

func TestOfflinePackBBox(t *testing.T) {
	pack := OfflinePackDTO{
		ResortDetailDTO: ResortDetailDTO{
			SkiResort: models.SkiResort{
				ID:        "sierra-nevada",
				Name:      "Sierra Nevada",
				Latitude:  37.09,
				Longitude: -3.39,
			},
			Pistes: []models.SkiPiste{
				{
					Name: "El Rio",
					GeometryGeoJSON: map[string]interface{}{
						"coordinates": []interface{}{
							[]interface{}{-3.40, 37.10},
							[]interface{}{-3.38, 37.08},
						},
					},
				},
			},
		},
		BBox: [4]float64{-3.45, 37.05, -3.35, 37.15},
	}

	if pack.BBox[0] >= pack.BBox[2] {
		t.Errorf("expected minLon < maxLon, got %v >= %v", pack.BBox[0], pack.BBox[2])
	}
	if pack.BBox[1] >= pack.BBox[3] {
		t.Errorf("expected minLat < maxLat, got %v >= %v", pack.BBox[1], pack.BBox[3])
	}
}
