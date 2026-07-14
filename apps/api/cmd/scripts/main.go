package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/http"
	"os"
	"strconv"

	"github.com/bytedance/gopkg/util/logger"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
	"github.com/victorgomez09/ski-tracker/internal/config"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store/pg"
	"github.com/victorgomez09/ski-tracker/migrations"
)

type GeoJSONFeatureCollection struct {
	Type     string           `json:"type"`
	Features []GeoJSONFeature `json:"features"`
}

type GeoJSONFeature struct {
	Type       string                 `json:"type"`
	ID         interface{}            `json:"id"` // Puede venir como string o int
	Geometry   map[string]interface{} `json:"geometry"`
	Properties map[string]interface{} `json:"properties"`
}

func main() {
	ctx := context.Background()

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", slog.Any("error", err))
		os.Exit(1)
	}

	store, err := pg.New(cfg.Database.URL, pg.PoolConfig{
		MaxOpenConns:    cfg.Database.MaxOpenConns,
		MaxIdleConns:    cfg.Database.MaxIdleConns,
		ConnMaxLifetime: cfg.Database.ConnMaxLifetime,
	})
	if err != nil {
		logger.Error("failed to connect to database", slog.Any("error", err))
		os.Exit(1)
	}
	defer func() { _ = store.Close() }()
	logger.Info("connected to database")

	// Auto-migrate database
	logger.Info("running database migrations...")

	// Acquire advisory lock to prevent concurrent migrations
	if _, err := store.DB().ExecContext(ctx, "SELECT pg_advisory_lock(1)"); err != nil {
		logger.Error("failed to acquire migration lock", slog.Any("error", err))
		os.Exit(1)
	}

	migrator := migrate.NewMigrator(store.DB(), migrations.Migrations)
	if err := migrator.Init(ctx); err != nil {
		logger.Error("failed to init migrations", slog.Any("error", err))
		store.DB().ExecContext(ctx, "SELECT pg_advisory_unlock(1)")
		os.Exit(1)
	}
	group, err := migrator.Migrate(ctx)
	if err != nil {
		logger.Error("failed to run migrations", slog.Any("error", err))
		store.DB().ExecContext(ctx, "SELECT pg_advisory_unlock(1)")
		os.Exit(1)
	}
	// Release migration lock after successful migration
	store.DB().ExecContext(ctx, "SELECT pg_advisory_unlock(1)")

	if group.IsZero() {
		logger.Info("no new migrations to run")
	} else {
		logger.Info("migrations applied", slog.String("group", group.String()))
	}

	// 2. DESCARGAR DATOS GLOBALES
	// Nota: OpenSkiData ofrece volcados globales ya masticados.
	// Usaremos las URLs de sus capas GeoJSON globales de producción.
	pistesURL := "https://tiles.openskimap.org/geojson/runs.geojson"
	liftsURL := "https://tiles.openskimap.org/geojson/lifts.geojson"
	resortsURL := "https://tiles.openskimap.org/geojson/ski_areas.geojson"

	// Procesar Estaciones (Resorts)
	resorts := downloadAndParseResorts(resortsURL)
	fmt.Printf("Descargadas %d estaciones de esquí.\n", len(resorts))
	saveResorts(ctx, store.DB(), resorts)

	// Procesar Pistas
	pistes := downloadAndParsePistes(pistesURL)
	savePistes(ctx, store.DB(), pistes)

	// Procesar Remontes
	lifts := downloadAndParseLifts(liftsURL)
	saveLifts(ctx, store.DB(), lifts)

	fmt.Println("Sincronización mundial completada con éxito.")
}

// --- PROCESADORES Y DESCARGADORES ---
func downloadAndParseResorts(url string) []models.SkiResort {
	resp, err := http.Get(url)
	if err != nil {
		log.Fatalf("Error descargando estaciones: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var fc GeoJSONFeatureCollection
	json.Unmarshal(body, &fc)

	var resorts []models.SkiResort
	for _, f := range fc.Features {
		id, _ := f.Properties["id"].(string)
		if id == "" {
			if idFloat, ok := f.Properties["id"].(float64); ok {
				id = fmt.Sprintf("%.0f", idFloat)
			} else {
				continue
			}
		}

		name, _ := f.Properties["name"].(string)
		if name == "" {
			name = "No name"
		}

		var lat, lon float64
		if geomType, ok := f.Geometry["type"].(string); ok {
			switch geomType {
			case "Point":
				if coords, ok := f.Geometry["coordinates"].([]interface{}); ok && len(coords) == 2 {
					lon, _ = coords[0].(float64)
					lat, _ = coords[1].(float64)
				}
			case "Polygon":
				if rings, ok := f.Geometry["coordinates"].([]interface{}); ok && len(rings) > 0 {
					if ring, ok := rings[0].([]interface{}); ok && len(ring) > 0 {
						if coords, ok := ring[0].([]interface{}); ok && len(coords) == 2 {
							lon, _ = coords[0].(float64)
							lat, _ = coords[1].(float64)
						}
					}
				}
			case "MultiPolygon":
				if polys, ok := f.Geometry["coordinates"].([]interface{}); ok && len(polys) > 0 {
					if rings, ok := polys[0].([]interface{}); ok && len(rings) > 0 {
						if ring, ok := rings[0].([]interface{}); ok && len(ring) > 0 {
							if coords, ok := ring[0].([]interface{}); ok && len(coords) == 2 {
								lon, _ = coords[0].(float64)
								lat, _ = coords[1].(float64)
							}
						}
					}
				}
			}
		}

		if lat == 0 && lon == 0 {
			if viewport, ok := f.Properties["viewportHint"].(map[string]interface{}); ok {
				if center, ok := viewport["center"].([]interface{}); ok && len(center) == 2 {
					lon, _ = center[0].(float64)
					lat, _ = center[1].(float64)
				}
			}
		}

		country := "Unknown"
		if places, ok := f.Properties["places"].([]interface{}); ok && len(places) > 0 {
			if firstPlace, ok := places[0].(map[string]interface{}); ok {
				if countryCode, ok := firstPlace["iso3166_1Alpha2"].(string); ok && countryCode != "" {
					country = countryCode
				}

				if localized, ok := firstPlace["localized"].(map[string]interface{}); ok {
					if en, ok := localized["en"].(map[string]interface{}); ok {
						if countryName, ok := en["country"].(string); ok && countryName != "" {
							country = countryName
						}
					}
				}

			}
		}

		website := ""
		if websites, ok := f.Properties["websites"].([]interface{}); ok && len(websites) > 0 {
			if firstWeb, ok := websites[0].(string); ok {
				website = firstWeb
			}
		}

		resorts = append(resorts, models.SkiResort{
			ID:        id,
			Name:      name,
			Country:   country,
			Latitude:  lat,
			Longitude: lon,
			Website:   website,
			Tags:      f.Properties,
		})
	}
	return resorts
}

func downloadAndParsePistes(url string) []models.SkiPiste {
	resp, err := http.Get(url)
	if err != nil {
		log.Fatalf("Error descargando pistas: %v", err)
	}
	defer resp.Body.Close()
	fmt.Println("Descargando pistas")

	body, _ := io.ReadAll(resp.Body)
	var fc GeoJSONFeatureCollection
	json.Unmarshal(body, &fc)

	var pistes []models.SkiPiste
	for _, f := range fc.Features {
		id, _ := f.Properties["id"].(string)
		if id == "" {
			if idFloat, ok := f.Properties["id"].(float64); ok {
				id = fmt.Sprintf("%.0f", idFloat)
			} else {
				continue
			}
		}

		name, _ := f.Properties["name"].(string)

		pType, _ := f.Properties["type"].(string)
		if pType == "" {
			pType, _ = f.Properties["piste:type"].(string)
		}

		if pType == "run" {
			if uses, ok := f.Properties["uses"].([]interface{}); ok && len(uses) > 0 {
				if firstUse, ok := uses[0].(string); ok {
					pType = firstUse
				}
			}
		}

		difficulty, _ := f.Properties["difficulty"].(string)
		if difficulty == "" {
			difficulty, _ = f.Properties["piste:difficulty"].(string)
		}

		var lit bool
		if litVal := f.Properties["lit"]; litVal != nil {
			if litBool, ok := litVal.(bool); ok {
				lit = litBool
			} else if litStr, ok := litVal.(string); ok {
				lit = (litStr == "yes" || litStr == "true")
			}
		} else if pisteLitVal := f.Properties["piste:lit"]; pisteLitVal != nil {
			if litBool, ok := pisteLitVal.(bool); ok {
				lit = litBool
			} else if litStr, ok := pisteLitVal.(string); ok {
				lit = (litStr == "yes" || litStr == "true")
			}
		}

		var resortID *string
		if skiAreas, ok := f.Properties["skiAreas"].([]interface{}); ok && len(skiAreas) > 0 {
			if firstArea, ok := skiAreas[0].(map[string]interface{}); ok {
				if properties, ok := firstArea["properties"].(map[string]interface{}); ok {
					if skiAreaID, ok := properties["id"].(string); ok && skiAreaID != "" {
						resortID = &skiAreaID
					}
				}
			}
		}

		pistes = append(pistes, models.SkiPiste{
			ID:              id,
			ResortID:        resortID,
			Name:            name,
			PisteType:       pType,
			Difficulty:      difficulty,
			Lit:             lit,
			GeometryGeoJSON: f.Geometry,
			Tags:            f.Properties,
		})
	}

	fmt.Println("Pistas guardadas en memoria, listas para guardar en la base de datos.")
	return pistes
}

func downloadAndParseLifts(url string) []models.SkiLift {
	resp, err := http.Get(url)
	if err != nil {
		log.Fatalf("Error descargando remontes: %v", err)
	}
	defer resp.Body.Close()
	fmt.Println("Descargando remontes")

	body, _ := io.ReadAll(resp.Body)
	var fc GeoJSONFeatureCollection
	json.Unmarshal(body, &fc)

	var lifts []models.SkiLift
	for _, f := range fc.Features {
		id, _ := f.Properties["id"].(string)
		if id == "" {
			if idFloat, ok := f.Properties["id"].(float64); ok {
				id = fmt.Sprintf("%.0f", idFloat)
			} else {
				continue
			}
		}

		name, _ := f.Properties["name"].(string)

		lType, _ := f.Properties["liftType"].(string)
		if lType == "" {
			lType, _ = f.Properties["type"].(string)
		}
		if lType == "" {
			lType, _ = f.Properties["aerialway"].(string)
		}

		capacity := 1
		if capVal := f.Properties["capacity"]; capVal != nil {
			if capFloat, ok := capVal.(float64); ok {
				capacity = int(capFloat)
			} else if capStr, ok := capVal.(string); ok {
				if parsedCap, err := strconv.Atoi(capStr); err == nil {
					capacity = parsedCap
				}
			}
		}

		occupancy := 1
		if occVal := f.Properties["occupancy"]; occVal != nil {
			if occFloat, ok := occVal.(float64); ok {
				occupancy = int(occFloat)
			} else if occStr, ok := occVal.(string); ok {
				if parsedOcc, err := strconv.Atoi(occStr); err == nil {
					occupancy = parsedOcc
				}
			}
		}

		var resortID *string
		if skiAreas, ok := f.Properties["skiAreas"].([]interface{}); ok && len(skiAreas) > 0 {
			if firstArea, ok := skiAreas[0].(map[string]interface{}); ok {
				if properties, ok := firstArea["properties"].(map[string]interface{}); ok {
					if skiAreaID, ok := properties["id"].(string); ok && skiAreaID != "" {
						resortID = &skiAreaID
					}
				}
			}
		}

		if resortID == nil {
			if saID, ok := f.Properties["ski_area_id"].(string); ok && saID != "" {
				resortID = &saID
			} else if saFloat, ok := f.Properties["ski_area_id"].(float64); ok {
				strID := fmt.Sprintf("%.0f", saFloat)
				resortID = &strID
			}
		}

		lifts = append(lifts, models.SkiLift{
			ID:              id,
			ResortID:        resortID,
			Name:            name,
			LiftType:        lType,
			Capacity:        occupancy,
			CapacityHourly:  capacity,
			GeometryGeoJSON: f.Geometry,
			Tags:            f.Properties,
		})
	}

	fmt.Println("Remontes guardados en memoria, listos para guardar en la base de datos.")
	return lifts
}

// --- OPERACIONES DE BASE DE DATOS (UPSERTS CON BUN) ---
func saveResorts(ctx context.Context, db *bun.DB, resorts []models.SkiResort) {
	if len(resorts) == 0 {
		fmt.Println("No hay estaciones de esquí para guardar.")
		return
	}
	fmt.Printf("Guardando/Actualizando %d estaciones de esquí...\n", len(resorts))

	// Bun permite hacer Upsert masivo de forma nativa e increíblemente limpia
	_, err := db.NewInsert().
		Model(&resorts).
		On("CONFLICT (id) DO UPDATE").
		Set("name = EXCLUDED.name").
		Set("country = EXCLUDED.country").
		Set("website = EXCLUDED.website").
		Set("latitude = EXCLUDED.latitude").
		Set("longitude = EXCLUDED.longitude").
		Set("tags = EXCLUDED.tags").
		Exec(ctx)

	if err != nil {
		log.Printf("Error al guardar resorts en la BD: %v", err)
	}

	fmt.Println("Estaciones de esquí guardadas/actualizadas con éxito.")
}

func savePistes(ctx context.Context, db *bun.DB, pistes []models.SkiPiste) {
	if len(pistes) == 0 {
		return
	}
	fmt.Printf("Guardando/Actualizando %d pistas...\n", len(pistes))

	// Procesamos en lotes de 1000 elementos para evitar colapsar la memoria de Postgres en el Upsert
	batchSize := 1000
	for i := 0; i < len(pistes); i += batchSize {
		end := i + batchSize
		if end > len(pistes) {
			end = len(pistes)
		}
		batch := pistes[i:end]

		_, err := db.NewInsert().
			Model(&batch).
			On("CONFLICT (id) DO UPDATE").
			Set("resort_id = EXCLUDED.resort_id").
			Set("name = EXCLUDED.name").
			Set("piste_type = EXCLUDED.piste_type").
			Set("difficulty = EXCLUDED.difficulty").
			Set("lit = EXCLUDED.lit").
			Set("geometry_geojson = EXCLUDED.geometry_geojson").
			Set("tags = EXCLUDED.tags").
			Exec(ctx)

		if err != nil {
			log.Fatalf("Error al guardar lote de pistas en la BD: %v", err)
		}
	}
}

func saveLifts(ctx context.Context, db *bun.DB, lifts []models.SkiLift) {
	if len(lifts) == 0 {
		return
	}
	fmt.Printf("Guardando/Actualizando %d remontes...\n", len(lifts))

	batchSize := 1000
	for i := 0; i < len(lifts); i += batchSize {
		end := i + batchSize
		if end > len(lifts) {
			end = len(lifts)
		}
		batch := lifts[i:end]

		_, err := db.NewInsert().
			Model(&batch).
			On("CONFLICT (id) DO UPDATE").
			Set("resort_id = EXCLUDED.resort_id").
			Set("name = EXCLUDED.name").
			Set("lift_type = EXCLUDED.lift_type").
			Set("capacity = EXCLUDED.capacity").
			Set("geometry_geojson = EXCLUDED.geometry_geojson").
			Set("tags = EXCLUDED.tags").
			Exec(ctx)

		if err != nil {
			log.Fatalf("Error al guardar lote de remontes en la BD: %v", err)
		}
	}
}
