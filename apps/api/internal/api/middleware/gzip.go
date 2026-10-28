package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// DecompressGzip inspects the Content-Encoding header and transparently decompresses
// gzipped request bodies for downstream handlers.
func DecompressGzip() gin.HandlerFunc {
	return func(c *gin.Context) {
		encoding := c.GetHeader("Content-Encoding")
		if strings.Contains(strings.ToLower(encoding), "gzip") {
			gzipReader, err := gzip.NewReader(c.Request.Body)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"error": "invalid gzip payload: " + err.Error(),
				})
				return
			}
			defer gzipReader.Close()

			// Replace body with decompressed reader
			c.Request.Body = io.NopCloser(gzipReader)
			// Remove Content-Encoding so upstream parsers don't get confused
			c.Request.Header.Del("Content-Encoding")
		}
		c.Next()
	}
}
