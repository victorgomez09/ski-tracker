package service

import (
	"archive/zip"
	"bytes"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/victorgomez09/ski-tracker/internal/apierr"
)

type OTAInfo struct {
	ForceUpdate bool                `json:"forceUpdate"`
	Version     string              `json:"version"`
	Changelog   map[string][]string `json:"changelog"`
}

type expoExportMetadata struct {
	FileMetadata map[string]expoPlatformMetadata `json:"fileMetadata"`
}

type expoPlatformMetadata struct {
	Bundle string          `json:"bundle"`
	Assets []expoAssetMeta `json:"assets"`
}

type expoAssetMeta struct {
	Path string `json:"path"`
	Ext  string `json:"ext"`
}

type expoAsset struct {
	Hash          string `json:"hash"`
	Key           string `json:"key"`
	ContentType   string `json:"contentType"`
	FileExtension string `json:"fileExtension,omitempty"`
	URL           string `json:"url"`
}

type expoManifest struct {
	ID             string         `json:"id"`
	CreatedAt      string         `json:"createdAt"`
	RuntimeVersion string         `json:"runtimeVersion"`
	LaunchAsset    expoAsset      `json:"launchAsset"`
	Assets         []expoAsset    `json:"assets"`
	Metadata       map[string]any `json:"metadata"`
	Extra          map[string]any `json:"extra"`
}

type expoDirective struct {
	Type       string         `json:"type"`
	Parameters map[string]any `json:"parameters,omitempty"`
}

type OTAService struct {
	updatesDir string
	publicURL  string
	logger     *slog.Logger
}

func NewOTAService(updatesDir, publicURL string, logger *slog.Logger) *OTAService {
	_ = os.MkdirAll(updatesDir, 0o755)
	return &OTAService{
		updatesDir: updatesDir,
		publicURL:  publicURL,
		logger:     logger,
	}
}

type ManifestRequest struct {
	ProtocolVersion int
	Platform        string
	RuntimeVersion  string
	CurrentUpdateID string
	EmbeddedID      string
	Accept          string
	BaseURL         string
}

func (s *OTAService) WriteManifestResponse(w http.ResponseWriter, req ManifestRequest) error {
	if req.Platform != "ios" && req.Platform != "android" {
		return apierr.ErrBadRequest.WithDetail("Unsupported platform. Expected ios or android.")
	}
	if req.RuntimeVersion == "" {
		return apierr.ErrBadRequest.WithDetail("No runtimeVersion provided.")
	}

	bundlePath, err := s.latestBundlePath(req.RuntimeVersion)
	if err != nil {
		return err
	}

	if isRollback(bundlePath) {
		if req.ProtocolVersion < 1 {
			return apierr.ErrNotAcceptable.WithDetail("Rollbacks require protocol version 1.")
		}
		if req.CurrentUpdateID != "" && req.CurrentUpdateID == req.EmbeddedID {
			return s.writeDirective(w, expoDirective{Type: "noUpdateAvailable"}, req.ProtocolVersion)
		}
		stat, err := os.Stat(filepath.Join(bundlePath, "rollback"))
		if err != nil {
			return err
		}
		return s.writeDirective(w, expoDirective{
			Type: "rollBackToEmbedded",
			Parameters: map[string]any{
				"commitTime": stat.ModTime().UTC().Format(time.RFC3339Nano),
			},
		}, req.ProtocolVersion)
	}

	manifest, createdAt, updateID, err := s.buildManifest(bundlePath, req)
	if err != nil {
		return err
	}

	if req.ProtocolVersion >= 1 && req.CurrentUpdateID != "" && req.CurrentUpdateID == updateID {
		return s.writeDirective(w, expoDirective{Type: "noUpdateAvailable"}, req.ProtocolVersion)
	}

	if !acceptsMultipart(req.Accept) && !acceptsJSON(req.Accept) {
		return apierr.ErrNotAcceptable.WithDetail("Client must accept application/expo+json, application/json, or multipart/mixed.")
	}

	manifestJSON, err := json.Marshal(manifest)
	if err != nil {
		return err
	}

	if acceptsMultipart(req.Accept) || req.Accept == "" {
		return s.writeMultipart(w, req.ProtocolVersion, map[string][]byte{
			"manifest": manifestJSON,
		})
	}

	s.writeCommonHeaders(w, req.ProtocolVersion)
	w.Header().Set("Content-Type", "application/expo+json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(manifestJSON)
	_ = createdAt
	return nil
}

func (s *OTAService) ServeAsset(w http.ResponseWriter, runtimeVersion, platform, assetRel string) error {
	if platform != "ios" && platform != "android" {
		return apierr.ErrBadRequest.WithDetail("Unsupported platform. Expected ios or android.")
	}
	if runtimeVersion == "" || assetRel == "" {
		return apierr.ErrBadRequest.WithDetail("runtimeVersion and asset are required.")
	}

	bundlePath, err := s.latestBundlePath(runtimeVersion)
	if err != nil {
		return err
	}

	cleanRel := filepath.Clean(assetRel)
	if filepath.IsAbs(cleanRel) || strings.HasPrefix(cleanRel, "..") {
		return apierr.ErrBadRequest.WithDetail("Invalid asset path.")
	}

	fullPath := filepath.Join(bundlePath, cleanRel)
	if !strings.HasPrefix(fullPath, filepath.Clean(bundlePath)+string(os.PathSeparator)) && fullPath != filepath.Clean(bundlePath) {
		return apierr.ErrBadRequest.WithDetail("Invalid asset path.")
	}

	data, err := os.ReadFile(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return apierr.ErrNotFound.WithDetail("Asset does not exist.")
		}
		return err
	}

	contentType := assetContentType(cleanRel, false)
	metadata, err := readExportMetadata(bundlePath)
	if err == nil {
		platformMeta, ok := metadata.FileMetadata[platform]
		if ok && platformMeta.Bundle == cleanRel {
			contentType = "application/javascript"
		} else if ok {
			for _, asset := range platformMeta.Assets {
				if asset.Path == cleanRel {
					contentType = assetContentType("."+asset.Ext, false)
					break
				}
			}
		}
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
	return nil
}

type PublishOTAInput struct {
	ZipPath        string
	RuntimeVersion string
	ForceUpdate    bool
	Version        string
	Changelog      map[string][]string
}

func (s *OTAService) Publish(in PublishOTAInput) (string, error) {
	if in.RuntimeVersion == "" {
		return "", apierr.ErrBadRequest.WithDetail("runtime_version is required.")
	}

	dest := filepath.Join(s.updatesDir, sanitizeSegment(in.RuntimeVersion), strconv.FormatInt(time.Now().UnixMilli(), 10))
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return "", err
	}

	if err := unzipTo(in.ZipPath, dest); err != nil {
		_ = os.RemoveAll(dest)
		return "", err
	}

	if _, err := os.Stat(filepath.Join(dest, "metadata.json")); err != nil {
		_ = os.RemoveAll(dest)
		return "", apierr.ErrBadRequest.WithDetail("The zip must contain metadata.json from `expo export`.")
	}

	info := OTAInfo{
		ForceUpdate: in.ForceUpdate,
		Version:     in.Version,
		Changelog:   in.Changelog,
	}
	infoJSON, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		_ = os.RemoveAll(dest)
		return "", err
	}
	if err := os.WriteFile(filepath.Join(dest, "info.json"), infoJSON, 0o644); err != nil {
		_ = os.RemoveAll(dest)
		return "", err
	}

	s.logger.Info("published ota update", "path", dest, "runtimeVersion", in.RuntimeVersion, "forceUpdate", in.ForceUpdate)
	return dest, nil
}

func (s *OTAService) buildManifest(bundlePath string, req ManifestRequest) (*expoManifest, string, string, error) {
	metadataBytes, err := os.ReadFile(filepath.Join(bundlePath, "metadata.json"))
	if err != nil {
		return nil, "", "", apierr.ErrNotFound.WithDetail("Update metadata.json not found.")
	}

	var metadata expoExportMetadata
	if err := json.Unmarshal(metadataBytes, &metadata); err != nil {
		return nil, "", "", err
	}

	platformMeta, ok := metadata.FileMetadata[req.Platform]
	if !ok {
		return nil, "", "", apierr.ErrNotFound.WithDetail("No update for this platform.")
	}

	stat, err := os.Stat(filepath.Join(bundlePath, "metadata.json"))
	if err != nil {
		return nil, "", "", err
	}
	createdAt := stat.ModTime().UTC().Format(time.RFC3339Nano)
	updateID := hashToUUID(sha256Hex(metadataBytes))

	baseURL := strings.TrimRight(req.BaseURL, "/")
	if baseURL == "" {
		baseURL = strings.TrimRight(s.publicURL, "/")
	}

	launchAsset, err := s.assetDescriptor(bundlePath, platformMeta.Bundle, req, true, "")
	if err != nil {
		return nil, "", "", err
	}

	assets := make([]expoAsset, 0, len(platformMeta.Assets))
	for _, a := range platformMeta.Assets {
		desc, err := s.assetDescriptor(bundlePath, a.Path, req, false, a.Ext)
		if err != nil {
			return nil, "", "", err
		}
		assets = append(assets, desc)
	}

	info := readOTAInfo(bundlePath)
	var expoConfig any
	if raw, err := os.ReadFile(filepath.Join(bundlePath, "expoConfig.json")); err == nil {
		_ = json.Unmarshal(raw, &expoConfig)
	}

	manifest := &expoManifest{
		ID:             updateID,
		CreatedAt:      createdAt,
		RuntimeVersion: req.RuntimeVersion,
		LaunchAsset:    launchAsset,
		Assets:         assets,
		Metadata: map[string]any{
			"forceUpdate": strconv.FormatBool(info.ForceUpdate),
		},
		Extra: map[string]any{
			"expoClient":  expoConfig,
			"forceUpdate": info.ForceUpdate,
			"changelog":   info.Changelog,
			"version":     info.Version,
		},
	}

	return manifest, createdAt, updateID, nil
}

func (s *OTAService) assetDescriptor(bundlePath, relPath string, req ManifestRequest, isLaunch bool, ext string) (expoAsset, error) {
	data, err := os.ReadFile(filepath.Join(bundlePath, relPath))
	if err != nil {
		return expoAsset{}, fmt.Errorf("read asset %s: %w", relPath, err)
	}

	sum256 := sha256.Sum256(data)
	sumMD5 := md5.Sum(data)

	fileExt := ext
	if isLaunch {
		fileExt = "bundle"
	}

	baseURL := strings.TrimRight(req.BaseURL, "/")
	if baseURL == "" {
		baseURL = strings.TrimRight(s.publicURL, "/")
	}

	return expoAsset{
		Hash:          base64.RawURLEncoding.EncodeToString(sum256[:]),
		Key:           hex.EncodeToString(sumMD5[:]),
		ContentType:   assetContentType(fileExt, isLaunch),
		FileExtension: "." + strings.TrimPrefix(fileExt, "."),
		URL: fmt.Sprintf("%s/api/v1/ota/assets?asset=%s&runtimeVersion=%s&platform=%s",
			baseURL, url.QueryEscape(relPath), url.QueryEscape(req.RuntimeVersion), req.Platform),
	}, nil
}

func (s *OTAService) latestBundlePath(runtimeVersion string) (string, error) {
	dir := filepath.Join(s.updatesDir, sanitizeSegment(runtimeVersion))
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return "", apierr.ErrNotFound.WithDetail("Unsupported runtime version.")
		}
		return "", err
	}

	var dirs []string
	for _, e := range entries {
		if e.IsDir() {
			dirs = append(dirs, e.Name())
		}
	}
	if len(dirs) == 0 {
		return "", apierr.ErrNotFound.WithDetail("No updates published for this runtime version.")
	}
	sort.Slice(dirs, func(i, j int) bool {
		return dirs[i] > dirs[j]
	})
	return filepath.Join(dir, dirs[0]), nil
}

func (s *OTAService) writeDirective(w http.ResponseWriter, directive expoDirective, protocolVersion int) error {
	if protocolVersion < 1 {
		return apierr.ErrNotAcceptable.WithDetail("Directives require protocol version 1.")
	}
	body, err := json.Marshal(directive)
	if err != nil {
		return err
	}
	return s.writeMultipart(w, protocolVersion, map[string][]byte{
		"directive": body,
	})
}

func (s *OTAService) writeMultipart(w http.ResponseWriter, protocolVersion int, parts map[string][]byte) error {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	for name, payload := range parts {
		header := make(textproto.MIMEHeader)
		header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"`, name))
		header.Set("Content-Type", "application/json; charset=utf-8")
		part, err := writer.CreatePart(header)
		if err != nil {
			return err
		}
		if _, err := part.Write(payload); err != nil {
			return err
		}
	}
	if err := writer.Close(); err != nil {
		return err
	}

	s.writeCommonHeaders(w, protocolVersion)
	w.Header().Set("Content-Type", "multipart/mixed; boundary="+writer.Boundary())
	w.WriteHeader(http.StatusOK)
	_, err := w.Write(buf.Bytes())
	return err
}

func (s *OTAService) writeCommonHeaders(w http.ResponseWriter, protocolVersion int) {
	if protocolVersion < 1 {
		protocolVersion = 1
	}
	w.Header().Set("expo-protocol-version", strconv.Itoa(protocolVersion))
	w.Header().Set("expo-sfv-version", "0")
	w.Header().Set("Cache-Control", "private, max-age=0")
}

func isRollback(bundlePath string) bool {
	_, err := os.Stat(filepath.Join(bundlePath, "rollback"))
	return err == nil
}

func readExportMetadata(bundlePath string) (*expoExportMetadata, error) {
	raw, err := os.ReadFile(filepath.Join(bundlePath, "metadata.json"))
	if err != nil {
		return nil, err
	}
	var metadata expoExportMetadata
	if err := json.Unmarshal(raw, &metadata); err != nil {
		return nil, err
	}
	return &metadata, nil
}

func readOTAInfo(bundlePath string) OTAInfo {
	raw, err := os.ReadFile(filepath.Join(bundlePath, "info.json"))
	if err != nil {
		return OTAInfo{}
	}
	var info OTAInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		return OTAInfo{}
	}
	return info
}

func unzipTo(zipPath, dest string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	rootPrefix := commonZipRoot(r.File)

	for _, f := range r.File {
		name := f.Name
		if rootPrefix != "" {
			name = strings.TrimPrefix(name, rootPrefix)
		}
		if name == "" || strings.HasPrefix(name, "__MACOSX") || strings.Contains(name, ".DS_Store") {
			continue
		}

		target, err := safeJoin(dest, name)
		if err != nil {
			return err
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
		if err != nil {
			rc.Close()
			return err
		}
		_, copyErr := io.Copy(out, rc)
		out.Close()
		rc.Close()
		if copyErr != nil {
			return copyErr
		}
	}
	return nil
}

func commonZipRoot(files []*zip.File) string {
	var root string
	for _, f := range files {
		name := strings.TrimPrefix(f.Name, "./")
		if name == "" || strings.HasPrefix(name, "__MACOSX") {
			continue
		}
		parts := strings.SplitN(name, "/", 2)
		if len(parts) < 2 {
			return ""
		}
		if root == "" {
			root = parts[0]
			continue
		}
		if parts[0] != root {
			return ""
		}
	}
	if root == "" {
		return ""
	}
	return root + "/"
}

func safeJoin(root, rel string) (string, error) {
	clean := filepath.Clean(rel)
	if filepath.IsAbs(clean) || strings.HasPrefix(clean, "..") {
		return "", apierr.ErrBadRequest.WithDetail("Invalid path in zip.")
	}
	full := filepath.Join(root, clean)
	if !strings.HasPrefix(full, filepath.Clean(root)+string(os.PathSeparator)) && full != filepath.Clean(root) {
		return "", apierr.ErrBadRequest.WithDetail("Invalid path in zip.")
	}
	return full, nil
}

func sanitizeSegment(v string) string {
	return filepath.Base(strings.ReplaceAll(v, "..", ""))
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func hashToUUID(hexHash string) string {
	if len(hexHash) < 32 {
		hexHash += strings.Repeat("0", 32-len(hexHash))
	}
	return fmt.Sprintf("%s-%s-%s-%s-%s", hexHash[0:8], hexHash[8:12], hexHash[12:16], hexHash[16:20], hexHash[20:32])
}

func assetContentType(extOrPath string, isLaunch bool) string {
	if isLaunch {
		return "application/javascript"
	}
	ext := strings.ToLower(extOrPath)
	if !strings.HasPrefix(ext, ".") {
		if strings.Contains(ext, ".") {
			ext = filepath.Ext(ext)
		} else {
			ext = "." + ext
		}
	}
	switch ext {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".ttf":
		return "font/ttf"
	case ".otf":
		return "font/otf"
	case ".json":
		return "application/json"
	case ".js", ".hbc", ".bundle":
		return "application/javascript"
	default:
		if t := mime.TypeByExtension(ext); t != "" {
			return t
		}
		return "application/octet-stream"
	}
}

func acceptsMultipart(accept string) bool {
	return accept == "" || strings.Contains(accept, "multipart/mixed")
}

func acceptsJSON(accept string) bool {
	return strings.Contains(accept, "application/json") || strings.Contains(accept, "application/expo+json")
}
