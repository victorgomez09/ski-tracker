package v1

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/victorgomez09/ski-tracker/internal/api/middleware"
	"github.com/victorgomez09/ski-tracker/internal/httputil"
	"github.com/victorgomez09/ski-tracker/internal/store"
	"golang.org/x/net/websocket"
)

// ExplorerPlayerState representa el estado compacto de un jugador en una sala 3D.
type ExplorerPlayerState struct {
	Type           string  `json:"type,omitempty"`
	UserID         string  `json:"userId"`
	Name           string  `json:"name"`
	X              float64 `json:"x"`
	Y              float64 `json:"y"`
	Z              float64 `json:"z"`
	Heading        float64 `json:"heading"`
	SpeedKmh       int     `json:"speedKmh"`
	RiderMode      string  `json:"riderMode"`
	Stance         string  `json:"stance"`
	Roll           float64 `json:"roll"`
	Crouch         float64 `json:"crouch"`
	SkidAngle      float64 `json:"skidAngle"`
	IsGrounded     bool    `json:"isGrounded"`
	RidingLiftName string  `json:"ridingLiftName,omitempty"`
}

type explorerClient struct {
	userID string
	name   string
	conn   *websocket.Conn
	send   chan []byte
	state  ExplorerPlayerState
}

type explorerRoom struct {
	id         string
	resortID   string
	resortName string
	hostUserID string
	clients    map[string]*explorerClient
	createdAt  time.Time
}

type ExplorerInvite struct {
	ID           string    `json:"id"`
	RoomID       string    `json:"room_id"`
	ResortID     string    `json:"resort_id"`
	ResortName   string    `json:"resort_name"`
	FromUserID   string    `json:"from_user_id"`
	FromUserName string    `json:"from_user_name"`
	ToUserID     string    `json:"to_user_id"`
	CreatedAt    time.Time `json:"created_at"`
}

// ExplorerMultiplayerHandler gestiona salas WebSocket en vivo e invitaciones entre amigos.
type ExplorerMultiplayerHandler struct {
	store   store.Store
	mu      sync.RWMutex
	rooms   map[string]*explorerRoom
	invites map[string][]*ExplorerInvite
}

func NewExplorerMultiplayerHandler(st store.Store) *ExplorerMultiplayerHandler {
	return &ExplorerMultiplayerHandler{
		store:   st,
		rooms:   make(map[string]*explorerRoom),
		invites: make(map[string][]*ExplorerInvite),
	}
}

type createRoomReq struct {
	ResortID   string `json:"resort_id" binding:"required"`
	ResortName string `json:"resort_name"`
}

func (h *ExplorerMultiplayerHandler) CreateRoom(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req createRoomReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httputil.RespondError(c, err)
		return
	}

	roomID := uuid.NewString()[:8]
	h.mu.Lock()
	h.rooms[roomID] = &explorerRoom{
		id:         roomID,
		resortID:   req.ResortID,
		resortName: req.ResortName,
		hostUserID: userID.String(),
		clients:    make(map[string]*explorerClient),
		createdAt:  time.Now(),
	}
	h.mu.Unlock()

	httputil.RespondOK(c, gin.H{
		"room_id":     roomID,
		"resort_id":   req.ResortID,
		"resort_name": req.ResortName,
		"ws_path":     "/api/v1/ws/explorer/" + roomID,
	})
}

type inviteFriendReq struct {
	ToUserID   string `json:"to_user_id" binding:"required"`
	ResortID   string `json:"resort_id"`
	ResortName string `json:"resort_name"`
}

func (h *ExplorerMultiplayerHandler) InviteFriend(c *gin.Context) {
	userID := middleware.GetUserID(c)
	roomID := c.Param("id")
	var req inviteFriendReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httputil.RespondError(c, err)
		return
	}

	fromName := "Esquiador"
	if h.store != nil {
		if u, err := h.store.User().GetByID(c.Request.Context(), userID); err == nil && u != nil && u.DisplayName != "" {
			fromName = u.DisplayName
		}
	}

	h.mu.Lock()
	room, exists := h.rooms[roomID]
	resortID := req.ResortID
	resortName := req.ResortName
	if exists {
		if resortID == "" {
			resortID = room.resortID
		}
		if resortName == "" {
			resortName = room.resortName
		}
	}
	inv := &ExplorerInvite{
		ID:           uuid.NewString()[:8],
		RoomID:       roomID,
		ResortID:     resortID,
		ResortName:   resortName,
		FromUserID:   userID.String(),
		FromUserName: fromName,
		ToUserID:     req.ToUserID,
		CreatedAt:    time.Now(),
	}
	h.invites[req.ToUserID] = append(h.invites[req.ToUserID], inv)
	h.mu.Unlock()

	httputil.RespondOK(c, inv)
}

func (h *ExplorerMultiplayerHandler) ListInvites(c *gin.Context) {
	userID := middleware.GetUserID(c).String()
	cutoff := time.Now().Add(-30 * time.Minute)

	h.mu.Lock()
	raw := h.invites[userID]
	active := make([]*ExplorerInvite, 0, len(raw))
	for _, inv := range raw {
		if inv.CreatedAt.After(cutoff) {
			active = append(active, inv)
		}
	}
	h.invites[userID] = active
	h.mu.Unlock()

	httputil.RespondOK(c, active)
}

func (h *ExplorerMultiplayerHandler) DismissInvite(c *gin.Context) {
	userID := middleware.GetUserID(c).String()
	inviteID := c.Param("id")

	h.mu.Lock()
	raw := h.invites[userID]
	kept := make([]*ExplorerInvite, 0, len(raw))
	for _, inv := range raw {
		if inv.ID != inviteID {
			kept = append(kept, inv)
		}
	}
	h.invites[userID] = kept
	h.mu.Unlock()

	httputil.RespondOK(c, gin.H{"dismissed": inviteID})
}

func (h *ExplorerMultiplayerHandler) ServeWS(c *gin.Context) {
	userUUID := middleware.GetUserID(c)
	userID := userUUID.String()
	roomID := c.Param("roomId")
	resortID := c.Query("resortId")
	playerName := c.Query("name")

	if playerName == "" && h.store != nil {
		if u, err := h.store.User().GetByID(c.Request.Context(), userUUID); err == nil && u != nil && u.DisplayName != "" {
			playerName = u.DisplayName
		}
	}
	if playerName == "" {
		playerName = "Esquiador"
	}

	srv := websocket.Server{
		Handshake: func(_ *websocket.Config, _ *http.Request) error {
			return nil
		},
		Handler: func(ws *websocket.Conn) {
			client := &explorerClient{
				userID: userID,
				name:   playerName,
				conn:   ws,
				send:   make(chan []byte, 32),
				state: ExplorerPlayerState{
					Type:       "join",
					UserID:     userID,
					Name:       playerName,
					RiderMode:  "ski",
					Stance:     "regular",
					IsGrounded: true,
				},
			}

			h.mu.Lock()
			room, ok := h.rooms[roomID]
			if !ok {
				room = &explorerRoom{
					id:         roomID,
					resortID:   resortID,
					hostUserID: userID,
					clients:    make(map[string]*explorerClient),
					createdAt:  time.Now(),
				}
				h.rooms[roomID] = room
			}
			if len(room.clients) >= 16 && room.clients[userID] == nil {
				h.mu.Unlock()
				_ = ws.Close()
				return
			}
			room.clients[userID] = client

			// Snapshot inicial de todos los demás jugadores ya conectados
			snapshot := make([]ExplorerPlayerState, 0, len(room.clients))
			for uid, other := range room.clients {
				if uid != userID {
					snapshot = append(snapshot, other.state)
				}
			}
			h.mu.Unlock()

			if snapBytes, err := json.Marshal(gin.H{
				"type":    "room_snapshot",
				"roomId":  roomID,
				"players": snapshot,
			}); err == nil {
				select {
				case client.send <- snapBytes:
				default:
				}
			}

			if joinBytes, err := json.Marshal(client.state); err == nil {
				h.broadcastExcept(roomID, userID, joinBytes)
			}

			done := make(chan struct{})
			go func() {
				defer close(done)
				for msg := range client.send {
					if err := websocket.Message.Send(ws, string(msg)); err != nil {
						return
					}
				}
			}()

			for {
				var raw string
				if err := websocket.Message.Receive(ws, &raw); err != nil {
					break
				}
				var st ExplorerPlayerState
				if err := json.Unmarshal([]byte(raw), &st); err != nil {
					continue
				}
				st.Type = "state"
				st.UserID = userID
				if st.Name == "" {
					st.Name = playerName
				}

				h.mu.Lock()
				if r, exists := h.rooms[roomID]; exists {
					if cl, ok := r.clients[userID]; ok {
						cl.state = st
					}
				}
				h.mu.Unlock()

				if out, err := json.Marshal(st); err == nil {
					h.broadcastExcept(roomID, userID, out)
				}
			}

			h.mu.Lock()
			if r, exists := h.rooms[roomID]; exists {
				if curr, ok := r.clients[userID]; ok && curr == client {
					delete(r.clients, userID)
				}
				if len(r.clients) == 0 {
					delete(h.rooms, roomID)
				}
			}
			h.mu.Unlock()
			close(client.send)
			<-done

			if leaveBytes, err := json.Marshal(gin.H{
				"type":   "leave",
				"userId": userID,
			}); err == nil {
				h.broadcastExcept(roomID, userID, leaveBytes)
			}
		},
	}

	srv.ServeHTTP(c.Writer, c.Request)
}

func (h *ExplorerMultiplayerHandler) broadcastExcept(roomID, senderID string, payload []byte) {
	h.mu.RLock()
	room, ok := h.rooms[roomID]
	if !ok {
		h.mu.RUnlock()
		return
	}
	targets := make([]*explorerClient, 0, len(room.clients))
	for uid, cl := range room.clients {
		if uid != senderID {
			targets = append(targets, cl)
		}
	}
	h.mu.RUnlock()

	for _, cl := range targets {
		select {
		case cl.send <- payload:
		default:
			// Descartar frame antiguo si el cliente va lento
		}
	}
}
