package v1

import (
	"github.com/gin-gonic/gin"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
	"github.com/victorgomez09/ski-tracker/internal/service"
	"github.com/victorgomez09/ski-tracker/internal/store"
)

type SkiResortHandler struct {
	svc   *service.SkiResortService
	store store.Store
}

func NewSkiResortHandler(svc *service.SkiResortService, s store.Store) *SkiResortHandler {
	return &SkiResortHandler{svc: svc, store: s}
}

func (h *SkiResortHandler) ListNearby(c *gin.Context) {
	latStr := c.Query("lat")
	lngStr := c.Query("lng")
	radStr := c.DefaultQuery("radius", "50")

	resorts, err := h.svc.List(c.Request.Context(), latStr, lngStr, radStr)
	if err != nil {
		httputil.RespondError(c, err)
		return
	}

	httputil.RespondOK(c, resorts)
}
