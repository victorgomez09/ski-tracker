package apierr

import "net/http"

// ProblemDetail represents an RFC 9457 problem detail response.
type ProblemDetail struct {
	Type     string       `json:"type"`
	Title    string       `json:"title"`
	Status   int          `json:"status"`
	Detail   string       `json:"detail"`
	Instance string       `json:"instance,omitempty"`
	Errors   []FieldError `json:"errors,omitempty"`
}

// FieldError represents a validation error on a specific field.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Error implements the error interface.
func (p *ProblemDetail) Error() string {
	return p.Detail
}

// WithDetail returns a copy with a specific detail message.
func (p *ProblemDetail) WithDetail(detail string) *ProblemDetail {
	cp := *p
	cp.Detail = detail
	return &cp
}

// WithInstance returns a copy with a trace/request ID for debugging.
func (p *ProblemDetail) WithInstance(instance string) *ProblemDetail {
	cp := *p
	cp.Instance = instance
	return &cp
}

// WithFieldErrors returns a copy with validation field errors.
func (p *ProblemDetail) WithFieldErrors(errs []FieldError) *ProblemDetail {
	cp := *p
	cp.Errors = errs
	return &cp
}

// Pre-defined error types.
var (
	ErrBadRequest = &ProblemDetail{
		Type: "https://api-ski-tracker.viti-tech.es/errors/bad-request", Title: "Bad Request", Status: http.StatusBadRequest,
	}
	ErrValidation = &ProblemDetail{
		Type: "https://api-ski-tracker.viti-tech.es/errors/validation-failed", Title: "Validation Failed", Status: http.StatusBadRequest,
	}
	ErrUnauthorized = &ProblemDetail{
		Type: "https://api-ski-tracker.viti-tech.es/errors/unauthorized", Title: "Unauthorized", Status: http.StatusUnauthorized,
	}
	ErrForbidden = &ProblemDetail{
		Type: "https://api-ski-tracker.viti-tech.es/errors/forbidden", Title: "Forbidden", Status: http.StatusForbidden,
	}
	ErrNotFound = &ProblemDetail{
		Type: "https://api-ski-tracker.viti-tech.es/errors/not-found", Title: "Not Found", Status: http.StatusNotFound,
	}
	ErrNotAcceptable = &ProblemDetail{
		Type: "https://api-ski-tracker.viti-tech.es/errors/not-acceptable", Title: "Not Acceptable", Status: http.StatusNotAcceptable,
	}
	ErrConflict = &ProblemDetail{
		Type: "https://api-ski-tracker.viti-tech.es/errors/conflict", Title: "Conflict", Status: http.StatusConflict,
	}
	ErrInternal = &ProblemDetail{
		Type: "https://api-ski-tracker.viti-tech.es/errors/internal", Title: "Internal Server Error", Status: http.StatusInternalServerError,
	}
	ErrTooManyRequests = &ProblemDetail{
		Type: "https://api-ski-tracker.viti-tech.es/errors/too-many-requests", Title: "Too Many Requests", Status: http.StatusTooManyRequests,
	}
)
