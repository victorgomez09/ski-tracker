package pg

import (
	"context"

	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type versionManifestStore struct {
	db *bun.DB
}

func (u *versionManifestStore) ListAll(ctx context.Context) ([]models.VersionManifest, error) {
	var manifests []models.VersionManifest
	err := u.db.NewSelect().
		Model(&manifests).
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return manifests, nil
}

func (u *versionManifestStore) GetLatestVersion(ctx context.Context, platform string) (*models.VersionManifest, error) {
	var versionManifest models.VersionManifest
	err := u.db.NewSelect().
		Model(&versionManifest).
		Where("platform = ?", platform).
		Where("is_active = ?", true).
		Order("created_at DESC").
		Limit(1).
		Scan(ctx)

	if err != nil {
		return nil, err
	}
	return &versionManifest, nil
}

func (u *versionManifestStore) Create(ctx context.Context, versionManifest *models.VersionManifest) (*models.VersionManifest, error) {
	_, err := u.db.NewInsert().Model(versionManifest).Exec(ctx)
	if err != nil {
		return nil, err
	}
	return versionManifest, nil
}
