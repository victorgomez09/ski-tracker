import * as THREE from 'three';
import { RiderMode, SkierAvatar, SnowboardStance } from './SkierAvatar.js';

export interface RemotePlayerPacket {
  type?: 'state' | 'join' | 'leave' | 'room_snapshot';
  userId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  speedKmh: number;
  riderMode: RiderMode;
  stance: SnowboardStance;
  roll: number;
  crouch: number;
  skidAngle: number;
  isGrounded: boolean;
  ridingLiftName?: string;
}

export interface MultiplayerSessionConfig {
  apiBaseUrl: string;
  token: string;
  roomId: string;
  resortId: string;
  playerName?: string;
}

export interface PeerSummary {
  userId: string;
  name: string;
  x: number;
  z: number;
  speedKmh: number;
  riderMode: RiderMode;
}

interface RemotePeer {
  userId: string;
  name: string;
  avatar: SkierAvatar;
  nametag: THREE.Sprite;
  lastSpeedLabel: number;
  targetPos: THREE.Vector3;
  currPos: THREE.Vector3;
  targetHeading: number;
  currHeading: number;
  targetRoll: number;
  currRoll: number;
  targetCrouch: number;
  currCrouch: number;
  targetSkid: number;
  currSkid: number;
  speedKmh: number;
  riderMode: RiderMode;
  stance: SnowboardStance;
  isGrounded: boolean;
}

/**
 * Gestor Multijugador en Tiempo Real (Fase 10.16):
 * - Conecta por WebSocket al Hub de sala en Go (`/api/v1/ws/explorer/:roomId`).
 * - Envía el estado del jugador local a ~20 Hz y suaviza a los amigos a 60 FPS
 *   mediante interpolación exponencial de posición, ángulo y postura articulada.
 * - Renderiza avatares 3D con nametag flotante y expone sus coordenadas para el minimapa.
 */
export class MultiplayerManager {
  public group: THREE.Group = new THREE.Group();
  private peers: Map<string, RemotePeer> = new Map();
  private ws: WebSocket | null = null;
  private config: MultiplayerSessionConfig | null = null;
  private lastSendAt = 0;
  private animTime = 0;
  private onStatusChange?: (status: string, peerCount: number) => void;

  constructor(onStatusChange?: (status: string, peerCount: number) => void) {
    this.onStatusChange = onStatusChange;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public getRoomId(): string | null {
    return this.config?.roomId ?? null;
  }

  public connect(cfg: MultiplayerSessionConfig) {
    this.disconnect();
    this.config = cfg;

    const wsBase = cfg.apiBaseUrl.replace(/^http/i, 'ws').replace(/\/$/, '');
    const params = new URLSearchParams({
      token: cfg.token,
      resortId: cfg.resortId,
    });
    if (cfg.playerName) params.set('name', cfg.playerName);

    const url = `${wsBase}/api/v1/ws/explorer/${encodeURIComponent(cfg.roomId)}?${params.toString()}`;
    this.onStatusChange?.('connecting', 0);

    try {
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onopen = () => {
        this.onStatusChange?.('connected', this.peers.size);
      };

      socket.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data));
          if (data.type === 'room_snapshot' && Array.isArray(data.players)) {
            data.players.forEach((p: RemotePlayerPacket) => this.upsertPeer(p));
            this.onStatusChange?.('connected', this.peers.size);
          } else if (data.type === 'leave' && data.userId) {
            this.removePeer(String(data.userId));
            this.onStatusChange?.('connected', this.peers.size);
          } else if (data.userId) {
            this.upsertPeer(data as RemotePlayerPacket);
          }
        } catch {
          // Ignorar paquete malformado
        }
      };

      socket.onclose = () => {
        if (this.ws === socket) {
          this.ws = null;
          this.onStatusChange?.('disconnected', 0);
        }
      };

      socket.onerror = () => {
        this.onStatusChange?.('error', this.peers.size);
      };
    } catch {
      this.onStatusChange?.('error', 0);
    }
  }

  public disconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
    this.peers.forEach((p) => {
      this.group.remove(p.avatar.group);
      this.group.remove(p.nametag);
    });
    this.peers.clear();
    this.onStatusChange?.('disconnected', 0);
  }

  private upsertPeer(pkt: RemotePlayerPacket) {
    let peer = this.peers.get(pkt.userId);
    const mode: RiderMode = pkt.riderMode === 'snowboard' ? 'snowboard' : 'ski';
    const stance: SnowboardStance = pkt.stance === 'goofy' ? 'goofy' : 'regular';

    if (!peer) {
      const avatar = new SkierAvatar();
      avatar.setRiderMode(mode, stance);
      avatar.group.position.set(pkt.x || 0, pkt.y || 0, pkt.z || 0);
      avatar.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
      });
      this.group.add(avatar.group);

      const nametag = this.createNametagSprite(pkt.name || 'Amigo', pkt.speedKmh || 0);
      nametag.position.set(pkt.x || 0, (pkt.y || 0) + 2.35, pkt.z || 0);
      this.group.add(nametag);

      peer = {
        userId: pkt.userId,
        name: pkt.name || 'Amigo',
        avatar,
        nametag,
        lastSpeedLabel: pkt.speedKmh || 0,
        targetPos: new THREE.Vector3(pkt.x || 0, pkt.y || 0, pkt.z || 0),
        currPos: new THREE.Vector3(pkt.x || 0, pkt.y || 0, pkt.z || 0),
        targetHeading: pkt.heading || 0,
        currHeading: pkt.heading || 0,
        targetRoll: pkt.roll || 0,
        currRoll: pkt.roll || 0,
        targetCrouch: pkt.crouch || 0.1,
        currCrouch: pkt.crouch || 0.1,
        targetSkid: pkt.skidAngle || 0,
        currSkid: pkt.skidAngle || 0,
        speedKmh: pkt.speedKmh || 0,
        riderMode: mode,
        stance,
        isGrounded: pkt.isGrounded ?? true,
      };
      this.peers.set(pkt.userId, peer);
      this.onStatusChange?.('connected', this.peers.size);
      return;
    }

    if (peer.riderMode !== mode || peer.stance !== stance) {
      peer.riderMode = mode;
      peer.stance = stance;
      peer.avatar.setRiderMode(mode, stance);
    }

    peer.targetPos.set(pkt.x, pkt.y, pkt.z);
    peer.targetHeading = pkt.heading;
    peer.targetRoll = pkt.roll;
    peer.targetCrouch = pkt.crouch;
    peer.targetSkid = pkt.skidAngle;
    peer.speedKmh = pkt.speedKmh;
    peer.isGrounded = pkt.isGrounded;

    if (Math.abs(peer.lastSpeedLabel - pkt.speedKmh) >= 4) {
      peer.lastSpeedLabel = pkt.speedKmh;
      this.updateNametagSprite(peer.nametag, peer.name, pkt.speedKmh);
    }
  }

  private removePeer(userId: string) {
    const peer = this.peers.get(userId);
    if (!peer) return;
    this.group.remove(peer.avatar.group);
    this.group.remove(peer.nametag);
    (peer.nametag.material as THREE.SpriteMaterial).map?.dispose();
    peer.nametag.material.dispose();
    this.peers.delete(userId);
  }

  private createNametagSprite(name: string, speedKmh: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthTest: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.2, 0.8, 1);
    this.updateNametagSprite(sprite, name, speedKmh);
    return sprite;
  }

  private updateNametagSprite(sprite: THREE.Sprite, name: string, speedKmh: number) {
    const mat = sprite.material as THREE.SpriteMaterial;
    const tex = mat.map as THREE.CanvasTexture;
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(11, 19, 34, 0.86)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 21px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = `${name.slice(0, 14)} · ${speedKmh} km/h`;
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 1);
    tex.needsUpdate = true;
  }

  public sendLocalState(pkt: Omit<RemotePlayerPacket, 'type' | 'userId' | 'name'>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    if (now - this.lastSendAt < 50) return; // Máximo ~20 Hz
    this.lastSendAt = now;

    this.ws.send(JSON.stringify({ type: 'state', ...pkt }));
  }

  public update(dt: number) {
    const clampedDt = Math.min(dt, 0.05);
    this.animTime += clampedDt;
    const smooth = 1 - Math.exp(-12 * clampedDt);

    this.peers.forEach((peer) => {
      peer.currPos.lerp(peer.targetPos, smooth);

      // Interpolación más corta para ángulo heading
      let diff = ((peer.targetHeading - peer.currHeading + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      peer.currHeading += diff * smooth;

      peer.currRoll = THREE.MathUtils.lerp(peer.currRoll, peer.targetRoll, smooth);
      peer.currCrouch = THREE.MathUtils.lerp(peer.currCrouch, peer.targetCrouch, smooth);
      peer.currSkid = THREE.MathUtils.lerp(peer.currSkid, peer.targetSkid, smooth);

      peer.avatar.group.position.copy(peer.currPos);
      peer.avatar.group.rotation.set(0, peer.currHeading, 0);
      peer.avatar.updatePose({
        roll: peer.currRoll,
        crouch: peer.currCrouch,
        skidAngle: peer.currSkid,
        steerInput: -peer.currRoll * 1.5,
        speedMs: peer.speedKmh / 3.6,
        isGrounded: peer.isGrounded,
        landingImpact: 0,
        isPushing: false,
        timeSec: this.animTime,
      });

      peer.nametag.position.set(peer.currPos.x, peer.currPos.y + 2.35, peer.currPos.z);
    });
  }

  public getPeersForUI(): PeerSummary[] {
    const list: PeerSummary[] = [];
    this.peers.forEach((p) => {
      list.push({
        userId: p.userId,
        name: p.name,
        x: p.currPos.x,
        z: p.currPos.z,
        speedKmh: p.speedKmh,
        riderMode: p.riderMode,
      });
    });
    return list;
  }

  public getPeerPosition(userId: string): { x: number; z: number; heading: number } | null {
    const p = this.peers.get(userId);
    if (!p) return null;
    return { x: p.currPos.x, z: p.currPos.z, heading: p.currHeading };
  }
}
