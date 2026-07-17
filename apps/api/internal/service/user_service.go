package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/api/auth"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
	"golang.org/x/crypto/bcrypt"
)

type RegisterInput struct {
	Email       string `json:"email" binding:"required,email"`
	Password    string `json:"password" binding:"required,min=8"`
	DisplayName string `json:"display_name" binding:"required"`
	FirstName   string `json:"first_name" binding:"required"`
	LastName    string `json:"last_name" binding:"required"`
}

type LoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type AuthResult struct {
	User         *models.User `json:"user,omitempty"`
	AccessToken  string       `json:"access_token,omitempty"`
	RefreshToken string       `json:"refresh_token,omitempty"`
	ExpiresAt    time.Time    `json:"expires_at,omitempty"`
}

type UserService struct {
	store      store.Store
	jwtManager *auth.JWTManager
	logger     *slog.Logger
}

func NewUserService(store store.Store, jwtManager *auth.JWTManager, logger *slog.Logger) *UserService {
	return &UserService{
		store:      store,
		jwtManager: jwtManager,
		logger:     logger,
	}
}

func (s *UserService) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	user, err := s.store.User().GetByID(ctx, id)
	if err != nil {
		s.logger.Error("failed to get user by ID", "user_id", id, "error", err)
		return nil, err
	}
	return user, nil
}

func (s *UserService) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	user, err := s.store.User().GetByEmail(ctx, email)
	if err != nil {
		s.logger.Error("failed to get user by email", "email", email, "error", err)
		return nil, err
	}
	return user, nil
}

func (s *UserService) Create(ctx context.Context, input RegisterInput) error {
	_, err := s.store.User().GetByEmail(ctx, input.Email)
	if err == nil {
		s.logger.Error("email already registered", "email", input.Email, "error", err)
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	user := &models.User{
		Email:        input.Email,
		DisplayName:  input.DisplayName,
		FirstName:    input.FirstName,
		LastName:     input.LastName,
		PasswordHash: hash,
	}
	err = s.store.User().Create(ctx, user)
	if err != nil {
		s.logger.Error("failed to create user", "email", input.Email, "error", err)
		return err
	}
	return nil
}

func (s *UserService) Login(ctx context.Context, input LoginInput) (*AuthResult, error) {
	user, err := s.store.User().GetByEmail(ctx, input.Email)
	if err != nil {
		s.logger.Error("invalid credentials")
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword(user.PasswordHash, []byte(input.Password)); err != nil {
		s.logger.Error("invalid credentials")
		return nil, err
	}

	tokens, err := s.jwtManager.GenerateTokenPair(user.ID)
	if err != nil {
		return nil, err
	}

	s.logger.Info("user logged in", slog.String("email", input.Email))

	return &AuthResult{
		User:         user,
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		ExpiresAt:    tokens.ExpiresAt,
	}, nil
}

func (s *UserService) Update(ctx context.Context, user *models.User) error {
	err := s.store.User().Update(ctx, user)
	if err != nil {
		s.logger.Error("failed to update user", "user_id", user.ID, "error", err)
		return err
	}
	return nil
}

func (s *UserService) Delete(ctx context.Context, id string) error {
	err := s.store.User().Delete(ctx, id)
	if err != nil {
		s.logger.Error("failed to delete user", "user_id", id, "error", err)
		return err
	}
	return nil
}
