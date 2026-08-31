package service

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type FriendshipService struct {
	store  store.Store
	logger *slog.Logger
}

func NewFriendshipService(s store.Store, l *slog.Logger) *FriendshipService {
	return &FriendshipService{
		store:  s,
		logger: l,
	}
}

func (s *FriendshipService) ListFriends(ctx context.Context, userID uuid.UUID) ([]models.Friendship, error) {
	return s.store.Friendship().ListFriends(ctx, userID)
}

func (s *FriendshipService) ListRequests(ctx context.Context, userID uuid.UUID) ([]models.Friendship, error) {
	return s.store.Friendship().ListRequests(ctx, userID)
}

func (s *FriendshipService) SendRequest(ctx context.Context, requesterID, addresseeID uuid.UUID) (*models.Friendship, error) {
	if requesterID == addresseeID {
		return nil, errors.New("cannot add yourself as a friend")
	}

	existing, err := s.store.Friendship().GetByUsers(ctx, requesterID, addresseeID)
	if err != nil {
		return nil, err
	}

	if existing != nil {
		if existing.Status == "ACCEPTED" {
			return nil, errors.New("already friends")
		}
		if existing.Status == "BLOCKED" {
			return nil, errors.New("user is blocked")
		}
		// If previously rejected or pending, reset/allow sending again
		existing.RequesterID = requesterID
		existing.AddresseeID = addresseeID
		existing.Status = "PENDING"
		existing.UpdatedAt = time.Now()
		err = s.store.Friendship().Update(ctx, existing)
		if err != nil {
			return nil, err
		}
		return existing, nil
	}

	friendship := &models.Friendship{
		RequesterID: requesterID,
		AddresseeID: addresseeID,
		Status:      "PENDING",
	}

	err = s.store.Friendship().Create(ctx, friendship)
	if err != nil {
		return nil, err
	}

	return friendship, nil
}

func (s *FriendshipService) RespondRequest(ctx context.Context, friendshipID uuid.UUID, userID uuid.UUID, action string) error {
	friendship, err := s.store.Friendship().GetByID(ctx, friendshipID)
	if err != nil {
		return err
	}
	if friendship == nil {
		return errors.New("friendship request not found")
	}

	if friendship.AddresseeID != userID {
		return errors.New("unauthorized to respond to this request")
	}

	if friendship.Status != "PENDING" {
		return errors.New("request is not pending")
	}

	if action == "accept" {
		friendship.Status = "ACCEPTED"
	} else if action == "reject" {
		friendship.Status = "REJECTED"
	} else {
		return errors.New("invalid action")
	}

	friendship.UpdatedAt = time.Now()
	return s.store.Friendship().Update(ctx, friendship)
}

func (s *FriendshipService) DeleteFriendship(ctx context.Context, friendshipID uuid.UUID, userID uuid.UUID) error {
	friendship, err := s.store.Friendship().GetByID(ctx, friendshipID)
	if err != nil {
		return err
	}
	if friendship == nil {
		return errors.New("friendship not found")
	}

	if friendship.RequesterID != userID && friendship.AddresseeID != userID {
		return errors.New("unauthorized to delete this friendship")
	}

	return s.store.Friendship().Delete(ctx, friendshipID)
}

func (s *FriendshipService) BlockUser(ctx context.Context, currentUserID, blockUserID uuid.UUID) error {
	existing, err := s.store.Friendship().GetByUsers(ctx, currentUserID, blockUserID)
	if err != nil {
		return err
	}

	if existing != nil {
		existing.RequesterID = currentUserID
		existing.AddresseeID = blockUserID
		existing.Status = "BLOCKED"
		existing.UpdatedAt = time.Now()
		return s.store.Friendship().Update(ctx, existing)
	}

	friendship := &models.Friendship{
		RequesterID: currentUserID,
		AddresseeID: blockUserID,
		Status:      "BLOCKED",
	}

	return s.store.Friendship().Create(ctx, friendship)
}

func (s *FriendshipService) SearchUsers(ctx context.Context, query string, currentUserID uuid.UUID) ([]models.User, error) {
	return s.store.Friendship().SearchUsers(ctx, query, currentUserID)
}

func (s *FriendshipService) ListFriendsSessions(ctx context.Context, userID uuid.UUID) ([]models.SkiSession, error) {
	return s.store.SkiSession().ListFriendsSessions(ctx, userID)
}

func (s *FriendshipService) UpdateLiveLocation(ctx context.Context, userID uuid.UUID, lat, lon float64, resortID string) error {
	user, err := s.store.User().GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}
	user.LastLatitude = &lat
	user.LastLongitude = &lon
	user.LastResortID = resortID
	user.LastLocationTime = time.Now()
	return s.store.User().Update(ctx, user)
}

func (s *FriendshipService) GetFriendsLiveLocations(ctx context.Context, userID uuid.UUID, resortID string) ([]models.User, error) {
	return s.store.Friendship().GetFriendsLiveLocations(ctx, userID, resortID)
}

func (s *FriendshipService) GetFriendsLeaderboard(ctx context.Context, userID uuid.UUID, period string, metric string) ([]models.LeaderboardEntry, error) {
	return s.store.Friendship().GetFriendsLeaderboard(ctx, userID, period, metric)
}
