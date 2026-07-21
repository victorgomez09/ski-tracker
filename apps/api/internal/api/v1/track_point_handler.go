package v1

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/api/middleware"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
	"github.com/victorgomez09/ski-tracker/internal/service"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type TrackPointHandler struct {
	svc   *service.TrackPointService
	store store.Store
}

func NewTrackPointHandler(svc *service.TrackPointService, s store.Store) *TrackPointHandler {
	return &TrackPointHandler{svc: svc, store: s}
}

func (h *TrackPointHandler) GetByID(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		httputil.RespondError(c, fmt.Errorf("missing required path parameter: id"))
		return
	}

	trackPointID, err := uuid.Parse(id)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid trackpoint ID: %w", err))
		return
	}

	trackPoint, err := h.svc.GetByID(c.Request.Context(), trackPointID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, trackPoint)
}

func (h *TrackPointHandler) GetByUser(c *gin.Context) {
	userID := middleware.GetUserID(c)

	trackPoints, err := h.svc.GetByUser(c.Request.Context(), userID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, trackPoints)
}

func (h *TrackPointHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input []service.CreateTrackPointInput
	if err := c.ShouldBindJSON(&input); err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid request body: %w", err))
		return
	}

	err := h.svc.Create(c.Request.Context(), input, userID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, gin.H{"message": "trackpoint created successfully"})
}

func (h *TrackPointHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		httputil.RespondError(c, fmt.Errorf("missing required path parameter: id"))
		return
	}

	trackPointID, err := uuid.Parse(id)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid trackpoint ID: %w", err))
		return
	}

	err = h.svc.Delete(c.Request.Context(), trackPointID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, gin.H{"message": "trackpoint deleted successfully"})
}
