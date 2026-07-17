package middleware

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/api/auth"
	"github.com/victorgomez09/ski-tracker/internal/apierr"
)

const (
	// Context keys for user info
	CtxUserID = "user_id"
)

// Auth returns a middleware that validates JWT tokens.
func Auth(jwtManager *auth.JWTManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			c.AbortWithStatusJSON(401, apierr.ErrUnauthorized.WithDetail("missing authorization header"))
			return
		}

		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			c.AbortWithStatusJSON(401, apierr.ErrUnauthorized.WithDetail("invalid authorization format"))
			return
		}

		claims, err := jwtManager.ValidateAccessToken(parts[1])
		if err != nil {
			fmt.Println("JWT validation error:", err)
			c.AbortWithStatusJSON(401, apierr.ErrUnauthorized.WithDetail(err.Error()))
			return
		}

		// Store user info in context
		c.Set(CtxUserID, claims.UserID)

		c.Next()
	}
}

// GetUserID extracts user ID from context.
func GetUserID(c *gin.Context) uuid.UUID {
	if v, ok := c.Get(CtxUserID); ok {
		return v.(uuid.UUID)
	}
	return uuid.Nil
}

// WSAuth validates a JWT token from the query parameter "token".
// Used for WebSocket/SSE routes where Authorization headers can't be set.
func WSAuth(jwtManager *auth.JWTManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Query("token")
		if token == "" {
			// Fallback: try Authorization header (for SSE clients that support it)
			header := c.GetHeader("Authorization")
			if header != "" {
				parts := strings.SplitN(header, " ", 2)
				if len(parts) == 2 {
					token = parts[1]
				}
			}
		}
		if token == "" {
			c.AbortWithStatusJSON(401, gin.H{"error": "authentication required"})
			return
		}
		claims, err := jwtManager.ValidateAccessToken(token)
		if err != nil {
			c.AbortWithStatusJSON(401, gin.H{"error": "invalid token"})
			return
		}
		c.Set(CtxUserID, claims.UserID)
		c.Next()
	}
}
