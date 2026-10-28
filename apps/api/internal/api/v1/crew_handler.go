package v1

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/api/middleware"
	"github.com/victorgomez09/ski-tracker/internal/apierr"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
	"github.com/victorgomez09/ski-tracker/internal/service"
)

type CrewHandler struct {
	crewService *service.CrewService
}

func NewCrewHandler(crewService *service.CrewService) *CrewHandler {
	return &CrewHandler{
		crewService: crewService,
	}
}

type CreateCrewReq struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	ResortID      string `json:"resort_id"`
	CoverImageURL string `json:"cover_image_url"`
}

func (h *CrewHandler) CreateCrew(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	var req CreateCrewReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("name is required"))
		return
	}

	crew, err := h.crewService.CreateCrew(c.Request.Context(), req.Name, req.Description, req.ResortID, req.CoverImageURL, userID)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail(err.Error()))
		return
	}

	httputil.RespondCreated(c, crew, "")
}

func (h *CrewHandler) ListUserCrews(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	crews, err := h.crewService.ListUserCrews(c.Request.Context(), userID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, crews)
}

func (h *CrewHandler) GetCrew(c *gin.Context) {
	crewIDStr := c.Param("id")
	crewID, err := uuid.Parse(crewIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid crew id"))
		return
	}

	crew, err := h.crewService.GetCrew(c.Request.Context(), crewID)
	if err != nil {
		httputil.RespondError(c, apierr.ErrNotFound.WithDetail("crew not found"))
		return
	}

	httputil.RespondOK(c, crew)
}

type AddMemberReq struct {
	UserID string `json:"user_id" binding:"required"`
	Role   string `json:"role"`
}

func (h *CrewHandler) AddMember(c *gin.Context) {
	crewIDStr := c.Param("id")
	crewID, err := uuid.Parse(crewIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid crew id"))
		return
	}

	var req AddMemberReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("user_id is required"))
		return
	}

	targetUserID, err := uuid.Parse(req.UserID)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid user id"))
		return
	}

	err = h.crewService.AddMember(c.Request.Context(), crewID, targetUserID, req.Role)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail(err.Error()))
		return
	}

	httputil.RespondOK(c, gin.H{"added": true})
}

func (h *CrewHandler) RemoveMember(c *gin.Context) {
	crewIDStr := c.Param("id")
	crewID, err := uuid.Parse(crewIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid crew id"))
		return
	}

	targetUserIDStr := c.Param("userId")
	targetUserID, err := uuid.Parse(targetUserIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid user id"))
		return
	}

	requesterID := middleware.GetUserID(c)
	if requesterID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	err = h.crewService.RemoveMember(c.Request.Context(), crewID, targetUserID, requesterID)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("failed to remove member: %w", err))
		return
	}

	httputil.RespondOK(c, gin.H{"removed": true})
}

func (h *CrewHandler) JoinCrew(c *gin.Context) {
	crewIDStr := c.Param("id")
	crewID, err := uuid.Parse(crewIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid crew id"))
		return
	}

	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	err = h.crewService.AddMember(c.Request.Context(), crewID, userID, "member")
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail(err.Error()))
		return
	}

	httputil.RespondOK(c, gin.H{"joined": true})
}

func (h *CrewHandler) LeaveCrew(c *gin.Context) {
	crewIDStr := c.Param("id")
	crewID, err := uuid.Parse(crewIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid crew id"))
		return
	}

	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	err = h.crewService.RemoveMember(c.Request.Context(), crewID, userID, userID)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail(err.Error()))
		return
	}

	httputil.RespondOK(c, gin.H{"left": true})
}

type AddCrewPhotoReq struct {
	PhotoURL string `json:"photo_url" binding:"required"`
	Caption  string `json:"caption"`
}

func (h *CrewHandler) AddPhoto(c *gin.Context) {
	crewIDStr := c.Param("id")
	crewID, err := uuid.Parse(crewIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid crew id"))
		return
	}

	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	var req AddCrewPhotoReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("photo_url is required"))
		return
	}

	photo, err := h.crewService.AddPhoto(c.Request.Context(), crewID, userID, req.PhotoURL, req.Caption)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail(err.Error()))
		return
	}

	httputil.RespondCreated(c, photo, "")
}

func (h *CrewHandler) ListPhotos(c *gin.Context) {
	crewIDStr := c.Param("id")
	crewID, err := uuid.Parse(crewIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid crew id"))
		return
	}

	photos, err := h.crewService.ListPhotos(c.Request.Context(), crewID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, photos)
}

func (h *CrewHandler) GetCrewLeaderboard(c *gin.Context) {
	crewIDStr := c.Param("id")
	crewID, err := uuid.Parse(crewIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid crew id"))
		return
	}

	metric := c.DefaultQuery("metric", "distance")

	leaderboard, err := h.crewService.GetCrewLeaderboard(c.Request.Context(), crewID, metric)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, leaderboard)
}

func (h *CrewHandler) GetCrewLiveLocations(c *gin.Context) {
	crewIDStr := c.Param("id")
	crewID, err := uuid.Parse(crewIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid crew id"))
		return
	}

	locations, err := h.crewService.GetCrewLiveLocations(c.Request.Context(), crewID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, locations)
}
