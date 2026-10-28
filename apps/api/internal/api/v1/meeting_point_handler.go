package v1

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/api/middleware"
	"github.com/victorgomez09/ski-tracker/internal/apierr"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/service"
)

type MeetingPointHandler struct {
	service *service.MeetingPointService
	logger  *slog.Logger
}

func NewMeetingPointHandler(svc *service.MeetingPointService, logger *slog.Logger) *MeetingPointHandler {
	return &MeetingPointHandler{
		service: svc,
		logger:  logger,
	}
}

type CreateMeetingPointReq struct {
	ResortID    string     `json:"resort_id" binding:"required"`
	Title       string     `json:"title" binding:"required"`
	Description string     `json:"description"`
	Latitude    float64    `json:"latitude" binding:"required"`
	Longitude   float64    `json:"longitude" binding:"required"`
	MeetTime    string     `json:"meet_time"`
	CrewID      *uuid.UUID `json:"crew_id"`
}

func (h *MeetingPointHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	var req CreateMeetingPointReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail(err.Error()))
		return
	}

	point := &models.MeetingPoint{
		CreatedBy:   userID,
		CrewID:      req.CrewID,
		ResortID:    req.ResortID,
		Title:       req.Title,
		Description: req.Description,
		Latitude:    req.Latitude,
		Longitude:   req.Longitude,
		MeetTime:    req.MeetTime,
	}

	if err := h.service.Create(c.Request.Context(), point); err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail(err.Error()))
		return
	}

	// Fetch fresh with relations
	created, err := h.service.GetByID(c.Request.Context(), point.ID)
	if err == nil && created != nil {
		created.CanDelete = true
		httputil.RespondCreated(c, created, "")
		return
	}

	point.CanDelete = true
	httputil.RespondCreated(c, point, "")
}

func (h *MeetingPointHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	resortID := c.Query("resort_id")

	points, err := h.service.ListForUser(c.Request.Context(), userID, resortID)
	if err != nil {
		httputil.RespondError(c, apierr.ErrInternal.WithDetail(err.Error()))
		return
	}

	httputil.RespondOK(c, points)
}

func (h *MeetingPointHandler) GetByID(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid id"))
		return
	}

	point, err := h.service.GetByID(c.Request.Context(), id)
	if err != nil {
		httputil.RespondError(c, apierr.ErrNotFound.WithDetail("meeting point not found"))
		return
	}

	point.CanDelete = (point.CreatedBy == userID)
	httputil.RespondOK(c, point)
}

func (h *MeetingPointHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid id"))
		return
	}

	if err := h.service.Delete(c.Request.Context(), id, userID); err != nil {
		httputil.RespondError(c, apierr.ErrForbidden.WithDetail(err.Error()))
		return
	}

	httputil.RespondOK(c, gin.H{"deleted": true})
}
