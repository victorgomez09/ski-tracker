package service

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"strings"

	"github.com/rogpeppe/go-internal/semver"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type VersionCheckResponse struct {
	LatestVersion string   `json:"latest_version"`
	MinVersion    string   `json:"min_version"`
	Changelog     []string `json:"changelog"`
	ForceUpdate   bool     `json:"force_update"`
	OtaAvailable  bool     `json:"ota_available"`
	StoreURL      string   `json:"store_url"`
}

type VersionManifestService struct {
	store  store.Store
	logger *slog.Logger
}

func NewVersionManifestService(store store.Store, logger *slog.Logger) *VersionManifestService {
	return &VersionManifestService{
		store:  store,
		logger: logger,
	}
}

func (s *VersionManifestService) ListAll(ctx context.Context) ([]models.VersionManifest, error) {
	manifests, err := s.store.VersionManifest().ListAll(ctx)
	if err != nil {
		s.logger.Error("failed to list version manifests", "error", err)
		return nil, err
	}
	return manifests, nil
}

func (s *VersionManifestService) CheckVersion(ctx context.Context, clientVersion string, platform string, lang string) (*VersionCheckResponse, error) {
	if clientVersion == "" || (platform != "ios" && platform != "android") {
		s.logger.Error("invalid parameters", "error", "clientVersion and platform are required")
		return nil, errors.New("invalid parameters")
	}

	// Get the latest version manifest for the given platform
	latest, err := s.store.VersionManifest().GetLatestVersion(ctx, platform)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			s.logger.Error("no versions configured for this platform", "platform", platform)
			return nil, errors.New("no versions configured for this platform")
		}

		s.logger.Error("internal error querying versions", "error", err)
		return nil, errors.New("internal error querying versions")
	}

	// Normalize versions to ensure they start with "v" for semver comparison
	vClient := clientVersion
	if !strings.HasPrefix(vClient, "v") {
		vClient = "v" + vClient
	}

	vLatest := latest.Version
	if !strings.HasPrefix(vLatest, "v") {
		vLatest = "v" + vLatest
	}

	vMin := latest.MinVersion
	if !strings.HasPrefix(vMin, "v") {
		vMin = "v" + vMin
	}

	// Compare versions using semver
	// semver.Compare(a, b) returns: -1 if a < b, 0 if a == b, 1 if a > b
	isOutdated := semver.Compare(vClient, vLatest) < 0
	isBelowMin := semver.Compare(vClient, vMin) < 0

	// Determine business rules
	// It's a forced update if the version is below the minimum or if the force_update flag is active
	forceUpdate := isBelowMin || (isOutdated && latest.ForceUpdate)

	// OTA is only available if there is an update, it is NOT a forced update, and the DB allows it
	otaAvailable := isOutdated && !isBelowMin && latest.OtaAvailable

	changelog := latest.Changelog[lang]
	if changelog == nil {
		changelog = latest.Changelog["en"] // Default to English if the requested language is not available
	}

	// Build response
	response := VersionCheckResponse{
		LatestVersion: latest.Version,
		MinVersion:    latest.MinVersion,
		Changelog:     changelog,
		ForceUpdate:   forceUpdate,
		OtaAvailable:  otaAvailable,
		StoreURL:      latest.StoreURL,
	}

	return &response, nil
}

func (s *VersionManifestService) Create(ctx context.Context, versionManifest *models.VersionManifest) (*models.VersionManifest, error) {
	createdManifest, err := s.store.VersionManifest().Create(ctx, versionManifest)
	if err != nil {
		s.logger.Error("failed to create version manifest", "error", err)
		return nil, err
	}
	return createdManifest, nil
}
