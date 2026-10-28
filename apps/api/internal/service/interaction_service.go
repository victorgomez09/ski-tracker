package service

import (
	"context"
	"errors"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/models"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type InteractionService struct {
	store  store.Store
	logger *slog.Logger
}

func NewInteractionService(s store.Store, l *slog.Logger) *InteractionService {
	return &InteractionService{
		store:  s,
		logger: l,
	}
}

// ToggleReaction adds or removes a reaction (kudo) on a session.
// Valid types: "fire", "ski", "snow", "clap".
func (s *InteractionService) ToggleReaction(ctx context.Context, sessionID, userID uuid.UUID, reactionType string) (bool, *models.ReactionSummary, error) {
	reactionType = strings.ToLower(strings.TrimSpace(reactionType))
	if reactionType != "fire" && reactionType != "ski" && reactionType != "snow" && reactionType != "clap" {
		return false, nil, errors.New("invalid reaction type (must be fire, ski, snow, or clap)")
	}

	added, err := s.store.Interaction().ToggleReaction(ctx, sessionID, userID, reactionType)
	if err != nil {
		return false, nil, err
	}

	summary, err := s.GetReactionSummary(ctx, sessionID, userID)
	if err != nil {
		return added, nil, err
	}

	return added, summary, nil
}

func (s *InteractionService) GetReactions(ctx context.Context, sessionID uuid.UUID) ([]models.SessionReaction, error) {
	return s.store.Interaction().GetReactionsBySessionID(ctx, sessionID)
}

func (s *InteractionService) GetReactionSummary(ctx context.Context, sessionID, currentUserID uuid.UUID) (*models.ReactionSummary, error) {
	reactions, err := s.store.Interaction().GetReactionsBySessionID(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	counts := map[string]int{
		"fire": 0,
		"ski":  0,
		"snow": 0,
		"clap": 0,
	}
	var userReactions []string

	for _, r := range reactions {
		counts[r.ReactionType]++
		if r.UserID == currentUserID {
			userReactions = append(userReactions, r.ReactionType)
		}
	}

	return &models.ReactionSummary{
		Counts:        counts,
		UserReactions: userReactions,
		Total:         len(reactions),
	}, nil
}

func (s *InteractionService) AddComment(ctx context.Context, sessionID, userID uuid.UUID, content string) (*models.SessionComment, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, errors.New("comment content cannot be empty")
	}

	comment := &models.SessionComment{
		SessionID: sessionID,
		UserID:    userID,
		Content:   content,
	}

	err := s.store.Interaction().AddComment(ctx, comment)
	if err != nil {
		return nil, err
	}

	return comment, nil
}

func (s *InteractionService) GetComments(ctx context.Context, sessionID uuid.UUID) ([]models.SessionComment, error) {
	return s.store.Interaction().GetCommentsBySessionID(ctx, sessionID)
}

func (s *InteractionService) DeleteComment(ctx context.Context, commentID, userID uuid.UUID) error {
	return s.store.Interaction().DeleteComment(ctx, commentID, userID)
}
