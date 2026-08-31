package v1

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/api/middleware"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/service"
)

type FriendshipHandler struct {
	svc *service.FriendshipService
}

func NewFriendshipHandler(svc *service.FriendshipService) *FriendshipHandler {
	return &FriendshipHandler{svc: svc}
}

func (h *FriendshipHandler) ListFriends(c *gin.Context) {
	userID := middleware.GetUserID(c)
	friendships, err := h.svc.ListFriends(c.Request.Context(), userID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	httputil.RespondOK(c, friendships)
}

func (h *FriendshipHandler) ListRequests(c *gin.Context) {
	userID := middleware.GetUserID(c)
	friendships, err := h.svc.ListRequests(c.Request.Context(), userID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	incoming := make([]models.Friendship, 0)
	outgoing := make([]models.Friendship, 0)
	for _, f := range friendships {
		if f.AddresseeID == userID {
			incoming = append(incoming, f)
		} else if f.RequesterID == userID {
			outgoing = append(outgoing, f)
		}
	}
	httputil.RespondOK(c, gin.H{
		"incoming": incoming,
		"outgoing": outgoing,
	})
}

type requestPayload struct {
	AddresseeID string `json:"addressee_id" binding:"required"`
}

func (h *FriendshipHandler) SendRequest(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var payload requestPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		httputil.RespondError(c, err)
		return
	}
	addresseeUUID, err := uuid.Parse(payload.AddresseeID)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid addressee_id: %w", err))
		return
	}
	friendship, err := h.svc.SendRequest(c.Request.Context(), userID, addresseeUUID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	httputil.RespondOK(c, friendship)
}

type respondPayload struct {
	FriendshipID string `json:"friendship_id" binding:"required"`
	Action       string `json:"action" binding:"required"`
}

func (h *FriendshipHandler) RespondRequest(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var payload respondPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		httputil.RespondError(c, err)
		return
	}
	friendshipUUID, err := uuid.Parse(payload.FriendshipID)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid friendship_id: %w", err))
		return
	}
	err = h.svc.RespondRequest(c.Request.Context(), friendshipUUID, userID, payload.Action)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	httputil.RespondOK(c, gin.H{"status": "success"})
}

func (h *FriendshipHandler) DeleteFriendship(c *gin.Context) {
	userID := middleware.GetUserID(c)
	idStr := c.Param("id")
	friendshipUUID, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid friendship ID: %w", err))
		return
	}
	err = h.svc.DeleteFriendship(c.Request.Context(), friendshipUUID, userID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	httputil.RespondOK(c, gin.H{"status": "deleted"})
}

func (h *FriendshipHandler) BlockUser(c *gin.Context) {
	userID := middleware.GetUserID(c)
	blockUserStr := c.Param("userId")
	blockUserUUID, err := uuid.Parse(blockUserStr)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid block user ID: %w", err))
		return
	}
	err = h.svc.BlockUser(c.Request.Context(), userID, blockUserUUID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	httputil.RespondOK(c, gin.H{"status": "blocked"})
}

func (h *FriendshipHandler) SearchUsers(c *gin.Context) {
	userID := middleware.GetUserID(c)
	query := c.Query("q")
	if query == "" {
		httputil.RespondOK(c, make([]models.User, 0))
		return
	}
	users, err := h.svc.SearchUsers(c.Request.Context(), query, userID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	httputil.RespondOK(c, users)
}

func (h *FriendshipHandler) ListFriendsFeed(c *gin.Context) {
	userID := middleware.GetUserID(c)
	sessions, err := h.svc.ListFriendsSessions(c.Request.Context(), userID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	httputil.RespondOK(c, gin.H{
		"sessions": sessions,
	})
}

type locationPayload struct {
	Latitude  float64 `json:"latitude" binding:"required"`
	Longitude float64 `json:"longitude" binding:"required"`
	ResortID  string  `json:"resort_id" binding:"required"`
}

func (h *FriendshipHandler) UpdateLiveLocation(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var payload locationPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		httputil.RespondError(c, err)
		return
	}
	err := h.svc.UpdateLiveLocation(c.Request.Context(), userID, payload.Latitude, payload.Longitude, payload.ResortID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	httputil.RespondOK(c, gin.H{"status": "updated"})
}

func (h *FriendshipHandler) GetFriendsLiveLocations(c *gin.Context) {
	userID := middleware.GetUserID(c)
	resortID := c.Query("resort_id")
	if resortID == "" {
		httputil.RespondError(c, fmt.Errorf("missing query parameter: resort_id"))
		return
	}
	friends, err := h.svc.GetFriendsLiveLocations(c.Request.Context(), userID, resortID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	httputil.RespondOK(c, friends)
}

func (h *FriendshipHandler) GetFriendsLeaderboard(c *gin.Context) {
	userID := middleware.GetUserID(c)
	period := c.DefaultQuery("period", "season") // week, month, season
	metric := c.DefaultQuery("metric", "distance") // distance, vertical_drop, max_speed
	leaderboard, err := h.svc.GetFriendsLeaderboard(c.Request.Context(), userID, period, metric)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}
	httputil.RespondOK(c, leaderboard)
}
