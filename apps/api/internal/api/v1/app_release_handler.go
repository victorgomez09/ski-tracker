package v1

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
	"github.com/victorgomez09/ski-tracker/internal/service"
)

type AppReleaseHandler struct {
	svc        *service.AppReleaseService
	publicURL  string
	storageTmp string
}

func NewAppReleaseHandler(svc *service.AppReleaseService, publicURL string) *AppReleaseHandler {
	return &AppReleaseHandler{
		svc:        svc,
		publicURL:  publicURL,
		storageTmp: os.TempDir(),
	}
}

func (h *AppReleaseHandler) CheckUpdate(c *gin.Context) {
	platform := c.DefaultQuery("platform", "android")
	currentVersion := c.Query("current_version")
	currentRuntime := c.Query("current_runtime")
	currentBuild, _ := strconv.Atoi(c.DefaultQuery("current_build", "0"))

	res, err := h.svc.CheckUpdate(c.Request.Context(), platform, currentVersion, currentRuntime, currentBuild, h.baseURL(c))
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, res)
}

func (h *AppReleaseHandler) GetLatest(c *gin.Context) {
	platform := c.DefaultQuery("platform", "android")
	latest, err := h.svc.GetLatestRelease(c.Request.Context(), platform)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, latest)
}

func (h *AppReleaseHandler) DownloadLatest(c *gin.Context) {
	platform := c.Param("platform")
	if platform == "" {
		platform = "android"
	}

	reader, filename, size, contentType, err := h.svc.GetLatestArtifactReader(c.Request.Context(), platform)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	defer reader.Close()

	extraHeaders := map[string]string{
		"Content-Disposition": fmt.Sprintf("attachment; filename=\"%s\"", filename),
	}

	c.DataFromReader(200, size, contentType, reader, extraHeaders)
}

func (h *AppReleaseHandler) Publish(c *gin.Context) {
	file, err := c.FormFile("apk")
	if err != nil {
		file, err = c.FormFile("file")
		if err != nil {
			httputil.RespondError(c, fmt.Errorf("'apk' or 'file' binary is required"))
			return
		}
	}

	tmp, err := os.CreateTemp(h.storageTmp, "release-*.apk")
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	tmpPath := tmp.Name()
	tmp.Close()
	defer os.Remove(tmpPath)

	if err := c.SaveUploadedFile(file, tmpPath); err != nil {
		httputil.RespondError(c, err)
		return
	}

	version := c.PostForm("version")
	if version == "" {
		httputil.RespondError(c, fmt.Errorf("'version' is required (e.g. 1.0.1)"))
		return
	}

	buildNumber, _ := strconv.Atoi(c.DefaultQuery("build_number", c.PostForm("build_number")))
	platform := c.DefaultQuery("platform", c.DefaultPostForm("platform", "android"))

	forceUpdate := false
	switch strings.ToLower(c.PostForm("force_update")) {
	case "1", "true", "yes":
		forceUpdate = true
	}

	changelog := map[string][]string{}
	if raw := c.PostForm("changelog"); raw != "" {
		if err := json.Unmarshal([]byte(raw), &changelog); err != nil {
			httputil.RespondError(c, fmt.Errorf("changelog must be valid JSON map: {\"es\":[\"...\"],\"en\":[\"...\"]}"))
			return
		}
	}

	runtimeVersion := c.PostForm("runtime_version")

	release, err := h.svc.PublishRelease(c.Request.Context(), service.PublishReleaseInput{
		FilePath:       tmpPath,
		Platform:       platform,
		Version:        version,
		RuntimeVersion: runtimeVersion,
		BuildNumber:    buildNumber,
		ForceUpdate:    forceUpdate,
		Changelog:      changelog,
		Filename:       file.Filename,
	})
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondCreated(c, release, "")
}

func (h *AppReleaseHandler) baseURL(c *gin.Context) string {
	if h.publicURL != "" {
		return strings.TrimRight(h.publicURL, "/")
	}
	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return scheme + "://" + c.Request.Host
}
