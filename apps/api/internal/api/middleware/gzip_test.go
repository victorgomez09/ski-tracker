package middleware_test

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/victorgomez09/ski-tracker/internal/api/middleware"
)

func TestDecompressGzip(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("decompresses gzipped body transparently", func(t *testing.T) {
		r := gin.New()
		r.Use(middleware.DecompressGzip())

		var receivedBody string
		r.POST("/test", func(c *gin.Context) {
			b, err := io.ReadAll(c.Request.Body)
			if err != nil {
				c.Status(http.StatusInternalServerError)
				return
			}
			receivedBody = string(b)
			c.Status(http.StatusOK)
		})

		rawText := `{"points":[{"lat":42.5,"lon":1.5,"altitude":2000}]}`
		var buf bytes.Buffer
		gz := gzip.NewWriter(&buf)
		_, err := gz.Write([]byte(rawText))
		if err != nil {
			t.Fatalf("failed to write gzip: %v", err)
		}
		gz.Close()

		req := httptest.NewRequest(http.MethodPost, "/test", &buf)
		req.Header.Set("Content-Encoding", "gzip")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", w.Code)
		}
		if receivedBody != rawText {
			t.Fatalf("expected body %q, got %q", rawText, receivedBody)
		}
	})

	t.Run("passes through uncompressed body unchanged", func(t *testing.T) {
		r := gin.New()
		r.Use(middleware.DecompressGzip())

		var receivedBody string
		r.POST("/test", func(c *gin.Context) {
			b, _ := io.ReadAll(c.Request.Body)
			receivedBody = string(b)
			c.Status(http.StatusOK)
		})

		rawText := `plain uncompressed body`
		req := httptest.NewRequest(http.MethodPost, "/test", bytes.NewBufferString(rawText))
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", w.Code)
		}
		if receivedBody != rawText {
			t.Fatalf("expected body %q, got %q", rawText, receivedBody)
		}
	})
}
