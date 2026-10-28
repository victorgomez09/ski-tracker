package pg

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type interactionStore struct {
	db *bun.DB
}

func (s *interactionStore) ToggleReaction(ctx context.Context, sessionID, userID uuid.UUID, reactionType string) (bool, error) {
	var existing models.SessionReaction
	err := s.db.NewSelect().
		Model(&existing).
		Where("session_id = ?", sessionID).
		Where("user_id = ?", userID).
		Where("reaction_type = ?", reactionType).
		Scan(ctx)

	if err == nil {
		// Already exists -> remove
		_, delErr := s.db.NewDelete().
			Model((*models.SessionReaction)(nil)).
			Where("id = ?", existing.ID).
			Exec(ctx)
		if delErr != nil {
			return false, fmt.Errorf("error removing reaction: %w", delErr)
		}
		return false, nil
	}

	// Does not exist -> insert
	newReaction := &models.SessionReaction{
		SessionID:    sessionID,
		UserID:       userID,
		ReactionType: reactionType,
	}
	_, insErr := s.db.NewInsert().Model(newReaction).Exec(ctx)
	if insErr != nil {
		return false, fmt.Errorf("error adding reaction: %w", insErr)
	}
	return true, nil
}

func (s *interactionStore) GetReactionsBySessionID(ctx context.Context, sessionID uuid.UUID) ([]models.SessionReaction, error) {
	var reactions []models.SessionReaction
	err := s.db.NewSelect().
		Model(&reactions).
		Relation("User").
		Where("session_id = ?", sessionID).
		Order("created_at ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting reactions: %w", err)
	}
	return reactions, nil
}

func (s *interactionStore) AddComment(ctx context.Context, comment *models.SessionComment) error {
	_, err := s.db.NewInsert().Model(comment).Exec(ctx)
	if err != nil {
		return fmt.Errorf("error adding comment: %w", err)
	}
	// Fetch user details for comment
	if comment.User == nil {
		var u models.User
		if errUser := s.db.NewSelect().Model(&u).Where("id = ?", comment.UserID).Scan(ctx); errUser == nil {
			comment.User = &u
		}
	}
	return nil
}

func (s *interactionStore) GetCommentsBySessionID(ctx context.Context, sessionID uuid.UUID) ([]models.SessionComment, error) {
	var comments []models.SessionComment
	err := s.db.NewSelect().
		Model(&comments).
		Relation("User").
		Where("session_id = ?", sessionID).
		Order("sc.created_at ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting comments: %w", err)
	}
	return comments, nil
}

func (s *interactionStore) DeleteComment(ctx context.Context, commentID, userID uuid.UUID) error {
	res, err := s.db.NewDelete().
		Model((*models.SessionComment)(nil)).
		Where("id = ?", commentID).
		Where("user_id = ?", userID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("error deleting comment: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("comment not found or unauthorized")
	}
	return nil
}
