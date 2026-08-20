package v1

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
	"github.com/victorgomez09/ski-tracker/internal/service"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type VersionManifestHandler struct {
	svc   *service.VersionManifestService
	store store.Store
}

func NewVersionManifestHandler(svc *service.VersionManifestService, s store.Store) *VersionManifestHandler {
	return &VersionManifestHandler{svc: svc, store: s}
}

func (h *VersionManifestHandler) ListAll(c *gin.Context) {
	manifests, err := h.svc.ListAll(c.Request.Context())
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, manifests)
}

func (h *VersionManifestHandler) CheckVersion(c *gin.Context) {
	clientVersion := c.Query("version")
	platform := strings.ToLower(c.Query("platform"))
	if clientVersion == "" || (platform != "ios" && platform != "android") {
		httputil.RespondError(c, fmt.Errorf("Invalid parameters. Required: 'version' (e.g., 1.0.0) and 'platform' ('ios' or 'android')"))
		return
	}

	lang := c.DefaultQuery("lang", "es")
	if strings.HasPrefix(c.GetHeader("Accept-Language"), "en") {
		lang = "en"
	}

	response, err := h.svc.CheckVersion(c.Request.Context(), clientVersion, platform, lang)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, response)
}
