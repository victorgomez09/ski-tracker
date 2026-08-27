package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/victorgomez09/ski-tracker/internal/apierr"
)

type NativeReleaseInfo struct {
	Platform       string              `json:"platform"`        // "android", "ios"
	Version        string              `json:"version"`         // "1.0.1"
	RuntimeVersion string              `json:"runtime_version"` // "1.0.0"
	BuildNumber    int                 `json:"build_number"`    // 2
	ForceUpdate    bool                `json:"force_update"`    // Always true for native upgrades
	Changelog      map[string][]string `json:"changelog"`
	Filename       string              `json:"filename"` // "ski-tracker-v1.0.1.apk"
	FileSize       int64               `json:"file_size"`
	MinIOPath      string              `json:"minio_path"`
	CreatedAt      time.Time           `json:"created_at"`
}

type CheckUpdateResponse struct {
	HasUpdate            bool                `json:"has_update"`
	ForceUpdate          bool                `json:"force_update"`
	IsNativeUpdate       bool                `json:"is_native_update"`
	CurrentVersion       string              `json:"current_version"`
	CurrentRuntime       string              `json:"current_runtime"`
	CurrentBuild         int                 `json:"current_build"`
	LatestVersion        string              `json:"latest_version"`
	LatestRuntimeVersion string              `json:"latest_runtime_version"`
	LatestBuildNumber    int                 `json:"latest_build_number"`
	DownloadURL          string              `json:"download_url"`
	Changelog            map[string][]string `json:"changelog"`
	FileSize             int64               `json:"file_size"`
	ReleasedAt           time.Time           `json:"released_at"`
}

type PublishReleaseInput struct {
	FilePath       string
	Platform       string
	Version        string
	RuntimeVersion string
	BuildNumber    int
	ForceUpdate    bool
	Changelog      map[string][]string
	Filename       string
}

type AppReleaseService struct {
	minioClient *minio.Client
	bucketName  string
	publicURL   string
	logger      *slog.Logger
}

func NewAppReleaseService(minioClient *minio.Client, bucketName, publicURL string, logger *slog.Logger) *AppReleaseService {
	sanitizedBucket := strings.TrimSpace(bucketName)
	if sanitizedBucket == "" || strings.Contains(sanitizedBucket, "/") || strings.Contains(sanitizedBucket, "\\") || strings.HasPrefix(sanitizedBucket, ".") {
		sanitizedBucket = "ski-tracker-ota"
	}
	return &AppReleaseService{
		minioClient: minioClient,
		bucketName:  sanitizedBucket,
		publicURL:   publicURL,
		logger:      logger,
	}
}

func (s *AppReleaseService) ensureBucket(ctx context.Context) error {
	exists, err := s.minioClient.BucketExists(ctx, s.bucketName)
	if err != nil {
		return fmt.Errorf("check bucket exists: %w", err)
	}
	if !exists {
		err = s.minioClient.MakeBucket(ctx, s.bucketName, minio.MakeBucketOptions{})
		if err != nil {
			return fmt.Errorf("create bucket: %w", err)
		}
	}
	return nil
}

func (s *AppReleaseService) PublishRelease(ctx context.Context, input PublishReleaseInput) (*NativeReleaseInfo, error) {
	if err := s.ensureBucket(ctx); err != nil {
		return nil, err
	}

	platform := strings.ToLower(strings.TrimSpace(input.Platform))
	if platform == "" {
		platform = "android"
	}

	file, err := os.Open(input.FilePath)
	if err != nil {
		return nil, fmt.Errorf("open release file: %w", err)
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("stat release file: %w", err)
	}

	timestamp := time.Now().UTC().Format("20060102150405")
	filename := input.Filename
	if filename == "" {
		filename = fmt.Sprintf("ski-tracker-%s-v%s.apk", platform, input.Version)
	}

	objectKey := fmt.Sprintf("native-releases/%s/%s-%s/%s", platform, timestamp, input.Version, filename)
	contentType := "application/vnd.android.package-archive"
	if platform == "ios" {
		contentType = "application/octet-stream"
	}

	_, err = s.minioClient.PutObject(ctx, s.bucketName, objectKey, file, stat.Size(), minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return nil, fmt.Errorf("upload release artifact to minio: %w", err)
	}

	// Native updates are mandatory by default unless explicitly set to false
	forceUpdate := true
	if !input.ForceUpdate && input.ForceUpdate {
		forceUpdate = false
	}

	releaseInfo := NativeReleaseInfo{
		Platform:       platform,
		Version:        input.Version,
		RuntimeVersion: input.RuntimeVersion,
		BuildNumber:    input.BuildNumber,
		ForceUpdate:    forceUpdate,
		Changelog:      input.Changelog,
		Filename:       filename,
		FileSize:       stat.Size(),
		MinIOPath:      objectKey,
		CreatedAt:      time.Now().UTC(),
	}

	infoBytes, err := json.MarshalIndent(releaseInfo, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal release info: %w", err)
	}

	// 1. Save specific version release.json
	versionInfoKey := fmt.Sprintf("native-releases/%s/%s-%s/release.json", platform, timestamp, input.Version)
	_, err = s.minioClient.PutObject(ctx, s.bucketName, versionInfoKey, bytes.NewReader(infoBytes), int64(len(infoBytes)), minio.PutObjectOptions{
		ContentType: "application/json",
	})
	if err != nil {
		return nil, fmt.Errorf("upload release info: %w", err)
	}

	// 2. Update latest.json for this platform
	latestKey := fmt.Sprintf("native-releases/%s/latest.json", platform)
	_, err = s.minioClient.PutObject(ctx, s.bucketName, latestKey, bytes.NewReader(infoBytes), int64(len(infoBytes)), minio.PutObjectOptions{
		ContentType: "application/json",
	})
	if err != nil {
		return nil, fmt.Errorf("upload latest release pointer: %w", err)
	}

	s.logger.Info("Native app release published successfully",
		slog.String("platform", platform),
		slog.String("version", input.Version),
		slog.String("runtime_version", input.RuntimeVersion),
		slog.Int("build_number", input.BuildNumber),
	)

	return &releaseInfo, nil
}

func (s *AppReleaseService) GetLatestRelease(ctx context.Context, platform string) (*NativeReleaseInfo, error) {
	platform = strings.ToLower(strings.TrimSpace(platform))
	if platform == "" {
		platform = "android"
	}

	latestKey := fmt.Sprintf("native-releases/%s/latest.json", platform)
	obj, err := s.minioClient.GetObject(ctx, s.bucketName, latestKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()

	data, err := io.ReadAll(obj)
	if err != nil || len(data) == 0 {
		return nil, apierr.ErrNotFound.WithDetail("no native release found for platform: " + platform)
	}

	var info NativeReleaseInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, fmt.Errorf("unmarshal release info: %w", err)
	}

	return &info, nil
}

func (s *AppReleaseService) CheckUpdate(ctx context.Context, platform, currentVersion, currentRuntime string, currentBuild int, baseURL string) (*CheckUpdateResponse, error) {
	latest, err := s.GetLatestRelease(ctx, platform)
	if err != nil {
		return nil, err
	}

	hasUpdate := false

	// Check if runtimeVersion increased (mandatory native update)
	if latest.RuntimeVersion != "" && currentRuntime != "" {
		if compareSemVer(latest.RuntimeVersion, currentRuntime) > 0 {
			hasUpdate = true
		}
	}

	// Check build number or app version
	if !hasUpdate {
		if latest.BuildNumber > 0 && currentBuild > 0 {
			hasUpdate = latest.BuildNumber > currentBuild
		} else if currentVersion != "" && latest.Version != "" {
			hasUpdate = compareSemVer(latest.Version, currentVersion) > 0
		}
	}

	// Native updates (and runtimeVersion bumps) are always mandatory
	forceUpdate := false
	if hasUpdate {
		forceUpdate = true
	}

	downloadURL := fmt.Sprintf("%s/api/v1/app/download/%s/latest", strings.TrimRight(baseURL, "/"), latest.Platform)

	return &CheckUpdateResponse{
		HasUpdate:            hasUpdate,
		ForceUpdate:          forceUpdate,
		IsNativeUpdate:       hasUpdate,
		CurrentVersion:       currentVersion,
		CurrentRuntime:       currentRuntime,
		CurrentBuild:         currentBuild,
		LatestVersion:        latest.Version,
		LatestRuntimeVersion: latest.RuntimeVersion,
		LatestBuildNumber:    latest.BuildNumber,
		DownloadURL:          downloadURL,
		Changelog:            latest.Changelog,
		FileSize:             latest.FileSize,
		ReleasedAt:           latest.CreatedAt,
	}, nil
}

func (s *AppReleaseService) GetLatestArtifactReader(ctx context.Context, platform string) (*minio.Object, string, int64, string, error) {
	latest, err := s.GetLatestRelease(ctx, platform)
	if err != nil {
		return nil, "", 0, "", err
	}

	obj, err := s.minioClient.GetObject(ctx, s.bucketName, latest.MinIOPath, minio.GetObjectOptions{})
	if err != nil {
		return nil, "", 0, "", fmt.Errorf("open artifact from minio: %w", err)
	}

	stat, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, "", 0, "", fmt.Errorf("stat artifact from minio: %w", err)
	}

	contentType := "application/vnd.android.package-archive"
	if latest.Platform == "ios" {
		contentType = "application/octet-stream"
	}

	return obj, latest.Filename, stat.Size, contentType, nil
}

func compareSemVer(v1, v2 string) int {
	clean1 := strings.TrimPrefix(strings.TrimSpace(v1), "v")
	clean2 := strings.TrimPrefix(strings.TrimSpace(v2), "v")

	parts1 := strings.Split(clean1, ".")
	parts2 := strings.Split(clean2, ".")

	maxLen := len(parts1)
	if len(parts2) > maxLen {
		maxLen = len(parts2)
	}

	for i := 0; i < maxLen; i++ {
		var n1, n2 int
		if i < len(parts1) {
			n1, _ = strconv.Atoi(parts1[i])
		}
		if i < len(parts2) {
			n2, _ = strconv.Atoi(parts2[i])
		}
		if n1 > n2 {
			return 1
		}
		if n1 < n2 {
			return -1
		}
	}
	return 0
}
