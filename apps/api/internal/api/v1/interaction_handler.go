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

type InteractionHandler struct {
	interactionService *service.InteractionService
}

func NewInteractionHandler(interactionService *service.InteractionService) *InteractionHandler {
	return &InteractionHandler{
		interactionService: interactionService,
	}
}

type ToggleReactionReq struct {
	ReactionType string `json:"reaction_type" binding:"required"`
}

func (h *InteractionHandler) ToggleReaction(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid session id"))
		return
	}

	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	var req ToggleReactionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid reaction request"))
		return
	}

	added, summary, err := h.interactionService.ToggleReaction(c.Request.Context(), sessionID, userID, req.ReactionType)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail(err.Error()))
		return
	}

	httputil.RespondOK(c, gin.H{
		"added":   added,
		"summary": summary,
	})
}

func (h *InteractionHandler) GetReactions(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid session id"))
		return
	}

	userID := middleware.GetUserID(c)

	reactions, err := h.interactionService.GetReactions(c.Request.Context(), sessionID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	summary, _ := h.interactionService.GetReactionSummary(c.Request.Context(), sessionID, userID)

	httputil.RespondOK(c, gin.H{
		"reactions": reactions,
		"summary":   summary,
	})
}

type AddCommentReq struct {
	Content string `json:"content" binding:"required"`
}

func (h *InteractionHandler) AddComment(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid session id"))
		return
	}

	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	var req AddCommentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("content is required"))
		return
	}

	comment, err := h.interactionService.AddComment(c.Request.Context(), sessionID, userID, req.Content)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail(err.Error()))
		return
	}

	httputil.RespondOK(c, comment)
}

func (h *InteractionHandler) GetComments(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid session id"))
		return
	}

	comments, err := h.interactionService.GetComments(c.Request.Context(), sessionID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, comments)
}

func (h *InteractionHandler) DeleteComment(c *gin.Context) {
	commentIDStr := c.Param("commentId")
	commentID, err := uuid.Parse(commentIDStr)
	if err != nil {
		httputil.RespondError(c, apierr.ErrBadRequest.WithDetail("invalid comment id"))
		return
	}

	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		httputil.RespondError(c, apierr.ErrUnauthorized)
		return
	}

	err = h.interactionService.DeleteComment(c.Request.Context(), commentID, userID)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("failed to delete comment: %w", err))
		return
	}

	httputil.RespondOK(c, gin.H{"deleted": true})
}
