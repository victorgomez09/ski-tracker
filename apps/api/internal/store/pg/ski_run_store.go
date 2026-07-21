package pg

import (
	"context"

	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type skiRunStore struct {
	db *bun.DB
}

func (u *skiRunStore) Create(ctx context.Context, run *models.SkiRun) (*models.SkiRun, error) {
	_, err := u.db.NewInsert().Model(run).Exec(ctx)
	if err != nil {
		return nil, err
	}
	return run, nil
}
