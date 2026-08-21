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

type OTAHandler struct {
	svc        *service.OTAService
	publicURL  string
	storageTmp string
}

func NewOTAHandler(svc *service.OTAService, publicURL string) *OTAHandler {
	return &OTAHandler{svc: svc, publicURL: publicURL, storageTmp: os.TempDir()}
}

func (h *OTAHandler) Manifest(c *gin.Context) {
	protocolVersion := 0
	if v := headerOrQuery(c, "expo-protocol-version", ""); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil {
			protocolVersion = parsed
		}
	}

	platform := strings.ToLower(headerOrQuery(c, "expo-platform", "platform"))
	runtimeVersion := headerOrQuery(c, "expo-runtime-version", "runtime-version")

	err := h.svc.WriteManifestResponse(c.Writer, service.ManifestRequest{
		ProtocolVersion: protocolVersion,
		Platform:        platform,
		RuntimeVersion:  runtimeVersion,
		CurrentUpdateID: headerOrQuery(c, "expo-current-update-id", ""),
		EmbeddedID:      headerOrQuery(c, "expo-embedded-update-id", ""),
		Accept:          c.GetHeader("Accept"),
		BaseURL:         h.baseURL(c),
	})
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	c.Abort()
}

func (h *OTAHandler) Assets(c *gin.Context) {
	err := h.svc.ServeAsset(
		c.Writer,
		c.Query("runtimeVersion"),
		strings.ToLower(c.Query("platform")),
		c.Query("asset"),
	)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	c.Abort()
}

func (h *OTAHandler) Publish(c *gin.Context) {
	file, err := c.FormFile("bundle")
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("'bundle' zip file is required"))
		return
	}

	tmp, err := os.CreateTemp(h.storageTmp, "ota-*.zip")
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

	changelog := map[string][]string{}
	if raw := c.PostForm("changelog"); raw != "" {
		if err := json.Unmarshal([]byte(raw), &changelog); err != nil {
			httputil.RespondError(c, fmt.Errorf("changelog must be JSON: {\"en\":[\"...\"],\"es\":[\"...\"]}"))
			return
		}
	}

	forceUpdate := false
	switch strings.ToLower(c.PostForm("force_update")) {
	case "1", "true", "yes":
		forceUpdate = true
	}

	dest, err := h.svc.Publish(service.PublishOTAInput{
		ZipPath:        tmpPath,
		RuntimeVersion: c.PostForm("runtime_version"),
		ForceUpdate:    forceUpdate,
		Version:        c.PostForm("version"),
		Changelog:      changelog,
	})
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, gin.H{
		"message":         "OTA update published",
		"path":            dest,
		"runtime_version": c.PostForm("runtime_version"),
		"force_update":    forceUpdate,
	})
}

func (h *OTAHandler) baseURL(c *gin.Context) string {
	if h.publicURL != "" {
		return strings.TrimRight(h.publicURL, "/")
	}
	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return scheme + "://" + c.Request.Host
}

func headerOrQuery(c *gin.Context, header, query string) string {
	if v := c.GetHeader(header); v != "" {
		return v
	}
	if query != "" {
		return c.Query(query)
	}
	return ""
}
