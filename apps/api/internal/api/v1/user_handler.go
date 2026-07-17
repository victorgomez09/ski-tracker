package v1

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/api/middleware"
	"github.com/victorgomez09/ski-tracker/internal/apierr"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/service"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type UserHandler struct {
	svc   *service.UserService
	store store.Store
}

func NewUserHandler(svc *service.UserService, s store.Store) *UserHandler {
	return &UserHandler{svc: svc, store: s}
}

func (h *UserHandler) GetMe(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := h.svc.GetByID(c.Request.Context(), userID)
	if err != nil {
		httputil.RespondError(c, apierr.ErrNotFound.WithDetail("user not found"))
		return
	}

	httputil.RespondOK(c, user)
}

func (h *UserHandler) GetByID(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		httputil.RespondError(c, fmt.Errorf("missing required path parameter: id"))
		return
	}

	userID, err := uuid.Parse(id)
	if err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid user ID: %w", err))
		return
	}

	user, err := h.svc.GetByID(c.Request.Context(), userID)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, user)
}

func (h *UserHandler) GetByEmail(c *gin.Context) {
	email := c.Query("email")
	if email == "" {
		httputil.RespondError(c, fmt.Errorf("missing required query parameter: email"))
		return
	}

	user, err := h.svc.GetByEmail(c.Request.Context(), email)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, user)
}

func (h *UserHandler) Login(c *gin.Context) {
	var input service.LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid request body: %w", err))
		return
	}

	authResult, err := h.svc.Login(c.Request.Context(), input)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, authResult)
}

func (h *UserHandler) Create(c *gin.Context) {
	var input service.RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid request body: %w", err))
		return
	}

	err := h.svc.Create(c.Request.Context(), input)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, gin.H{"message": "user created successfully"})
}

func (h *UserHandler) Update(c *gin.Context) {
	var user models.User
	if err := c.ShouldBindJSON(&user); err != nil {
		httputil.RespondError(c, fmt.Errorf("invalid request body: %w", err))
		return
	}

	err := h.svc.Update(c.Request.Context(), &user)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, user)
}

func (h *UserHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		httputil.RespondError(c, fmt.Errorf("missing required path parameter: id"))
		return
	}

	err := h.svc.Delete(c.Request.Context(), id)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, gin.H{"message": "user deleted successfully"})
}
