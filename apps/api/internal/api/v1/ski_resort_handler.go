package v1

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/api/middleware"
	"github.com/victorgomez09/ski-tracker/internal/apierr"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
	"github.com/victorgomez09/ski-tracker/internal/service"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type SkiResortHandler struct {
	svc   *service.SkiResortService
	store store.Store
}

func NewSkiResortHandler(svc *service.SkiResortService, s store.Store) *SkiResortHandler {
	return &SkiResortHandler{svc: svc, store: s}
}

func (h *SkiResortHandler) GetByID(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		httputil.RespondError(c, fmt.Errorf("missing required query parameter: id"))
		return
	}

	resort, err := h.svc.GetByID(c.Request.Context(), id)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, resort)
}

func (h *SkiResortHandler) ListByName(c *gin.Context) {
	name := c.Query("name")
	if name == "" {
		httputil.RespondError(c, fmt.Errorf("missing required query parameter: name"))
		return
	}

	resorts, err := h.svc.ListByName(c.Request.Context(), name)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, resorts)
}

func (h *SkiResortHandler) ListNearby(c *gin.Context) {
	latStr := c.Query("lat")
	lngStr := c.Query("lon")
	radStr := c.DefaultQuery("radius", "50")

	resorts, err := h.svc.List(c.Request.Context(), latStr, lngStr, radStr)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, resorts)
}

func (h *SkiResortHandler) ListByBBox(c *gin.Context) {
	minLat := c.Query("minLat")
	maxLat := c.Query("maxLat")
	minLon := c.Query("minLon")
	maxLon := c.Query("maxLon")

	if minLat == "" || maxLat == "" || minLon == "" || maxLon == "" {
		httputil.RespondError(c, fmt.Errorf("missing required query parameters: minLat, maxLat, minLon, maxLon"))
		return
	}

	resorts, err := h.svc.ListByBBox(c.Request.Context(), minLat, maxLat, minLon, maxLon)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, resorts)
}

func (h *SkiResortHandler) GetByCloseness(c *gin.Context) {
	latStr := c.Query("lat")
	lngStr := c.Query("lon")
	if latStr == "" || lngStr == "" {
		httputil.RespondError(c, fmt.Errorf("missing required query parameters: lat, lon"))
		return
	}

	resort, err := h.svc.GetByCloseness(c.Request.Context(), latStr, lngStr)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, resort)
}

func (h *SkiResortHandler) ListFavorites(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	resorts, err := h.svc.ListFavorites(c.Request.Context(), userID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, resorts)
}

func (h *SkiResortHandler) AddFavorite(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	id := c.Param("id")
	if id == "" {
		httputil.RespondError(c, fmt.Errorf("missing required path parameter: id"))
		return
	}

	if err := h.svc.AddFavorite(c.Request.Context(), userID, id); err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, gin.H{"status": "ok"})
}

func (h *SkiResortHandler) RemoveFavorite(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	id := c.Param("id")
	if id == "" {
		httputil.RespondError(c, fmt.Errorf("missing required path parameter: id"))
		return
	}

	if err := h.svc.RemoveFavorite(c.Request.Context(), userID, id); err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, gin.H{"status": "ok"})
}

