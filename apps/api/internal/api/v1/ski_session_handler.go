package v1

import (
	"encoding/json"
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

type SkiSessionDto struct {
	ID            uuid.UUID  `json:"id"`
	StartTime     time.Time  `json:"start_time"`
	EndTime       *time.Time `json:"end_time"`
	TotalDistance float64    `json:"total_distance"`
	MaxSpeed      float64    `json:"max_speed"`
	VerticalDrop  float64    `json:"vertical_drop"`
	CreatedAt     time.Time  `json:"created_at"`

	User   models.User           `json:"user"`
	Points []models.SessionPoint `json:"points,omitempty"`
	Runs   []models.SkiRun       `json:"runs,omitempty"`
}

type SkiSessionHandler struct {
	svc   *service.SkiSessionService
	store store.Store
}

func NewSkiSessionHandler(svc *service.SkiSessionService, s store.Store) *SkiSessionHandler {
	return &SkiSessionHandler{svc: svc, store: s}
}

func (h *SkiSessionHandler) List(c *gin.Context) {
	ctx := c.Request.Context()
	sessions, err := h.svc.List(ctx)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("failed to list ski sessions: %w", err))
		return
	}

	httputil.RespondOK(c, gin.H{"sessions": sessions})
}

func (h *SkiSessionHandler) ListByResort(c *gin.Context) {
	resortID := c.Query("resort_id")
	userID := middleware.GetUserID(c)
	ctx := c.Request.Context()

	var sessions []models.SkiSession
	var err error

	if resortID == "" {
		sessions, err = h.store.SkiSession().ListByUserID(ctx, userID)
	} else {
		sessions, err = h.store.SkiSession().ListByResortID(ctx, resortID, userID)
	}

	if err != nil {
		httputil.RespondError(c, fmt.Errorf("failed to list ski sessions: %w", err))
		return
	}

	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}

func (h *SkiSessionHandler) StartSession(c *gin.Context) {
	userID := middleware.GetUserID(c)

	// Expect JSON body: { "resortId": "<uuid>", "isPublic": true }
	var payload struct {
		ResortID string `json:"resortId" binding:"required"`
		IsPublic *bool  `json:"isPublic"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpErr := fmt.Errorf("invalid request body: %w", err)
		httputil.RespondError(c, httpErr)
		return
	}

	isPublic := true
	if payload.IsPublic != nil {
		isPublic = *payload.IsPublic
	}

	ctx := c.Request.Context()
	session, err := h.svc.StartSession(ctx, userID, payload.ResortID, isPublic)
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

	pointsJSON := c.PostForm("points")
	if pointsJSON == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing points data in request"})
		return
	}

	var req service.BatchPointsRequest
	if err := json.Unmarshal([]byte(pointsJSON), &req); err != nil {
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

	form, err := c.MultipartForm()
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("failed to read multipart form: %w", err))
		return
	}
	files := form.File["photos"]
	fmt.Printf("Photos from session: %s with %d photos\n", sessionID, len(files))

	err = h.svc.AddPointsAndPhotos(c.Request.Context(), points, files)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("failed to add points and photos: %w", err))
		return
	}

	httputil.RespondOK(c, gin.H{
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

func (h *SkiSessionHandler) GetSession(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid session ID: %w", err))
		return
	}

	ctx := c.Request.Context()
	session, err := h.store.SkiSession().GetByID(ctx, sessionID)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("failed to get session: %w", err))
		return
	}

	userID := middleware.GetUserID(c)
	if !session.IsPublic && session.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "This session is private"})
		return
	}

	points, err := h.store.SessionPoint().GetBySessionID(ctx, sessionID)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("failed to get session points: %w", err))
		return
	}

	session.Points = points

	httputil.RespondOK(c, session)
}

func (h *SkiSessionHandler) GetPhoto(c *gin.Context) {
	objectName := c.Param("path")
	if objectName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing path parameter"})
		return
	}

	ctx := c.Request.Context()
	object, err := h.svc.GetPhotoReader(ctx, objectName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Photo not found"})
		return
	}
	defer object.Close()

	stat, err := object.Stat()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve photo metadata"})
		return
	}

	c.DataFromReader(http.StatusOK, stat.Size, stat.ContentType, object, nil)
}
