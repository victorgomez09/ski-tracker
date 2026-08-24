# Build stage
FROM golang:alpine AS builder

WORKDIR /app

# Install git and ca-certificates
RUN apk add --no-cache git ca-certificates

# Copy dependency definitions
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server ./cmd/server

# Final stage
FROM alpine:3.21

WORKDIR /app

RUN apk --no-cache add ca-certificates tzdata

# Copy binary from builder
COPY --from=builder /app/server /app/server

# Create directory for updates / uploads if needed
RUN mkdir -p /app/updates

EXPOSE 8080

ENTRYPOINT ["/app/server"]
