package pg

import (
	"context"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/victorgomez09/ski-tracker/internal/models"
)

type userStore struct {
	db *bun.DB
}

func (u *userStore) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	var user models.User
	err := u.db.NewSelect().Model(&user).Where("id = ?", id).Scan(ctx)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (u *userStore) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	err := u.db.NewSelect().Model(&user).Where("email = ?", email).Scan(ctx)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (u *userStore) Create(ctx context.Context, user *models.User) error {
	_, err := u.db.NewInsert().Model(user).Exec(ctx)
	return err
}

func (u *userStore) Update(ctx context.Context, user *models.User) error {
	_, err := u.db.NewUpdate().Model(user).Where("id = ?", user.ID).Exec(ctx)
	return err
}

func (u *userStore) Delete(ctx context.Context, id string) error {
	_, err := u.db.NewDelete().Model((*models.User)(nil)).Where("id = ?", id).Exec(ctx)
	return err
}
