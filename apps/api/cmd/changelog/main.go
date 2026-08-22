package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"github.com/uptrace/bun/driver/pgdriver"

	"github.com/victorgomez09/ski-tracker/internal/models"
)

// DTO para parsear los JSONs de la carpeta
type VersionJSON struct {
	Platform     string              `json:"platform"`
	Version      string              `json:"version"`
	BuildNumber  int                 `json:"build_number"`
	MinVersion   string              `json:"min_version"`
	Changelog    map[string][]string `json:"changelog"`
	ForceUpdate  bool                `json:"force_update"`
	OtaAvailable bool                `json:"ota_available"`
	StoreURL     string              `json:"store_url"`
	IsActive     *bool               `json:"is_active"` // Puntero para detectar si viene omiso
}

func main() {
	// Console flags
	dirPath := flag.String("dir", "./changelogs", "Path to the changelogs directory")
	dbURL := flag.String("db", os.Getenv("DATABASE_URL"), "Database connection string DSN")
	flag.Parse()

	if *dbURL == "" {
		log.Fatal(" Error: DATABASE connection string is required (-db or env DATABASE_URL)")
	}

	// 1. Initialize Bun ORM connection (PostgreSQL)
	sqldb := sql.OpenDB(pgdriver.NewConnector(pgdriver.WithDSN(*dbURL)))
	db := bun.NewDB(sqldb, pgdialect.New())
	defer db.Close()

	ctx := context.Background()

	// 2. Read all JSON files in the specified directory
	files, err := filepath.Glob(filepath.Join(*dirPath, "*.json"))
	if err != nil {
		log.Fatalf(" Error searching for JSON files in %s: %v", *dirPath, err)
	}

	if len(files) == 0 {
		fmt.Printf(" No JSON files found in '%s'\n", *dirPath)
		return
	}

	fmt.Printf("🔍 Processing %d changelog files...\n\n", len(files))

	insertedCount := 0
	skippedCount := 0

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			log.Printf("⚠️ Error reading %s: %v", file, err)
			continue
		}

		var vData VersionJSON
		if err := json.Unmarshal(content, &vData); err != nil {
			log.Printf("⚠️ Error parsing JSON in %s: %v", file, err)
			continue
		}

		if vData.Platform == "" || vData.Version == "" || vData.MinVersion == "" {
			log.Printf("⚠️ Skipping %s: Missing required fields (platform, version, min_version)", file)
			continue
		}

		isActive := true
		if vData.IsActive != nil {
			isActive = *vData.IsActive
		}

		// 3.Check if the version already exists in the database
		exists, err := db.NewSelect().
			Model((*models.VersionManifest)(nil)).
			Where("platform = ?", vData.Platform).
			Where("version = ?", vData.Version).
			Exists(ctx)

		if err != nil {
			log.Printf("Error querying DB for %s (%s): %v", vData.Version, vData.Platform, err)
			continue
		}

		if exists {
			fmt.Printf("⏭️  Skipped: %s v%s (%s) already exists in the DB.\n", vData.Platform, vData.Version, filepath.Base(file))
			skippedCount++
			continue
		}

		// 4. Insert into DB
		newRecord := &models.VersionManifest{
			Platform:     vData.Platform,
			Version:      vData.Version,
			BuildNumber:  vData.BuildNumber,
			MinVersion:   vData.MinVersion,
			Changelog:    vData.Changelog,
			ForceUpdate:  vData.ForceUpdate,
			OtaAvailable: vData.OtaAvailable,
			StoreURL:     vData.StoreURL,
			IsActive:     isActive,
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}

		_, err = db.NewInsert().Model(newRecord).Exec(ctx)
		if err != nil {
			log.Printf(" Error inserting %s (%s): %v", vData.Version, vData.Platform, err)
			continue
		}

		fmt.Printf(" Inserted: %s v%s from %s\n", vData.Platform, vData.Version, filepath.Base(file))
		insertedCount++
	}

	fmt.Printf("\n Summary: %d inserted, %d skipped.\n", insertedCount, skippedCount)
}
