package middleware

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/victorgomez09/ski-tracker/internal/apierr"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
)

// RateLimit returns middleware that limits requests per IP.
// maxAttempts per window duration.
func RateLimit(maxAttempts int, window time.Duration) gin.HandlerFunc {
	type entry struct {
		count int
		reset time.Time
	}
	var mu sync.Mutex
	attempts := make(map[string]*entry)

	// Cleanup old entries periodically
	go func() {
		ticker := time.NewTicker(window)
		defer ticker.Stop()
		for range ticker.C {
			mu.Lock()
			now := time.Now()
			for k, e := range attempts {
				if now.After(e.reset) {
					delete(attempts, k)
				}
			}
			mu.Unlock()
		}
	}()

	return func(c *gin.Context) {
		ip := c.ClientIP()
		mu.Lock()
		e, ok := attempts[ip]
		if !ok || time.Now().After(e.reset) {
			attempts[ip] = &entry{count: 1, reset: time.Now().Add(window)}
			mu.Unlock()
			c.Next()
			return
		}
		e.count++
		if e.count > maxAttempts {
			mu.Unlock()
			httputil.RespondError(c, apierr.ErrTooManyRequests.WithDetail("too many attempts, try again later"))
			c.Abort()
			return
		}
		mu.Unlock()
		c.Next()
	}
}
