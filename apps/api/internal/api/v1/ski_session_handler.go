package v1

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/api/middleware"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/service"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type SkiSessionHandler struct {
	svc   *service.SkiSessionService
	store store.Store
}

func NewSkiSessionHandler(svc *service.SkiSessionService, s store.Store) *SkiSessionHandler {
	return &SkiSessionHandler{svc: svc, store: s}
}

func (h *SkiSessionHandler) ListByResort(c *gin.Context) {
	resortID := c.Query("resort_id")
	if resortID == "" {
		httputil.RespondError(c, fmt.Errorf("resort_id query parameter is required"))
		return
	}

	ctx := c.Request.Context()
	sessions, err := h.store.SkiSession().ListByResortID(ctx, resortID)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("failed to list ski sessions: %w", err))
		return
	}

	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}

func (h *SkiSessionHandler) StartSession(c *gin.Context) {
	userID := middleware.GetUserID(c)

	// Expect JSON body: { "resortId": "<uuid>" }
	var payload struct {
		ResortID string `json:"resortId" binding:"required,uuid"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpErr := fmt.Errorf("invalid request body: %w", err)
		httputil.RespondError(c, httpErr)
		return
	}

	resortUUID, err := uuid.Parse(payload.ResortID)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid resort ID: %w", err))
		return
	}

	ctx := c.Request.Context()
	session, err := h.svc.StartSession(ctx, userID, resortUUID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error creating ski session"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":   "Ski session started successfully",
		"sessionId": session.ID,
		"startTime": session.StartTime,
	})
}

func (h *SkiSessionHandler) AddPoints(c *gin.Context) {
	sessionID := c.Param("id")
	var req service.BatchPointsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httputil.RespondError(c, fmt.Errorf("bad request: %w", err))
		return
	}

	sessionIDInt, err := uuid.Parse(sessionID)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid session ID: %w", err))
		return
	}

	var points []models.SessionPoint
	for _, p := range req.Points {
		geomWKT := fmt.Sprintf("POINT(%f %f)", p.Lon, p.Lat)

		points = append(points, models.SessionPoint{
			SessionID: sessionIDInt,
			Geom:      geomWKT,
			Altitude:  p.Altitude,
			Speed:     p.Speed,
			Timestamp: p.Timestamp,
		})
	}

	ctx := c.Request.Context()

	err = h.svc.AddPoints(ctx, points)

	if err != nil {
		httputil.RespondError(c, fmt.Errorf("failed to add points: %w", err))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"pointsProcessed": len(points),
	})
}

func (h *SkiSessionHandler) FinishSession(c *gin.Context) {
	sessionID := c.Param("id")
	ctx := c.Request.Context()

	now := time.Now()
	err := h.svc.FinishSession(ctx, uuid.MustParse(sessionID))

	if err != nil {
		httputil.RespondError(c, fmt.Errorf("failed to finish session: %w", err))
		return
	}

	httputil.RespondOK(c, gin.H{
		"message":   "Ski session finished successfully",
		"sessionId": sessionID,
		"endTime":   now,
	})
}
